// functions/api/site-icon.js
// Serves the small icon of a website for the NewTab extension's search-engine list.
// The icon is fetched server-side from Google's favicon service, so visitors' browsers only talk to this site.
//   GET /api/site-icon?domain=youtube.com

const HOST_RE = /^(?=.{4,80}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;   // a plain host name: no ports, paths, IP addresses or "localhost"
const CACHE_SECONDS = 7 * 24 * 3600;
const MAX_BYTES = 200 * 1024;

const headers = (extra = {}) => ({ 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', ...extra });

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers({ 'Access-Control-Allow-Methods': 'GET, OPTIONS' }) });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: headers() });

  const domain = (new URL(request.url).searchParams.get('domain') || '').toLowerCase();
  if (!HOST_RE.test(domain)) return new Response('Invalid domain', { status: 400, headers: headers() });

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`https://site-icon.cache/${domain}`);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, { status: 200, headers: headers({ 'Content-Type': hit.headers.get('Content-Type') || 'image/png', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` }) });
  }

  try {
    const upstream = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, { signal: AbortSignal.timeout(6000) });
    const type = upstream.headers.get('Content-Type') || '';
    if (!upstream.ok || !type.startsWith('image/') || type.includes('svg')) return new Response('No icon', { status: 404, headers: headers() });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return new Response('Icon too large', { status: 502, headers: headers() });
    if (cache) await cache.put(key, new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } }));
    return new Response(bytes, { status: 200, headers: headers({ 'Content-Type': type, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` }) });
  } catch {
    return new Response('Icon unreachable', { status: 502, headers: headers() });
  }
}
