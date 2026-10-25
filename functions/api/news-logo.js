// functions/api/news-logo.js
// Serves the small site icon of one of the news sources used by the NewTab extension.
// The icon is fetched server-side, so visitors' browsers only ever talk to this site.
//   GET /api/news-logo?source=<id>

const DOMAINS = {
  bbc: 'bbc.com', cnn: 'cnn.com', aljazeera: 'aljazeera.com', arabnews: 'arabnews.com',
  guardian: 'theguardian.com', nyt: 'nytimes.com', npr: 'npr.org', sky: 'news.sky.com',
  cbs: 'cbsnews.com', dw: 'dw.com', france24: 'france24.com'
};

const CACHE_SECONDS = 7 * 24 * 3600;
const MAX_BYTES = 200 * 1024;

const headers = (extra = {}) => ({ 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', ...extra });

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers({ 'Access-Control-Allow-Methods': 'GET, OPTIONS' }) });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: headers() });

  const source = new URL(request.url).searchParams.get('source') || '';
  const domain = Object.hasOwn(DOMAINS, source) ? DOMAINS[source] : null;
  if (!domain) return new Response('Unknown source', { status: 400, headers: headers() });

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`https://news-logo.cache/${source}`);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, { status: 200, headers: headers({ 'Content-Type': hit.headers.get('Content-Type') || 'image/png', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` }) });
  }

  try {
    const upstream = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, { signal: AbortSignal.timeout(6000) });
    const type = upstream.headers.get('Content-Type') || '';
    if (!upstream.ok || !type.startsWith('image/')) return new Response('No icon', { status: 404, headers: headers() });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return new Response('Icon too large', { status: 502, headers: headers() });
    if (cache) await cache.put(key, new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } }));
    return new Response(bytes, { status: 200, headers: headers({ 'Content-Type': type, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` }) });
  } catch {
    return new Response('Icon unreachable', { status: 502, headers: headers() });
  }
}
