#!/usr/bin/env node
// Imports openly licensed pages from the wikis listed in sources.json into
// Wiki.js as unpublished drafts under drafts/imports/, and keeps a review
// queue page at drafts/review-queue.
//
// Nothing is ever published by this tool. A reviewer fact-checks each draft,
// moves it to its final path and publishes it by hand.
//
// Usage:
//   node src/import.js                       import new pages, refresh drafts, check sources for changes
//   node src/import.js --dry-run             do everything except write to Wiki.js or the state file
//   node src/import.js --check-sources       only check each source's licence and robots.txt
//   node src/import.js --source <id>         only this source
//   node src/import.js --mark-reviewed <path> clear "source changed" for a page after review (or "all")
//   node src/import.js --env /path/file      settings file (default: .env.local in this folder)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_DIR, loadEnv, buildConfig, loadSources } from './config.js';
import { PoliteClient } from './http.js';
import { MediaWiki } from './mediawiki.js';
import { checkLicence } from './licence.js';
import { cleanHtml, privacySkipReason } from './clean.js';
import { renderDraft, renderQueue, slugify, checklistItems } from './render.js';
import { WikiJs } from './wikijs.js';
import { loadState, saveState } from './state.js';

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const DAY = 86_400_000;

export function parseArgs(argv) {
  const a = { dryRun: false, checkSources: false, source: null, markReviewed: null, env: path.resolve(APP_DIR, '.env.local') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry-run') a.dryRun = true;
    else if (k === '--check-sources') a.checkSources = true;
    else if (k === '--source') a.source = argv[++i];
    else if (k === '--mark-reviewed') a.markReviewed = argv[++i];
    else if (k === '--env') a.env = path.resolve(argv[++i]);
    else throw new Error(`unknown option ${k}`);
  }
  return a;
}

const unique = (arr) => [...new Set(arr.filter(Boolean).map((t) => String(t).toLowerCase()))];
const plainLength = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;

