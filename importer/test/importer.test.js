import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLicence } from '../src/licence.js';
import { cleanHtml, privacySkipReason } from '../src/clean.js';
import { slugify } from '../src/render.js';
import { run } from '../src/import.js';
import { mockMediaWiki, mockWikiJs } from './mocks.js';

const BY_SA_4 = { url: 'https://creativecommons.org/licenses/by-sa/4.0/', text: 'Creative Commons Attribution-ShareAlike' };
const LONG = '<p>' + 'Plain informative text about the topic. '.repeat(12) + '</p>';

test('licence gate accepts open licences and refuses NC, ND and unknown', () => {
  assert.equal(checkLicence(BY_SA_4).name, 'CC BY-SA 4.0');
  assert.equal(checkLicence({ url: 'https://creativecommons.org/licenses/by-sa/3.0/', text: '' }).name, 'CC BY-SA 3.0');
  assert.equal(checkLicence({ url: 'https://creativecommons.org/publicdomain/zero/1.0/' }).name, 'CC0 1.0');
  assert.equal(checkLicence({ url: '/wiki/Project:Copyrights', text: 'Creative Commons Attribution-ShareAlike 4.0' }).name, 'CC BY-SA 4.0');
  assert.equal(checkLicence({ url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' }).ok, false);
  assert.equal(checkLicence({ url: 'https://creativecommons.org/licenses/by-nd/4.0/' }).ok, false);
  assert.equal(checkLicence({ url: '', text: 'All rights reserved' }).ok, false);
  assert.equal(checkLicence({ url: '', text: '' }).ok, false);
  assert.equal(checkLicence({ url: 'https://example.org/our-terms', text: 'Site terms' }).ok, false);
  assert.equal(checkLicence(BY_SA_4, ['CC BY-SA 3.0']).ok, false);
});

test('cleaner removes scripts, images, navboxes, user links, emails and phones; keeps references', () => {
  const html = `
    <div class="mw-parser-output">
      <style>.x{}</style><script>alert(1)</script>
      <h1>Heading</h1>
      <p>Text with <a href="/wiki/Topic">a link</a> and <a href="/wiki/User:Someone">Someone</a>
         and <a href="https://example.org/x" onclick="evil()">outside</a>.
         Contact me at person@example.com or +91 98765 43210. ISBN 978-0-19-852663-6 stays.</p>
      <figure><img src="a.png" alt="a"><figcaption>Caption</figcaption></figure>
      <table class="navbox"><tr><td>Nav</td></tr></table>
      <div class="ambox">This article needs more sources</div>
      <span class="mw-editsection">[edit]</span>
      <ol class="references"><li id="cite_note-1">A reference</li></ol>
    </div>`;
  const { html: out, report } = cleanHtml(html, { sourceBase: 'https://wiki.example' });
  assert.ok(!/script|style|onclick|<img|figcaption|Nav<|needs more sources|\[edit\]/i.test(out), out);
  assert.match(out, /<h2>Heading<\/h2>/);
  assert.match(out, /href="https:\/\/wiki\.example\/wiki\/Topic"/);
  assert.ok(!out.includes('User:Someone'));
  assert.match(out, /Someone/); // text kept, link removed
  assert.ok(!out.includes('person@example.com'));
  assert.ok(!out.includes('98765'));
  assert.match(out, /978-0-19-852663-6/);
  assert.match(out, /<li id="cite_note-1">A reference<\/li>/);
  assert.deepEqual(report, { emails: 1, phones: 1, personLinks: 1, imagesRemoved: 1 });
});

test('privacy gate skips non-articles and pages about people', () => {
  assert.match(privacySkipReason({ ns: 2, categories: [] }), /namespace 2/);
  assert.match(privacySkipReason({ ns: 0, categories: ['Living people'] }), /Living people/);
  assert.match(privacySkipReason({ ns: 0, categories: ['Indian LGBTQ rights activists'] }), /activists/);
  assert.equal(privacySkipReason({ ns: 0, categories: ['Indian LGBTQ rights activists'] }, { notBiography: true }), null);
  assert.match(privacySkipReason({ ns: 0, categories: ['Living people'] }, { notBiography: true }), /Living people/);
  assert.equal(privacySkipReason({ ns: 0, categories: ['LGBTQ law in India'] }), null);
});

test('slugify keeps Indian scripts and drops punctuation', () => {
  assert.equal(slugify('Transgender Persons (Protection of Rights) Act, 2019'), 'transgender-persons-protection-of-rights-act-2019');
  assert.equal(slugify('हिजड़ा'), 'हिजड़ा');
});

function setup(sources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'importer-'));
  const sourcesFile = path.join(dir, 'sources.json');
  fs.writeFileSync(sourcesFile, JSON.stringify({ sources }));
  return { dir, sourcesFile, stateFile: path.join(dir, 'state.json') };
}

function envFor(t, wiki) {
  return {
    WIKIJS_URL: wiki ? wiki.url : 'http://127.0.0.1:9',
    WIKIJS_API_KEY: 'test-key',
    IMPORT_CONTACT: 'tests@example.org',
    IMPORT_SOURCES_FILE: t.sourcesFile,
    IMPORT_STATE_FILE: t.stateFile,
    IMPORT_MIN_INTERVAL_MS: '1000',
  };
}

test('end to end: drafts only, attribution, robots, privacy, update checks, queue', { timeout: 400_000 }, async () => {
  const pages = {
    'Good Page': { revid: 10, html: LONG },
    'Secret': { revid: 11, html: LONG },
    'A Person': { revid: 12, html: LONG, categories: ['Living_people'] },
    'Talk Thing': { revid: 13, ns: 1, html: LONG },
  };
  const mw = await mockMediaWiki({ rights: BY_SA_4, pages });
  const wiki = await mockWikiJs();
  const t = setup([{
    id: 'mock', name: 'Mock Wiki', type: 'mediawiki', api: mw.api,
    defaultTags: ['region-global'],
    pages: ['Good Page', 'Secret', 'A Person', 'Talk Thing', 'Missing Page'].map((title) => ({ title, tags: ['type-explainer'] })),
  }]);
  const env = envFor(t, wiki);
  try {
    const first = await run({ dryRun: false, checkSources: false, source: null, markReviewed: null }, env);
    assert.equal(first.exitCode, 0);
    assert.equal(first.report.created, 1);
    const reasons = Object.fromEntries(first.report.skipped.map((s) => [s.title, s.reason]));
    assert.match(reasons.Secret, /robots/);
    assert.match(reasons['A Person'], /people/);
    assert.match(reasons['Talk Thing'], /namespace 1/);
    assert.match(reasons['Missing Page'], /not found/);

    // Every request carried the honest User-Agent and maxlag.
    assert.ok(mw.hits.every((h) => h.ua.startsWith('ClosetRepublicWikiImporter/1.0') && h.ua.includes('tests@example.org')));
    assert.ok(mw.hits.filter((h) => h.path === '/w/api.php').every((h) => h.params.maxlag === '5'));

    const created = [...wiki.pages.values()];
    const draft = created.find((p) => p.path === 'drafts/imports/mock/good-page');
    assert.ok(draft, 'draft created under drafts/imports');
    assert.equal(draft.isPublished, false);
    assert.equal(draft.editor, 'code');
    assert.deepEqual(draft.tags, ['region-global', 'type-explainer', 'source-mock', 'imported-draft', 'needs-review']);
    assert.match(draft.content, /Draft: not fact-checked/);
    assert.match(draft.content, /CC BY-SA 4\.0/);
    assert.match(draft.content, /oldid=10/);
    assert.match(draft.content, /action=history/);
    assert.match(draft.content, /corrections@closetrepublic\.com/);
    const queue = created.find((p) => p.path === 'drafts/review-queue');
    assert.ok(queue && queue.isPublished === false);
    assert.match(queue.content, /good-page/);
    assert.ok(wiki.calls.every((c) => c.auth === 'Bearer test-key'));

    // Source changes while still a draft: the draft is refreshed, still unpublished.
    pages['Good Page'].revid = 20;
    const second = await run({ dryRun: false, checkSources: false, source: null, markReviewed: null }, env);
    assert.equal(second.report.refreshed, 1);
    assert.match(draft.content, /oldid=20/);
    assert.equal(draft.isPublished, false);

    // A reviewer publishes it at its final path; a later source change must not touch it.
    draft.path = 'law/india/good-page';
    draft.isPublished = true;
    const before = draft.content;
    pages['Good Page'].revid = 30;
    const third = await run({ dryRun: false, checkSources: false, source: null, markReviewed: null }, env);
    assert.equal(third.report.changed, 1);
    assert.equal(draft.content, before);
    assert.match(queue.content, /Source changed since review \(1\)/);
    assert.match(queue.content, /diff=30&amp;oldid=20/);

    // After review, mark-reviewed clears it.
    const marked = await run({ dryRun: false, checkSources: false, source: null, markReviewed: '/en/law/india/good-page' }, env);
    assert.equal(marked.exitCode, 0);
    const state = JSON.parse(fs.readFileSync(t.stateFile, 'utf8'));
    assert.equal(Object.values(state.pages)[0].changed, null);
    assert.equal(Object.values(state.pages)[0].revid, 30);
  } finally {
    mw.close();
    wiki.close();
  }
});

test('blocked licence imports nothing; dry run writes nothing', { timeout: 200_000 }, async () => {
  const mw = await mockMediaWiki({ rights: { url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/' }, pages: { 'Good Page': { revid: 1, html: LONG } } });
  const wiki = await mockWikiJs();
  const t = setup([{ id: 'nc', name: 'NC Wiki', type: 'mediawiki', api: mw.api, pages: [{ title: 'Good Page' }] }]);
  try {
    const r = await run({ dryRun: false, checkSources: false, source: null, markReviewed: null }, envFor(t, wiki));
    assert.equal(r.report.created, 0);
    assert.match(r.report.blocked[0].reason, /forbids/);
    assert.ok(!mw.hits.some((h) => h.params.action === 'parse'), 'no page content fetched');
    const queue = [...wiki.pages.values()].find((p) => p.path === 'drafts/review-queue');
    assert.match(queue.content, /NC Wiki/);
  } finally {
    mw.close();
    wiki.close();
  }

  const mw2 = await mockMediaWiki({ rights: BY_SA_4, pages: { 'Good Page': { revid: 1, html: LONG } } });
  const t2 = setup([{ id: 'ok', name: 'OK Wiki', type: 'mediawiki', api: mw2.api, pages: [{ title: 'Good Page' }] }]);
  try {
    const env = envFor(t2, null);
    delete env.WIKIJS_API_KEY; // dry run needs no key
    const r = await run({ dryRun: true, checkSources: false, source: null, markReviewed: null }, env);
    assert.equal(r.exitCode, 0);
    assert.equal(r.report.created, 1);
    assert.ok(!fs.existsSync(t2.stateFile));
  } finally {
    mw2.close();
  }
});
