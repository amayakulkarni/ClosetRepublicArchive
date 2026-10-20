// Local mock MediaWiki and Wiki.js servers for tests. No network needed.
import http from 'node:http';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

export async function mockMediaWiki({ rights, robots = 'User-agent: *\nDisallow: /wiki/Secret\n', pages }) {
  const hits = [];
  let port;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push({ path: u.pathname, ua: req.headers['user-agent'], params: Object.fromEntries(u.searchParams) });
    if (u.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(robots);
    }
    if (u.pathname !== '/w/api.php') {
      res.writeHead(404);
      return res.end();
    }
    const p = Object.fromEntries(u.searchParams);
    const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (p.meta === 'siteinfo') {
      return json({ query: {
        general: { sitename: 'Mock Wiki', server: `http://127.0.0.1:${port}`, articlepath: '/wiki/$1', script: '/w/index.php' },
        rightsinfo: rights,
      } });
    }
    if (p.prop === 'info') {
      const titles = p.titles.split('|');
      return json({ query: { pages: titles.map((t) => (pages[t]
        ? { title: t, ns: pages[t].ns ?? 0, lastrevid: pages[t].revid }
        : { title: t, ns: 0, missing: true })) } });
    }
    if (p.action === 'parse') {
      const pg = pages[p.page];
      return json({ parse: { title: p.page, pageid: 1, revid: pg.revid, text: pg.html, categories: (pg.categories || []).map((c) => ({ category: c })) } });
    }
    if (p.list === 'categorymembers') {
      return json({ query: { categorymembers: Object.keys(pages).filter((t) => (pages[t].inCategory || []).includes(p.cmtitle)).map((t) => ({ title: t, ns: 0 })) } });
    }
    json({ error: { code: 'unknown', info: 'not mocked' } });
  });
  port = await listen(server);
  return { url: `http://127.0.0.1:${port}`, api: `http://127.0.0.1:${port}/w/api.php`, hits, close: () => server.close() };
}

export async function mockWikiJs() {
  const pages = new Map();
  let nextId = 1;
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const { query, variables } = JSON.parse(raw);
      calls.push({ query, variables, auth: req.headers.authorization });
      const ok = { succeeded: true, errorCode: 0, slug: 'ok', message: 'ok' };
      const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (query.includes('create(')) {
        const id = nextId++;
        pages.set(id, { id, ...variables, updatedAt: new Date().toISOString() });
        return json({ data: { pages: { create: { responseResult: ok, page: { id, path: variables.path } } } } });
      }
      if (query.includes('update(')) {
        const p = pages.get(variables.id);
        Object.assign(p, Object.fromEntries(Object.entries(variables).filter(([, v]) => v !== undefined)));
        return json({ data: { pages: { update: { responseResult: ok } } } });
      }
      if (query.includes('single(')) {
        const p = pages.get(variables.id);
        if (!p) return json({ errors: [{ message: 'This page does not exist.' }], data: { pages: { single: null } } });
        return json({ data: { pages: { single: { id: p.id, path: p.path, isPublished: p.isPublished, updatedAt: p.updatedAt } } } });
      }
      json({ errors: [{ message: 'not mocked' }] });
    });
  });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}`, pages, calls, close: () => server.close() };
}