export async function run(args, env = loadEnv(args.env)) {
  const readOnly = args.dryRun || args.checkSources;
  const { config, problems } = buildConfig(env, { needWiki: !readOnly });
  const { sources: allSources, problems: srcProblems } = fs.existsSync(config.sourcesFile)
    ? loadSources(config.sourcesFile) : { sources: [], problems: [] };
  problems.push(...srcProblems);
  if (problems.length) {
    for (const p of problems) log(`CONFIG: ${p}`);
    return { exitCode: 2 };
  }

  const state = loadState(config.stateFile);

  if (args.markReviewed) {
    let n = 0;
    for (const st of Object.values(state.pages)) {
      if (!st.changed) continue;
      if (args.markReviewed !== 'all' && st.path !== args.markReviewed.replace(/^\/+(en\/)?/, '')) continue;
      st.revid = st.changed.toRev;
      st.changed = null;
      st.publishedSince = new Date().toISOString();
      n++;
    }
    saveState(config.stateFile, state);
    log(`marked ${n} page(s) as reviewed`);
    return { exitCode: n ? 0 : 1 };
  }

  const sources = args.source ? allSources.filter((s) => s.id === args.source) : allSources;
  if (args.source && !sources.length) {
    log(`no enabled source with id "${args.source}"`);
    return { exitCode: 2 };
  }

  const client = new PoliteClient({ userAgent: config.userAgent, minIntervalMs: config.minIntervalMs, log });
  const wiki = new WikiJs({ url: config.wikiUrl, apiKey: config.apiKey, locale: config.locale, editor: config.editor });
  const now = new Date();
  const summary = { created: 0, refreshed: 0, changed: 0, skipped: [], blocked: [], errors: 0 };
  let writes = 0;

  for (const source of sources) {
    log(`source ${source.id}: ${source.name || source.api}`);
    const mw = new MediaWiki(source.api, client);
    try {
      const site = await mw.siteinfo();
      const lic = checkLicence(site.rights, source.allowedLicences);
      if (!lic.ok) {
        log(`  BLOCKED: ${lic.reason}`);
        summary.blocked.push({ name: source.name || source.id, reason: lic.reason });
        continue;
      }
      log(`  licence ok: ${lic.name}`);
      if (!source.apiAllowedBy && !(await client.isAllowed(source.api))) {
        const reason = 'robots.txt disallows the API for this user agent (set "apiAllowedBy" only if the site publishes an API policy allowing it)';
        log(`  BLOCKED: ${reason}`);
        summary.blocked.push({ name: source.name || source.id, reason });
        continue;
      }
      if (args.checkSources) continue;

      // Build the work list: listed pages, then category members.
      const items = new Map();
      for (const p of source.pages || []) items.set(p.title, { ...p, tags: p.tags || [] });
      for (const c of source.categories || []) {
        for (const title of await mw.categoryMembers(c.name, c.limit || 10)) {
          if (!items.has(title)) {
            items.set(title, { title, tags: c.tags || [], target: c.targetPrefix ? `${c.targetPrefix}/${slugify(title)}` : null });
          }
        }
      }
      const info = await mw.info([...items.keys()]);

      for (const item of items.values()) {
        const skip = (reason) => {
          log(`  skip "${item.title}": ${reason}`);
          summary.skipped.push({ source: source.id, title: item.title, reason });
        };
        const inf = info.get(item.title);
        if (!inf || inf.missing) { skip('page not found on the source'); continue; }
        if (!(await client.isAllowed(mw.articleUrl(inf.title)))) { skip('robots.txt disallows this page'); continue; }

        const key = `${source.id}::${inf.title}`;
        const st = state.pages[key];

        if (st) {
          st.lastCheckedAt = now.toISOString();
          if (st.dismissed) continue;
          if (readOnly) {
            if (inf.lastrevid !== st.revid) log(`  "${inf.title}" changed on the source (would check the wiki copy)`);
            continue;
          }
          const wp = await wiki.getPage(st.wikiPageId);
          if (!wp) {
            // A reviewer deleted it: respect that and never re-import it.
            st.dismissed = true;
            log(`  "${inf.title}" was deleted from the wiki; it will not be imported again`);
            continue;
          }
          st.path = wp.path;
          const isDraft = wp.path.startsWith(`${config.draftsPrefix}/`) && !wp.isPublished;
          if (!isDraft && !st.publishedSince) st.publishedSince = now.toISOString();
          if (inf.lastrevid === st.revid) continue;

          if (isDraft) {
            if (writes >= config.maxPagesPerRun) { skip('batch limit reached; draft will be refreshed next run'); continue; }
            const built = await buildPage({ mw, site: mw.site, lic, source, item, inf, now, config });
            if (built.skip) { skip(built.skip); continue; }
            await wiki.updateDraft(st.wikiPageId, built.page);
            writes++;
            Object.assign(st, { revid: built.revid, refreshedAt: now.toISOString(), flags: built.flags });
            summary.refreshed++;
            log(`  refreshed draft ${wp.path} (source revision ${built.revid})`);
          } else if (!st.changed || st.changed.toRev !== inf.lastrevid) {
            st.changed = {
              fromRev: st.revid,
              toRev: inf.lastrevid,
              diffUrl: mw.diffUrl(inf.title, st.revid, inf.lastrevid),
              noticedAt: now.toISOString(),
            };
            summary.changed++;
            log(`  source changed for published page ${wp.path}; listed in the review queue`);
          }
          continue;
        }

        if (writes >= config.maxPagesPerRun) { skip('batch limit reached; will be imported next run'); continue; }
        const built = await buildPage({ mw, site: mw.site, lic, source, item, inf, now, config });
        if (built.skip) { skip(built.skip); continue; }

        if (args.dryRun) {
          log(`  would create ${built.page.path} (${built.page.content.length} chars, tags: ${built.page.tags.join(', ')}${built.flags ? `; flags: ${built.flags}` : ''})`);
          summary.created++;
          continue;
        }
        const created = await wiki.createPage(built.page);
        writes++;
        state.pages[key] = {
          source: source.id,
          sourceTitle: inf.title,
          sourceUrl: mw.articleUrl(inf.title),
          wikiPageId: created.id,
          path: created.path,
          suggestedPath: built.suggestedPath,
          revid: built.revid,
          importedAt: now.toISOString(),
          lastCheckedAt: now.toISOString(),
          flags: built.flags,
          publishedSince: null,
          changed: null,
          dismissed: false,
        };
        summary.created++;
        log(`  created draft ${created.path}`);
      }
    } catch (e) {
      summary.errors++;
      log(`  ERROR: ${e.message}`);
      summary.blocked.push({ name: source.name || source.id, reason: `error: ${e.message}` });
    }
  }

  if (!args.checkSources) {
    const queue = buildQueue(state, summary, config, now);
    if (!args.dryRun) {
      await writeQueue(wiki, state, queue, config, now);
      saveState(config.stateFile, state);
    }
    log(`queue: ${queue.drafts.length} waiting, ${queue.changed.length} source changed, ${queue.due.length} due for re-review`);
  }

  const report = { at: now.toISOString(), dryRun: args.dryRun, requests: client.requests, ...summary };
  if (!readOnly) {
    fs.mkdirSync(path.dirname(config.stateFile), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(config.stateFile), 'last-run.json'), JSON.stringify(report, null, 2));
  }
  log(`done: ${summary.created} created, ${summary.refreshed} refreshed, ${summary.changed} changed, ${summary.skipped.length} skipped, ${summary.blocked.length} blocked, ${client.requests} requests`);
  return { exitCode: summary.errors ? 1 : 0, report };
}

