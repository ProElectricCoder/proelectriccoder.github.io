// functions/api/callback.js

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
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
          window.location.href = '/';
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
