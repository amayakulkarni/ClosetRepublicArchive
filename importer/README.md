# Wiki.js content importer

Copies openly licensed pages from other wikis into https://wiki.closetrepublic.com as **unpublished drafts**, keeps a review queue, and watches the sources for changes. It never publishes anything: a reviewer fact-checks every draft and publishes it by hand.

Read [../content/IMPORT-POLICY.md](../content/IMPORT-POLICY.md) first. It holds the rules this tool enforces and the reviewer checklist. [../content/SOURCES.md](../content/SOURCES.md) lists candidate sources and their licences.

## What each run does

1. For each enabled source in `sources.json`, reads the site's licence from its API. If the licence is not CC BY-SA, CC BY, CC0 or public domain (or not in the source's `allowedLicences`), the whole source is skipped and listed as blocked.
2. Reads the site's `robots.txt` and skips anything it disallows. If `robots.txt` cannot be reached because of a server error, nothing is read from that site in this run.
3. Asks for current revisions of all listed pages in one request per 50 pages.
4. **New pages** (at most `IMPORT_MAX_PAGES_PER_RUN`, default 25):
   - skips anything that is not an article, and pages in "Living people", biography or "people" categories,
   - fetches the rendered page and removes scripts, styles, images, navigation boxes, banners, edit links, links to user pages, email addresses and phone numbers,
   - wraps it in the Closet Republic draft layout: draft banner, "At a glance" box, reviewer checklist, importer flags, and a **Source and licence** box with the revision link, history link (the attribution) and licence,
   - creates it in Wiki.js at `drafts/imports/<source-id>/<page>` with **Published off** and tags `source-<id>`, `imported-draft`, `needs-review` plus the tags from `sources.json`.
5. **Pages already imported:**
   - still a draft under `drafts/`: refreshed from the new source revision (still unpublished),
   - published or moved by a reviewer: **never changed**. Listed under "Source changed since review" in the queue, with a link to the source diff,
   - deleted from the wiki by a reviewer: remembered and never imported again.
6. Rewrites the reviewers-only page `drafts/review-queue`: waiting drafts, changed sources, pages due for re-review (after `IMPORT_REVIEW_AFTER_DAYS`, default 365), blocked sources and skipped pages.
7. Saves state to `data/state.json` and a summary to `data/last-run.json`.

### Politeness built in

- User-Agent `ClosetRepublicWikiImporter/1.0 (https://wiki.closetrepublic.com; <IMPORT_CONTACT>)` on every request.
- One request at a time per site, at least `IMPORT_MIN_INTERVAL_MS` apart (default 2000, minimum 1000).
- `maxlag=5` on every MediaWiki call; waits and retries on `maxlag`, HTTP 429 and 503, honouring `Retry-After`; gives up for the run after 4 retries.
- HTTPS only (plain HTTP is accepted for `localhost` in tests).

## Install on the server

Prerequisites: the wiki stack from [../RUNBOOK.md](../RUNBOOK.md) is running and Node.js 18 or newer is installed.

1. Set up the groups and page rules in Wiki.js, exactly as in section 2 of [../content/IMPORT-POLICY.md](../content/IMPORT-POLICY.md). The **Importer** group may write only under `drafts/`.
2. In Wiki.js open **Administration > API Access**, click **Enable API**, then **New API Key**: name `importer`, group **Importer**, expiry 1 year. Copy the key (it is shown once).
3. Get the latest code on the server (the repository is cloned at `/opt/ClosetRepublicArchive`, see `../RUNBOOK.md` section 2):
   ```bash
   cd /opt/ClosetRepublicArchive && git pull
   ```
4. Install dependencies:
   ```bash
   cd /opt/ClosetRepublicArchive/importer
   npm ci --omit=dev
   ```
5. Create the importer's own settings file, `.env.local`, in this folder and lock it down:
   ```bash
   cp .env.local.example .env.local
   chmod 600 .env.local
   nano .env.local      # paste the key from step 2 as WIKIJS_API_KEY
   ```
   `.env.local` is ignored by git. The stack's `/opt/ClosetRepublicArchive/.env` is not read by the importer.
6. Check the sources (reads licences and robots.txt only):
   ```bash
   node src/import.js --check-sources
   ```
7. Dry run (fetches and prepares pages, writes nothing):
   ```bash
   node src/import.js --dry-run
   ```
   Fix any "page not found" titles in `sources.json`.
8. First real run:
   ```bash
   node src/import.js
   ```
   Then log in as a reviewer and open https://wiki.closetrepublic.com/en/drafts/review-queue.