async function buildPage({ mw, site, lic, source, item, inf, now, config }) {
  const parsed = await mw.parse(inf.title);
  const reason = privacySkipReason({ ns: inf.ns, categories: parsed.categories }, {
    extraSkip: source.skipCategories || [],
    notBiography: !!item.notBiography,
  });
  if (reason) return { skip: reason };
  const { html, report } = cleanHtml(parsed.html, { sourceBase: site.server });
  if (plainLength(html) < 200) return { skip: 'too little text left after cleaning' };

  const slug = slugify(inf.title);
  const tags = unique([...(source.defaultTags || []), ...item.tags, `source-${source.id}`, 'imported-draft', 'needs-review']);
  const suggestedPath = item.target || `${source.targetPrefix || 'imports'}/${slug}`;
  const links = { permalink: mw.permalink(inf.title, parsed.revid), history: mw.historyUrl(inf.title) };
  const content = renderDraft({
    page: { title: inf.title, revid: parsed.revid }, site, links, licence: lic, html, report, tags, importedAt: now, suggestedPath,
  });
  const flags = checklistItems(report).flags.map((f) => f.split('.')[0]).join('; ');
  return {
    revid: parsed.revid,
    suggestedPath,
    flags,
    page: {
      path: `${config.draftsPrefix}/${source.id}/${slug}`,
      title: inf.title,
      description: `Draft imported from ${site.name}; needs fact-check before publishing`,
      content,
      tags,
    },
  };
}

export function buildQueue(state, summary, config, now) {
  const entries = Object.values(state.pages).filter((s) => !s.dismissed);
  return {
    generatedAt: now,
    drafts: entries.filter((s) => !s.publishedSince && s.path && s.path.startsWith(`${config.draftsPrefix}/`)),
    changed: entries.filter((s) => s.changed).map((s) => ({ ...s, ...s.changed })),
    due: entries
      .filter((s) => s.publishedSince && !s.changed && now - new Date(s.publishedSince) > config.reviewAfterDays * DAY)
      .map((s) => ({ path: s.path, since: s.publishedSince })),
    blocked: summary.blocked,
    skipped: summary.skipped,
    wikiUrl: 'https://wiki.closetrepublic.com',
    locale: config.locale,
  };
}

async function writeQueue(wiki, state, queue, config, now) {
  const page = {
    path: config.queuePath,
    title: 'Review queue',
    description: 'Imported drafts waiting for fact-check (reviewers only)',
    content: renderQueue(queue),
    tags: ['review-queue'],
  };
  const existing = state.queuePageId ? await wiki.getPage(state.queuePageId) : null;
  if (existing) await wiki.updateDraft(state.queuePageId, page);
  else state.queuePageId = (await wiki.createPage(page)).id;
  state.queueUpdatedAt = now.toISOString();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  run(args)
    .then(({ exitCode }) => process.exit(exitCode))
    .catch((e) => {
      log(`FATAL: ${e.stack || e.message}`);
      process.exit(1);
    });
}
