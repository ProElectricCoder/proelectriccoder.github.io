// functions/api/callback.js

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Popup mode (P2P Chat Drive backup): state = "pec-chat|<encoded opener origin>|<nonce>".
  // Instead of redirecting the whole page (which would drop live chat connections) the tokens are
  // handed to the opener window with postMessage and the popup closes. The existing redirect flow
  // below (used by the IDE) is unchanged.
  const state = url.searchParams.get('state') || '';
  if (state.startsWith('pec-chat|')) return handleChatPopup(context, url, state);

  // 1. Extract the authorization code Google attached to the URL
  const code = url.searchParams.get('code');
  
  if (!code) {
    return new Response("Missing authorization code from Google.", { status: 400 });
  }

  // 2. Fetch the secrets you stored safely in Cloudflare environment variables
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  
  // This must precisely match the redirect URI you registered in Google Cloud Console
  const redirectUri = `${url.origin}/api/callback`; 

  try {
    // 3. Make a secure POST request to Google's token exchange endpoint
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      return new Response(`Google Token Exchange Failed: ${errorData}`, { status: 500 });
    }

    const tokenData = await tokenResponse.json();

    // 4. Send the tokens down to the frontend so the IDE can use them.
    // The "access_token" lets you save/read files.
    // The "refresh_token" (if provided) lets you request a new access_token when it expires.
    const frontendPayload = {
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in,
      refreshToken: tokenData.refresh_token || null
    };

    // 5. Securely send the data to the user.
    // We pass it via HTML script so your Frontend JS can easily catch it and save it in localStorage.
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
      <head><title>Authentication Successful</title></head>
      <body>
        <p>Connecting to DeepBlue IDE...</p>
        <script>
          // Send the tokens to the main IDE window and close the login popup (if used)
          // or save directly and redirect.
          const tokens = ${JSON.stringify(frontendPayload)};
          localStorage.setItem('google_drive_tokens', JSON.stringify(tokens));
          
          // Redirect the user back to the main IDE home screen
          window.location.href = '/Projects/IDE/';
        </script>
      </body>
      </html>
    `;

    return new Response(htmlResponse, {
      headers: { 'Content-Type': 'text/html' },
    });

  } catch (error) {
    return new Response(`Server error during OAuth exchange: ${error.message}`, { status: 500 });
  }
}

const CHAT_ORIGINS = new Set(['https://proelectriccoder.pages.dev', 'https://proelectriccoder.github.io']);

// JSON for embedding inside an inline <script>: "<" is escaped so no value can close the tag
function safeJson(v) { return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, ''); }

function popupPage(origin, payload) {
  return new Response(`<!DOCTYPE html><html><head><title>Google Drive</title></head><body>
<p>You can close this window.</p>
<script>
  try { window.opener && window.opener.postMessage(${safeJson(payload)}, ${safeJson(origin)}); } catch (e) {}
  window.close();
</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function handleChatPopup({ env }, url, state) {
  const [, encOrigin = '', nonce = ''] = state.split('|');
  let origin = '';
  try { origin = decodeURIComponent(encOrigin); } catch {}
  if (!CHAT_ORIGINS.has(origin) || !/^[A-Za-z0-9_-]{8,64}$/.test(nonce)) {
    return new Response('Invalid state', { status: 400 });
  }
  const code = url.searchParams.get('code');
  if (!code) return popupPage(origin, { type: 'pec-drive-tokens', nonce, error: url.searchParams.get('error') || 'Authorization was cancelled' });
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${url.origin}/api/callback`, grant_type: 'authorization_code',
      }),
    });
    if (!r.ok) return popupPage(origin, { type: 'pec-drive-tokens', nonce, error: 'Google token exchange failed' });
    const t = await r.json();
    return popupPage(origin, { type: 'pec-drive-tokens', nonce, tokens: { accessToken: t.access_token, expiresIn: t.expires_in, refreshToken: t.refresh_token || null } });
  } catch (e) {
    return popupPage(origin, { type: 'pec-drive-tokens', nonce, error: 'Server error during sign-in' });
  }
}
