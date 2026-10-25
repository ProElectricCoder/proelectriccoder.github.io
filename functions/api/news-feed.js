// functions/api/news-feed.js
// Relays a few public news RSS feeds to the NewTab extension, adding CORS headers.
// Only the feeds listed below can be requested: this is not an open proxy.
//   GET /api/news-feed?source=<id>   (ids are the keys of FEEDS below)

const FEEDS = {
  bbc:       'https://feeds.bbci.co.uk/news/world/rss.xml',
  cnn:       'https://rss.cnn.com/rss/edition_world.rss',
  aljazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  arabnews:  'https://www.arabnews.com/rss.xml',
  guardian:  'https://www.theguardian.com/world/rss',
  nyt:       'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  npr:       'https://feeds.npr.org/1004/rss.xml',
  sky:       'https://feeds.skynews.com/feeds/rss/world.xml',
  cbs:       'https://www.cbsnews.com/latest/rss/world',
  dw:        'https://rss.dw.com/rdf/rss-en-world',
  france24:  'https://www.france24.com/en/rss'
};

const MAX_BYTES = 2 * 1024 * 1024;   // refuse oversized responses
const CACHE_SECONDS = 600;           // headlines are re-fetched from the source at most every 10 minutes

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function reply(body, status, extra = {}) {
  return new Response(body, { status, headers: { ...CORS, ...extra } });
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return reply(null, 204);
  if (request.method !== 'GET') return reply('Method not allowed', 405);

  const source = new URL(request.url).searchParams.get('source');
  const feedUrl = Object.hasOwn(FEEDS, source || '') ? FEEDS[source] : null;
  if (!feedUrl) return reply('Unknown source', 400);

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://news-feed.cache/${source}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return reply(await hit.text(), 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}`, 'X-Cache': 'HIT' });
  }

  try {
    const upstream = await fetch(feedUrl, {
      headers: { 'User-Agent': 'ProElectricCoder-NewTab/1.0 (+https://proelectriccoder.pages.dev/Projects/NewTab/)', 'Accept': 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(8000)
    });
    if (!upstream.ok) return reply('Upstream error', 502);
    const text = await upstream.text();
    if (text.length > MAX_BYTES) return reply('Feed too large', 502);

    if (cache) {
      await cache.put(cacheKey, new Response(text, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } }));
    }
    return reply(text, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}`, 'X-Cache': 'MISS' });
  } catch {
    return reply('Upstream unreachable', 502);
  }
}