9. Confirm a draft is hidden: open a draft address in a private browser window (not logged in). Wiki.js must show "unauthorized" or "not found". If the page is visible, fix the page rules before going further.

## Schedule (optional)

Weekly on Sundays at 04:30, after the nightly backup:

```bash
cp /opt/ClosetRepublicArchive/importer/systemd/wikijs-importer.service /etc/systemd/system/
cp /opt/ClosetRepublicArchive/importer/systemd/wikijs-importer.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wikijs-importer.timer
systemctl list-timers wikijs-importer.timer
```

Logs: `journalctl -u wikijs-importer.service -n 100`. Run once by hand: `systemctl start wikijs-importer.service`.

Keep the schedule weekly or slower. Volunteers review the queue; a faster schedule only grows it.

## After a review

When a reviewer has compared a "Source changed since review" entry and updated (or deliberately not updated) the published page, clear it:

```bash
node src/import.js --mark-reviewed /en/law/india/lgbtq-rights-in-india
# or every entry at once
node src/import.js --mark-reviewed all
```

This also restarts the re-review clock for that page.

## sources.json

Only sources listed here are ever read. Set `"enabled": false` to pause one.

| Field | Meaning |
| --- | --- |
| `id` | Short name, lowercase and hyphens; used in draft paths and the `source-<id>` tag |
| `name` | Display name in logs and the queue |
| `type` | `mediawiki` (the only supported type) |
| `api` | Full address of the site's `api.php` |
| `apiAllowedBy` | Address of the site's published API policy. Set it only when the site's `robots.txt` blocks `/w/` for crawlers but its policy explicitly allows API clients (Wikimedia does). Article paths are still checked against `robots.txt` |
| `allowedLicences` | Optional narrower list, for example `["CC BY-SA 4.0"]`. Empty means any open licence the tool accepts |
| `defaultTags` | Tags added to every page from this source |
| `targetPrefix` | Folder for suggested final paths when a page has no `target` |
| `skipCategories` | Extra source categories to skip |
| `pages` | List of `{ "title", "tags", "target", "notBiography" }`. `target` is the suggested final path shown in the draft. `notBiography: true` overrides the "people" category check after a person confirms the page is not about individuals ("Living people" is always skipped) |
| `categories` | List of `{ "name", "limit", "tags", "targetPrefix" }`; imports up to `limit` (default 10) articles from a category |

Tags must follow [../content/TAGS.md](../content/TAGS.md).

## Settings (`.env.local`)

Read from `.env.local` in this folder (another file can be given with `--env /path/file`). Real environment variables win over the file. Template: `.env.local.example`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WIKIJS_URL` | `http://127.0.0.1:40010` | Wiki.js address as seen from the server |
| `WIKIJS_API_KEY` | (required) | Key for the **Importer** group |
| `WIKIJS_LOCALE` | `en` | Locale of created pages |
| `IMPORT_CONTACT` | (required) | Email or URL put in the User-Agent so site operators can reach the project |
| `IMPORT_MAX_PAGES_PER_RUN` | `25` | New or refreshed pages per run |
| `IMPORT_MIN_INTERVAL_MS` | `2000` | Gap between requests to one site (minimum 1000) |
| `IMPORT_REVIEW_AFTER_DAYS` | `365` | When a published page appears as "Due for re-review" |
| `IMPORT_EDITOR` | `code` | Wiki.js editor for drafts. `code` is the raw HTML editor, which keeps the `cr-*` layout classes |
| `IMPORT_SOURCES_FILE` | `sources.json` | Relative to this folder |
| `IMPORT_STATE_FILE` | `data/state.json` | Relative to this folder |

## Large imports

The API suits tens to a few hundred pages. For more:

- **Wikimedia projects:** download a dump from https://dumps.wikimedia.org or a Kiwix ZIM file and import from the file instead. This needs an extra reader; ask before building it.
- **Miraheze, WikiTide and other community wikis:** ask the wiki's administrators for an XML dump and permission. Record their answer in `../content/SOURCES.md`.

## Tests

```bash
npm install
npm test
```

The tests run a mock MediaWiki and a mock Wiki.js locally and check: licence gate, robots.txt, privacy skips, HTML cleaning and redaction, drafts created unpublished with attribution, draft refresh, published pages left untouched when the source changes, the review queue, `--mark-reviewed`, and that `--dry-run` writes nothing.

## Limits

- Tested only against mock servers, not a live Wiki.js or live wiki. Run `--check-sources` and `--dry-run` first on the server.
- The privacy filters are a safety net, not a substitute for the reviewer checklist.
- Wiki.js 2 has no built-in approval workflow; the hidden `drafts/` path and the Reviewers group provide it. Keep the page rules in place.
