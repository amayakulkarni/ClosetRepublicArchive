// Polite HTTP client: one request at a time per host, a minimum gap between
// requests, an honest User-Agent, robots.txt checks, and back-off when the
// server asks for it (Retry-After, 429, 503, MediaWiki maxlag).

import robotsParser from 'robots-parser';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class PoliteClient {
  constructor({ userAgent, minIntervalMs = 2000, maxRetries = 4, maxWaitMs = 120_000, log = () => {} }) {
    this.userAgent = userAgent;
    this.minIntervalMs = minIntervalMs;
    this.maxRetries = maxRetries;
    this.maxWaitMs = maxWaitMs;
    this.log = log;
    this.lastAt = new Map();
    this.robots = new Map();
    this.requests = 0;
  }

  static assertSafeUrl(url) {
    const u = new URL(url);
    if (u.protocol === 'https:') return u;
    if (u.protocol === 'http:' && LOCAL.has(u.hostname)) return u;
    throw new Error(`refusing non-HTTPS address ${url}`);
  }

  async wait(host) {
    const last = this.lastAt.get(host) || 0;
    const gap = Date.now() - last;
    if (gap < this.minIntervalMs) await sleep(this.minIntervalMs - gap);
    this.lastAt.set(host, Date.now());
  }

  async get(url, { accept = 'application/json' } = {}) {
    const u = PoliteClient.assertSafeUrl(url);
    for (let attempt = 0; ; attempt++) {
      await this.wait(u.host);
      this.requests++;
      let res;
      try {
        res = await fetch(u, {
          headers: { 'User-Agent': this.userAgent, 'Api-User-Agent': this.userAgent, Accept: accept },
          redirect: 'follow',
          signal: AbortSignal.timeout(60_000),
        });
      } catch (e) {
        throw new Error(`cannot reach ${u.host}: ${(e.cause && (e.cause.code || e.cause.message)) || e.message}`);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      let body = await res.text();
      let lagged = false;
      if (res.ok && accept === 'application/json') {
        try {
          body = JSON.parse(body);
        } catch {
          throw new Error(`${u.host} returned something that is not JSON`);
        }
        lagged = body?.error?.code === 'maxlag';
      }
      if (res.status === 429 || res.status === 503 || lagged) {
        if (attempt >= this.maxRetries) throw new Error(`${u.host} is busy (HTTP ${res.status}${lagged ? ', maxlag' : ''}); giving up for this run`);
        const waitMs = Math.min(this.maxWaitMs, (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5 * 2 ** attempt) * 1000);
        this.log(`  ${u.host} asked to slow down; waiting ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) {
        const err = new Error(`${u.host} answered HTTP ${res.status} for ${u.pathname}`);
        err.status = res.status;
        throw err;
      }
      return body;
    }
  }

  // robots.txt per origin. 4xx = no rules (allowed); 5xx or network failure =
  // treat everything as disallowed for this run (RFC 9309 section 2.3.1.4).
  async robotsFor(url) {
    const origin = new URL(url).origin;
    if (this.robots.has(origin)) return this.robots.get(origin);
    const robotsUrl = `${origin}/robots.txt`;
    let parser;
    try {
      const text = await this.get(robotsUrl, { accept: 'text/plain' });
      parser = robotsParser(robotsUrl, text);
    } catch (e) {
      if (e.status >= 400 && e.status < 500) parser = robotsParser(robotsUrl, '');
      else parser = { isAllowed: () => false, unreachable: true };
    }
    this.robots.set(origin, parser);
    return parser;
  }

  async isAllowed(url) {
    const parser = await this.robotsFor(url);
    return parser.isAllowed(url, this.userAgent) !== false;
  }
}
