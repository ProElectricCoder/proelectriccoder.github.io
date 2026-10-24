// functions/api/drive-refresh.js
// Exchanges a Google refresh token for a fresh access token so Drive backups keep working past the
// 1-hour access-token lifetime. The client secret never leaves the server.
const ALLOWED = new Set(['https://proelectriccoder.pages.dev', 'https://proelectriccoder.github.io']);

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const h = { 'Vary': 'Origin', 'Cache-Control': 'no-store' };
  if (origin && ALLOWED.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return h;
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  const headers = { ...corsHeaders(request), 'Content-Type': 'application/json' };
  let refreshToken;
  try { ({ refreshToken } = await request.json()); } catch {}
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return new Response(JSON.stringify({ error: 'Missing refreshToken' }), { status: 400, headers });
  }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken, client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token',
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) {
      // 400 = the grant is no longer valid (revoked/expired): the client must reconnect
      return new Response(JSON.stringify({ error: d.error || 'refresh_failed' }), { status: r.status === 400 ? 400 : 502, headers });
    }
    return new Response(JSON.stringify({ accessToken: d.access_token, expiresIn: d.expires_in }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers });
  }
}
