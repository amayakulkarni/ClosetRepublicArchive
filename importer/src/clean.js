// Turns MediaWiki's rendered HTML into plain, safe article HTML for Wiki.js,
// and removes personal data.
//
// Removed: scripts, styles, images and figures (each image has its own licence),
// navigation boxes, maintenance banners, edit links, links to user pages and
// contribution lists, email addresses and phone numbers.
// Kept: headings, paragraphs, lists, tables, quotes and the reference list.

import sanitizeHtml from 'sanitize-html';

const DROP_CLASSES = [
  'mw-editsection', 'navbox', 'vertical-navbox', 'navbox-styles', 'metadata', 'ambox', 'mbox-small',
  'ombox', 'tmbox', 'noprint', 'sistersitebox', 'hatnote', 'mw-empty-elt', 'thumb', 'gallery',
  'mw-file-description', 'infobox-image', 'portalbox', 'side-box', 'shortdescription', 'mw-kartographer',
];
const DROP_TAGS = ['script', 'style', 'link', 'meta', 'noscript', 'textarea', 'figure', 'img', 'audio', 'video', 'picture', 'map', 'iframe', 'object', 'embed', 'form', 'input', 'button'];

const PERSON_LINK = /(\/|title=|^)(User|User_talk|User talk|Special:Contributions|Special:EmailUser|Message_Wall|Message Wall)(:|%3A)/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 10 to 13 digits, optionally with spaces, dots, dashes or brackets between them.
const PHONE = /(?:\+?\d[\s().-]?){9,12}\d/g;
const PHONE_EXEMPT_BEFORE = /(ISBN|ISSN|doi|OCLC|PMID|arXiv|Bibcode)[:\s]*$/i;

function hasDropClass(attribs) {
  const cls = ` ${(attribs && attribs.class) || ''} `;
  return DROP_CLASSES.some((c) => cls.includes(` ${c} `));
}

// sourceBase: origin of the source wiki, used to make relative links absolute.
export function cleanHtml(html, { sourceBase }) {
  const report = { emails: 0, phones: 0, personLinks: 0, imagesRemoved: 0 };
  report.imagesRemoved = (html.match(/<img\b/gi) || []).length;

  // Pass 1: drop whole unwanted elements while class names are still present.
  const pass1 = sanitizeHtml(html, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true, // pass 1 only removes things; pass 2 is the allow-list
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'link', 'meta'],
    exclusiveFilter: (frame) => DROP_TAGS.includes(frame.tag) || hasDropClass(frame.attribs) ||
      (frame.attribs && /display:\s*none/i.test(frame.attribs.style || '')),
  });

  // Pass 2: allow-list of tags and attributes; rewrite links; redact text.
  const out = sanitizeHtml(pass1, {
    allowedTags: [
      'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'blockquote', 'q', 'cite', 'code', 'pre', 'kbd', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup',
      'small', 'abbr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'a', 'span', 'div',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'rel'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
      abbr: ['title'],
      ol: ['start'],
      li: ['id'],
      sup: ['id'],
      span: ['id'],
      cite: ['id'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    transformTags: {
      h1: 'h2',
      a: (tagName, attribs) => {
        const href = attribs.href || '';
        if (PERSON_LINK.test(href)) {
          report.personLinks++;
          return { tagName: 'span', attribs: {} };
        }
        if (href.startsWith('#')) return { tagName: 'a', attribs: { href } };
        let abs;
        try {
          abs = new URL(href, sourceBase).toString();
        } catch {
          return { tagName: 'span', attribs: {} };
        }
        if (abs.startsWith('mailto:')) {
          report.emails++;
          return { tagName: 'span', attribs: {} };
        }
        return { tagName: 'a', attribs: { href: abs, rel: 'nofollow noopener' } };
      },
    },
    textFilter: (text) => {
      let t = text.replace(EMAIL, () => {
        report.emails++;
        return '[email removed]';
      });
      t = t.replace(PHONE, (m, offset, whole) => {
        const digits = m.replace(/\D/g, '').length;
        if (digits < 10 || digits > 13) return m;
        if (PHONE_EXEMPT_BEFORE.test(whole.slice(Math.max(0, offset - 12), offset))) return m;
        report.phones++;
        return '[phone number removed]';
      });
      return t;
    },
  });

  return { html: tidy(out), report };
}

// Removes empty wrappers and runs of blank lines left behind by pass 1.
function tidy(html) {
  let prev;
  let h = html;
  do {
    prev = h;
    h = h.replace(/<(p|div|span|li|ul|ol|dl)>\s*<\/\1>/g, '');
  } while (h !== prev);
  return h.replace(/\n{3,}/g, '\n\n').trim();
}

// Privacy gate on whole pages. Returns a reason string to skip, or null.
// LIVING always blocks. PERSON_CATEGORIES blocks too, unless a page in
// sources.json is marked "notBiography": true after a person has checked it.
const LIVING = /^(living people|possibly living people|\d{4} births)$/i;
const PERSON_CATEGORIES = /^(.*\bbiograph(y|ies)\b.*|.*\bpeople\b.*|.*\bactivists?\b.*|.*\bcelebrities\b.*)$/i;

export function privacySkipReason({ ns, categories = [] }, { extraSkip = [], notBiography = false } = {}) {
  if (ns !== 0) return `not an article (namespace ${ns})`;
  const hit = categories.find((c) => LIVING.test(c) ||
    (!notBiography && PERSON_CATEGORIES.test(c)) ||
    extraSkip.some((x) => x.toLowerCase() === c.toLowerCase()));
  if (hit) return `page is about people (category "${hit}")`;
  return null;
}
