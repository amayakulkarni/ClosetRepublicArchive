// Read-only MediaWiki Action API client. Every call goes through the polite
// client and carries maxlag=5 so busy servers can turn the importer away.

export class MediaWiki {
  constructor(apiUrl, client) {
    this.api = apiUrl;
    this.client = client;
    this.site = null;
  }

  async call(params) {
    const u = new URL(this.api);
    for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', maxlag: '5', ...params })) {
      u.searchParams.set(k, v);
    }
    const data = await this.client.get(u.toString());
    if (data.error) throw new Error(`MediaWiki error ${data.error.code}: ${data.error.info}`);
    return data;
  }

  async siteinfo() {
    const d = await this.call({ action: 'query', meta: 'siteinfo', siprop: 'general|rightsinfo' });
    const g = d.query.general;
    const server = g.server.startsWith('//') ? `https:${g.server}` : g.server;
    this.site = {
      name: g.sitename,
      server,
      articlePath: g.articlepath, // e.g. /wiki/$1
      script: g.script, // e.g. /w/index.php
      rights: d.query.rightsinfo || {},
    };
    return this.site;
  }

  articleUrl(title) {
    return this.site.server + this.site.articlePath.replace('$1', encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':'));
  }

  permalink(title, revid) {
    return `${this.site.server}${this.site.script}?title=${encodeURIComponent(title.replace(/ /g, '_'))}&oldid=${revid}`;
  }

  historyUrl(title) {
    return `${this.site.server}${this.site.script}?title=${encodeURIComponent(title.replace(/ /g, '_'))}&action=history`;
  }

  diffUrl(title, fromRev, toRev) {
    return `${this.site.server}${this.site.script}?title=${encodeURIComponent(title.replace(/ /g, '_'))}&diff=${toRev}&oldid=${fromRev}`;
  }

  // Current revision, namespace and existence for up to 50 titles per request.
  // Returns Map(requestedTitle -> { title, ns, lastrevid, missing }).
  async info(titles) {
    const out = new Map();
    for (let i = 0; i < titles.length; i += 50) {
      const batch = titles.slice(i, i + 50);
      const d = await this.call({ action: 'query', prop: 'info', titles: batch.join('|'), redirects: '1' });
      const q = d.query || {};
      const alias = new Map();
      for (const n of q.normalized || []) alias.set(n.to, n.from);
      for (const r of q.redirects || []) alias.set(r.to, alias.get(r.from) || r.from);
      for (const p of q.pages || []) {
        const requested = alias.get(p.title) || p.title;
        out.set(requested, { title: p.title, ns: p.ns, lastrevid: p.lastrevid, missing: !!p.missing || !!p.invalid });
      }
    }
    return out;
  }

  // Rendered HTML of the current revision, without edit links or contents box.
  async parse(title) {
    const d = await this.call({
      action: 'parse',
      page: title,
      prop: 'text|revid|categories|displaytitle',
      redirects: '1',
      disableeditsection: '1',
      disabletoc: '1',
      disablelimitreport: '1',
    });
    const p = d.parse;
    return {
      title: p.title,
      pageid: p.pageid,
      revid: p.revid,
      html: p.text,
      categories: (p.categories || []).map((c) => c.category.replace(/_/g, ' ')),
    };
  }

  // Article titles (namespace 0 only) in a category.
  async categoryMembers(category, limit = 20) {
    const name = /^category:/i.test(category) ? category : `Category:${category}`;
    const d = await this.call({
      action: 'query',
      list: 'categorymembers',
      cmtitle: name,
      cmnamespace: '0',
      cmtype: 'page',
      cmlimit: String(Math.min(limit, 500)),
    });
    return (d.query.categorymembers || []).map((m) => m.title).slice(0, limit);
  }
}
