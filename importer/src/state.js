// Import state: which source page became which wiki page, at which source
// revision. Kept as JSON next to the app (data/state.json by default).

import fs from 'node:fs';
import path from 'node:path';

export function loadState(file) {
  if (!fs.existsSync(file)) return { version: 1, queuePageId: null, pages: {} };
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  s.pages = s.pages || {};
  return s;
}

// Written to a temporary file and renamed, so a crash never leaves half a file.
export function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
