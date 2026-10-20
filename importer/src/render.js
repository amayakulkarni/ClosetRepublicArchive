// Wraps cleaned article HTML in the Closet Republic draft layout: draft banner,
// hero, "At a glance" box, reviewer checklist, article, and the source and
// licence box that carries the attribution. Uses the cr-* classes from
// theme/css-override.css (Wiki.js strips inline styles).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TYPE_LABELS = {
  'type-guide': 'Guide', 'type-explainer': 'Explainer', 'type-glossary': 'Glossary', 'type-law': 'Law',
  'type-history': 'History', 'type-resource-list': 'Resources', 'type-post': 'Post', 'type-republic': 'The Republic',
};

export function slugify(title) {
  const s = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return s || 'page';
}

export function checklistItems(report) {
  const items = [
    'Licence box below shows an allowed licence and its links work.',
    'Every factual claim has a source in "Sources and credits"; unsourced claims removed.',
    'Legal claims checked against the Act or judgment itself (India Code, Supreme Court or High Court), with section or paragraph numbers.',
    'Still current: dates and "as of" notes added for anything that can change.',
    'India context added or linked where the text speaks only about other countries.',
    'Health and safety: no advice beyond cited clinical bodies; helplines and organisations confirmed active.',
    'Privacy: no private person named or identifiable; no identity attributed to a living person.',
    'Plain language and respectful terms; lead rewritten for Closet Republic readers.',
    'Tags (type, region, topic) and final path set; see content/TAGS.md.',
  ];
  const flags = [];
  if (report.emails) flags.push(`${report.emails} email address(es) were removed. Add back only official public contact addresses, checked by hand.`);
  if (report.phones) flags.push(`${report.phones} phone number(s) were removed. Add back only verified public helpline numbers.`);
  if (report.personLinks) flags.push(`${report.personLinks} link(s) to contributor or user pages were removed.`);
  if (report.imagesRemoved) flags.push(`${report.imagesRemoved} image(s) were left out. Add images by hand only after checking each file's own licence.`);
  return { items, flags };
}

// page: { title, revid }, site: { name }, links: { permalink, history, article },
// licence: { name, url }, tags: [], importedAt: Date, suggestedPath: string
export function renderDraft({ page, site, links, licence, html, report, tags, importedAt, suggestedPath }) {
  const date = importedAt.toISOString().slice(0, 10);
  const type = tags.find((t) => TYPE_LABELS[t]);
  const { items, flags } = checklistItems(report);

  return `<div class="cr-callout cr-callout--caution cr-draft-banner">
  <p><strong>Draft: not fact-checked.</strong> Imported automatically from ${esc(site.name)} on ${date}. Hidden from readers until a reviewer completes the checklist and publishes it. Remove this banner when publishing.</p>
</div>

<div class="cr-hero">
  <p class="cr-eyebrow">${esc(type ? TYPE_LABELS[type] : 'Imported page')}</p>
  <h1>${esc(page.title)}</h1>
  <p class="cr-hero__lead">REWRITE THIS LEAD: one or two plain-language sentences on what this page covers and who it helps.</p>
</div>

<aside class="cr-meta" aria-label="Page facts">
  <h2>At a glance</h2>
  <dl>
    <dt>Status</dt>
    <dd><span class="cr-status">DRAFT</span></dd>
    <dt>Fact-checked by</dt>
    <dd>NOT YET</dd>
    <dt>Last reviewed</dt>
    <dd>NOT YET</dd>
    <dt>Suggested path</dt>
    <dd>${esc(suggestedPath)}</dd>
  </dl>
</aside>

<div class="cr-review">
  <h2>Reviewer checklist</h2>
  <p>Work through every item, then delete this box. Law, health and safety pages need two reviewers.</p>
  <ul>
${items.map((i) => `    <li>[ ] ${esc(i)}</li>`).join('\n')}
  </ul>${flags.length ? `
  <h3>Flags from the importer</h3>
  <ul>
${flags.map((f) => `    <li>${esc(f)}</li>`).join('\n')}
  </ul>` : ''}
</div>

${html}

<div class="cr-sources cr-attribution">
  <h2>Source and licence</h2>
  <p>This page includes text from <a href="${esc(links.permalink)}" rel="nofollow noopener">${esc(page.title)}</a> on ${esc(site.name)} (revision ${esc(page.revid)}), written by <a href="${esc(links.history)}" rel="nofollow noopener">its contributors</a> and available under <a href="${esc(licence.url)}" rel="license nofollow noopener">${esc(licence.name)}</a>. Imported on ${date} and changed since then by the Closet Republic wiki.</p>
  <p>This page is available under <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="license">CC BY-SA 4.0</a>. Possible mistakes can be reported to <a href="mailto:corrections@closetrepublic.com">corrections@closetrepublic.com</a>.</p>
</div>
`;
}

// The review queue page, regenerated after each run.
export function renderQueue({ generatedAt, drafts, changed, blocked, skipped, due, wikiUrl, locale }) {
  const link = (p) => `<a href="${esc(`${wikiUrl}/${locale}/${p}`)}">${esc(p)}</a>`;
  const section = (title, intro, rows, head, row) => `<h2>${esc(title)} (${rows.length})</h2>
<p>${esc(intro)}</p>
${rows.length ? `<table>
  <thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>
${rows.map((r) => `    <tr>${row(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
  </tbody>
</table>` : '<p>Nothing here.</p>'}`;

  return `<div class="cr-hero">
  <p class="cr-eyebrow">Reviewers only</p>
  <h1>Review queue</h1>
  <p class="cr-hero__lead">Pages waiting for a fact-check, and published pages whose source has changed. Regenerated by the importer on ${esc(generatedAt.toISOString().slice(0, 16).replace('T', ' '))} UTC. Edits to this page are overwritten.</p>
</div>

${section('Waiting for review', 'Imported drafts that have not been published yet. Follow the checklist on each page.', drafts,
    ['Draft', 'Source', 'Imported', 'Flags'],
    (d) => [link(d.path), `<a href="${esc(d.sourceUrl)}">${esc(d.sourceTitle)}</a>`, esc(d.importedAt.slice(0, 10)), esc(d.flags || '')])}

${section('Source changed since review', 'The source page changed after this page was reviewed or published. The published page was not touched. Compare the changes and decide whether to update it.', changed,
    ['Page', 'Source changes', 'Noticed'],
    (c) => [link(c.path), `<a href="${esc(c.diffUrl)}">${esc(c.sourceTitle)}: see changes</a>`, esc(c.noticedAt.slice(0, 10))])}

${section('Due for re-review', 'Published imported pages last reviewed (or first seen published) longer ago than the review period.', due,
    ['Page', 'Seen published since'],
    (d) => [link(d.path), esc(d.since.slice(0, 10))])}

${section('Sources blocked this run', 'Nothing was imported from these sources.', blocked,
    ['Source', 'Reason'],
    (b) => [esc(b.name), esc(b.reason)])}

${section('Pages skipped this run', 'Pages left out for privacy, licence or availability reasons.', skipped,
    ['Source', 'Page', 'Reason'],
    (s) => [esc(s.source), esc(s.title), esc(s.reason)])}
`;
}
