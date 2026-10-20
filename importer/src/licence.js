// Licence gate. Text is imported only when the source's own licence allows
// copying and adaptation under terms compatible with CC BY-SA 4.0.

const ALLOWED = [
  { re: /creativecommons\.org\/licenses\/by-sa\/4\.0/i, text: /(cc[ -]?by-sa|attribution-share ?alike)[^0-9]*4\.0/i, name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { re: /creativecommons\.org\/licenses\/by-sa\/3\.0/i, text: /(cc[ -]?by-sa|attribution-share ?alike)[^0-9]*3\.0/i, name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  { re: /creativecommons\.org\/licenses\/by\/4\.0/i, text: /(cc[ -]?by|attribution)\s*4\.0/i, name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  { re: /creativecommons\.org\/licenses\/by\/3\.0/i, text: /(cc[ -]?by|attribution)\s*3\.0/i, name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
  { re: /creativecommons\.org\/publicdomain\/zero\/1\.0/i, text: /\bcc0\b|public domain dedication/i, name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { re: /creativecommons\.org\/publicdomain\/mark\//i, text: /^public domain$/i, name: 'Public domain', url: 'https://creativecommons.org/publicdomain/mark/1.0/' },
];

// Words that make a licence incompatible, whatever else it says.
const FORBIDDEN = /(-nc\b|\/by-nc|-nd\b|\/by-nd|non-?commercial|no-?deriv|all rights reserved)/i;

// rightsinfo: MediaWiki siteinfo rightsinfo { url, text }.
// allowedNames: optional per-source narrowing, e.g. ["CC BY-SA 4.0"].
// Returns { ok, name, url, reason }.
export function checkLicence(rightsinfo, allowedNames) {
  const url = (rightsinfo && rightsinfo.url) || '';
  const text = (rightsinfo && rightsinfo.text) || '';
  if (!url && !text) return { ok: false, reason: 'the site does not state a licence' };
  if (FORBIDDEN.test(url) || FORBIDDEN.test(text))
    return { ok: false, reason: `licence "${text || url}" forbids commercial use, adaptation or reuse` };
  // Prefer the licence URL; fall back to the licence name when the URL points
  // at a local copyright page instead of the licence itself.
  const byUrl = ALLOWED.find((l) => l.re.test(url));
  const hit = byUrl || ALLOWED.find((l) => l.text.test(text.trim()));
  if (!hit) return { ok: false, reason: `licence "${text || url}" is not on the allowed list` };
  if (Array.isArray(allowedNames) && allowedNames.length && !allowedNames.includes(hit.name))
    return { ok: false, reason: `licence ${hit.name} is not in this source's allowedLicences` };
  return { ok: true, name: hit.name, url: byUrl ? url : hit.url };
}
