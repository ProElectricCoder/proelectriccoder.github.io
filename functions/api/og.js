// functions/api/og.js
// Open Graph link previews for P2P Chat.
//   GET /api/og?url=<http(s) page>   -> JSON { url, host, title, description, siteName, image }
//   GET /api/og?img=<http(s) image>  -> the image bytes (so the reader's browser never contacts the linked site)
//
// The page is fetched by this function, never by the reader's browser. Because it fetches a URL chosen by
// whoever sent the chat message, it is hardened against server-side request forgery: only public http(s)
// hosts on ports 80/443, no IP literals or internal names, redirects are followed manually and re-checked
// on every hop, and time and size are capped. Only the first ~512 KB of a page is read.

const MAX_URL = 2048;
const MAX_HTML = 512 * 1024;
const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 6000;
const JSON_CACHE_S = 3600, IMAGE_CACHE_S = 86400;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']); // no SVG
const UA = 'Mozilla/5.0 (compatible; ProElectricCoder-LinkPreview/1.0; +https://proelectriccoder.pages.dev/)';
const ALLOWED_ORIGINS = new Set(['https://proelectriccoder.pages.dev', 'https://proelectriccoder.github.io']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp', '.private', '.test', '.invalid', '.example'];

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const h = { 'Vary': 'Origin' };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(request, body, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
    },
  });
}

// ── SSRF guard ────────────────────────────────────────────────────────────────
// Returns a URL object for a fetchable public address, or null
function safeUrl(raw, base) {
  if (typeof raw !== 'string' || raw.length > MAX_URL) return null;
  let u;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.startsWith('[') || host.includes(':')) return null;          // IPv6 literals
  if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return null;       // IPv4 literals in any notation
  if (!host.includes('.')) return null;                                           // single-label names (localhost, intranet hosts)
  if (host === 'localhost' || BLOCKED_SUFFIXES.some(s => host.endsWith(s))) return null;
  return u;
}

// fetch() that follows redirects itself so every hop goes through safeUrl()
async function safeFetch(start, accept) {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url.href, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept': accept, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('Location')) {
      const next = safeUrl(res.headers.get('Location'), url);
      if (!next) throw new Error('blocked redirect');
      url = next;
      continue;
    }
    return { res, url };
  }
  throw new Error('too many redirects');
}

// Reads at most `limit` bytes (stopping early when `stopAt` shows up in the text so far)
async function readLimited(res, limit, stopAt) {
  const reader = res.body.getReader();
  const chunks = []; let total = 0;
  const dec = new TextDecoder('utf-8', { fatal: false });
  let text = '';
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); total += value.length;
    if (stopAt) { text += dec.decode(value, { stream: true }); if (text.toLowerCase().includes(stopAt)) break; }
  }
  try { reader.cancel().catch(() => {}); } catch {}   // don't wait on the upstream to acknowledge the cancel
  const out = new Uint8Array(Math.min(total, limit)); let o = 0;
  for (const c of chunks) { const n = Math.min(c.length, out.length - o); out.set(c.subarray(0, n), o); o += n; if (o >= out.length) break; }
  return out;
}

// ── HTML parsing ──────────────────────────────────────────────────────────────
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; } catch { return ''; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const clean = (s, max) => decodeEntities(String(s || '')).replace(/\s+/g, ' ').trim().slice(0, max);

function parseHead(html) {
  const end = html.search(/<\/head>/i);
  const head = end > 0 ? html.slice(0, end) : html;
  const meta = {};
  for (const m of head.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content != null && !(key in meta)) meta[key] = attrs.content;
  }
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  return {
    title: clean(meta['og:title'] || meta['twitter:title'] || (t && t[1]), 200),
    description: clean(meta['og:description'] || meta['twitter:description'] || meta['description'], 300),
    siteName: clean(meta['og:site_name'], 80),
    image: meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || '',
  };
}

function decodeBody(bytes, contentType) {
  const label = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1] || /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder('utf-8').decode(bytes.subarray(0, 2048)))?.[1];
  try { return new TextDecoder(label || 'utf-8').decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

// ── Handlers ──────────────────────────────────────────────────────────────────
async function pagePreview(request, target, origin) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request('https://og.cache/page/' + encodeURIComponent(target.href));
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return json(request, await hit.json(), 200, JSON_CACHE_S); }

  const { res, url } = await safeFetch(target, 'text/html,application/xhtml+xml');
  if (!res.ok) return json(request, { error: 'upstream ' + res.status }, 502);
  const ct = res.headers.get('Content-Type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(ct)) return json(request, { error: 'not a web page' }, 415);

  const bytes = await readLimited(res, MAX_HTML, '</head>');
  const info = parseHead(decodeBody(bytes, ct));
  let imageUrl = null;
  if (info.image) { const u = safeUrl(clean(info.image, MAX_URL), url); if (u) imageUrl = u.href; }
  if (!info.title && !info.description && !imageUrl) return json(request, { error: 'no preview' }, 404, 600);

  const body = {
    url: url.href, host: url.hostname.replace(/^www\./, ''),
    title: info.title, description: info.description, siteName: info.siteName,
    image: imageUrl ? `${origin}/api/og?img=${encodeURIComponent(imageUrl)}` : null,
  };
  if (cache) await cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${JSON_CACHE_S}` } }));
  return json(request, body, 200, JSON_CACHE_S);
}

async function imageProxy(request, target) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request('https://og.cache/img/' + encodeURIComponent(target.href));
  const headers = {
    'Cache-Control': `public, max-age=${IMAGE_CACHE_S}`, 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return new Response(hit.body, { status: 200, headers: { ...headers, 'Content-Type': hit.headers.get('Content-Type') } }); }

  const { res } = await safeFetch(target, 'image/avif,image/webp,image/png,image/jpeg,image/gif');
  if (!res.ok) return new Response('Upstream error', { status: 502 });
  const type = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return new Response('Unsupported image type', { status: 415 });
  const declared = Number(res.headers.get('Content-Length') || 0);
  if (declared > MAX_IMAGE) return new Response('Image too large', { status: 413 });
  const bytes = await readLimited(res, MAX_IMAGE + 1);
  if (bytes.length > MAX_IMAGE) return new Response('Image too large', { status: 413 });

  if (cache) await cache.put(cacheKey, new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': `public, max-age=${IMAGE_CACHE_S}` } }));
  return new Response(bytes, { status: 200, headers: { ...headers, 'Content-Type': type } });
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);

  const reqUrl = new URL(request.url);
  const page = reqUrl.searchParams.get('url'), img = reqUrl.searchParams.get('img');
  const target = safeUrl(page ?? img ?? '');
  if (!target) return json(request, { error: 'Only public http(s) links are supported' }, 400);

  try {
    return page ? await pagePreview(request, target, reqUrl.origin) : await imageProxy(request, target);
  } catch (e) {
    return json(request, { error: 'Could not fetch that link' }, 502);
  }
}
