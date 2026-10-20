import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(HERE, '..');

// Minimal .env reader (KEY=VALUE, optional quotes, # comments).
// Real environment variables win over the file.
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    } else {
      val = val.replace(/\s+#.*$/, '');
    }
    out[key] = val;
  }
  return out;
}

export function loadEnv(envPath) {
  let fileVars = {};
  if (envPath && fs.existsSync(envPath)) {
    fileVars = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  }
  return { ...fileVars, ...process.env };
}

const int = (v, d) => {
  if (v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

// Returns { config, problems }. Problems are human-readable strings.
// needWiki: false for --dry-run and --check-sources, which never write to Wiki.js.
export function buildConfig(env, { needWiki = true } = {}) {
  const problems = [];
  const config = {
    wikiUrl: (env.WIKIJS_URL || 'http://127.0.0.1:40010').replace(/\/+$/, ''),
    apiKey: env.WIKIJS_API_KEY,
    locale: env.WIKIJS_LOCALE || 'en',
    editor: env.IMPORT_EDITOR || 'code',
    contact: env.IMPORT_CONTACT,
    sourcesFile: path.resolve(APP_DIR, env.IMPORT_SOURCES_FILE || 'sources.json'),
    stateFile: path.resolve(APP_DIR, env.IMPORT_STATE_FILE || 'data/state.json'),
    maxPagesPerRun: int(env.IMPORT_MAX_PAGES_PER_RUN, 25),
    minIntervalMs: int(env.IMPORT_MIN_INTERVAL_MS, 2000),
    reviewAfterDays: int(env.IMPORT_REVIEW_AFTER_DAYS, 365),
    draftsPrefix: 'drafts/imports',
    queuePath: 'drafts/review-queue',
  };

  if (!config.contact || /CHANGE_ME/i.test(config.contact))
    problems.push('IMPORT_CONTACT is missing or still a placeholder (an email or URL for the User-Agent)');
  if (needWiki && (!config.apiKey || /CHANGE_ME/i.test(config.apiKey)))
    problems.push('WIKIJS_API_KEY is missing or still a placeholder');
  if (!Number.isInteger(config.maxPagesPerRun) || config.maxPagesPerRun < 1)
    problems.push('IMPORT_MAX_PAGES_PER_RUN must be a whole number of at least 1');
  // Never allow hammering a source, whatever the setting says.
  if (!Number.isInteger(config.minIntervalMs) || config.minIntervalMs < 1000)
    problems.push('IMPORT_MIN_INTERVAL_MS must be a whole number of at least 1000');
  if (!Number.isInteger(config.reviewAfterDays) || config.reviewAfterDays < 1)
    problems.push('IMPORT_REVIEW_AFTER_DAYS must be a whole number of at least 1');
  if (!fs.existsSync(config.sourcesFile)) problems.push(`sources file not found: ${config.sourcesFile}`);

  config.userAgent = `ClosetRepublicWikiImporter/1.0 (https://wiki.closetrepublic.com; ${config.contact || 'no contact set'})`;
  return { config, problems };
}

// Validates sources.json. Returns { sources, problems }.
export function loadSources(file) {
  const problems = [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { sources: [], problems: [`cannot read ${file}: ${e.message}`] };
  }
  const sources = (data.sources || []).filter((s) => s.enabled !== false);
  const ids = new Set();
  for (const s of sources) {
    if (!/^[a-z0-9-]+$/.test(s.id || '')) problems.push(`source id "${s.id}" must be lowercase letters, digits and hyphens`);
    if (ids.has(s.id)) problems.push(`duplicate source id "${s.id}"`);
    ids.add(s.id);
    if (s.type !== 'mediawiki') problems.push(`source "${s.id}": only type "mediawiki" is supported`);
    if (!s.api) problems.push(`source "${s.id}": "api" is required`);
    for (const p of s.pages || []) {
      if (!p.title) problems.push(`source "${s.id}": every page needs a "title"`);
    }
    for (const c of s.categories || []) {
      if (!c.name) problems.push(`source "${s.id}": every category needs a "name"`);
    }
  }
  return { sources, problems };
}
