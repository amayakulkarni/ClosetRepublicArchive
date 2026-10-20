// Wiki.js 2 GraphQL client (POST /graphql with an API key).
// The importer's key belongs to a group that may only write under drafts/.

export class WikiJs {
  constructor({ url, apiKey, locale, editor }) {
    this.url = url;
    this.apiKey = apiKey;
    this.locale = locale;
    this.editor = editor;
  }

  async gql(query, variables) {
    const res = await fetch(`${this.url}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Wiki.js answered HTTP ${res.status}`);
    const body = await res.json();
    if (body.errors && body.errors.length) {
      const err = new Error(`Wiki.js: ${body.errors.map((e) => e.message).join('; ')}`);
      err.graphql = body.errors;
      throw err;
    }
    return body.data;
  }

  static check(result, action) {
    const r = result && result.responseResult;
    if (!r || !r.succeeded) throw new Error(`Wiki.js could not ${action}: ${r ? `${r.slug || r.errorCode}: ${r.message}` : 'no response'}`);
    return result;
  }

  // Returns { id, path, isPublished, updatedAt } or null if the page is gone.
  async getPage(id) {
    try {
      const d = await this.gql(
        'query ($id: Int!) { pages { single(id: $id) { id path isPublished updatedAt } } }',
        { id },
      );
      return d.pages.single || null;
    } catch (e) {
      if (e.graphql && e.graphql.some((g) => /not exist|not found|PageNotFound/i.test(g.message))) return null;
      throw e;
    }
  }

  async createPage({ path, title, description, content, tags }) {
    const d = await this.gql(
      `mutation ($content: String!, $description: String!, $editor: String!, $isPublished: Boolean!, $isPrivate: Boolean!,
                 $locale: String!, $path: String!, $tags: [String]!, $title: String!) {
        pages { create(content: $content, description: $description, editor: $editor, isPublished: $isPublished,
                       isPrivate: $isPrivate, locale: $locale, path: $path, tags: $tags, title: $title) {
          responseResult { succeeded errorCode slug message }
          page { id path }
        } }
      }`,
      // isPublished is always false: imports are drafts until a reviewer publishes them.
      { content, description, editor: this.editor, isPublished: false, isPrivate: false, locale: this.locale, path, tags, title },
    );
    return WikiJs.check(d.pages.create, `create ${path}`).page;
  }

  async updateDraft(id, { title, description, content, tags }) {
    const d = await this.gql(
      `mutation ($id: Int!, $content: String, $description: String, $isPublished: Boolean, $tags: [String], $title: String) {
        pages { update(id: $id, content: $content, description: $description, isPublished: $isPublished, tags: $tags, title: $title) {
          responseResult { succeeded errorCode slug message }
        } }
      }`,
      { id, content, description, isPublished: false, tags, title },
    );
    WikiJs.check(d.pages.update, `update page ${id}`);
  }
}
