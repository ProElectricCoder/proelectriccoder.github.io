/**
 * gdrive.js — Google Drive integration for DeepBlue IDE
 * Backend endpoints (Cloudflare Pages Functions):
 *   POST /api/save-drive  — saves a file to Drive
 *   POST /api/read-drive  — reads a file from Drive
 *   GET  /api/callback    — OAuth exchange (handled server-side, redirects back here)
 *
 * ── Setup ─────────────────────────────────────────────────────────────────────
 *  1. Replace GOOGLE_CLIENT_ID with your OAuth 2.0 Web Client ID
 *     (Google Cloud Console → APIs & Services → Credentials)
 *  2. Replace GOOGLE_APP_ID with your numeric Cloud Project ID
 *     (Visible in Cloud Console → Dashboard, e.g. "629115974151")
 *  3. (Optional) Replace GOOGLE_API_KEY for Drive Picker search support
 *  4. Add your redirect URI to the OAuth client's Authorised Redirect URIs:
 *       https://<your-domain>/api/callback
 */

// ── Configuration ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '629115974151-be9vfilk42ou68lctco3sa2h44ioolqr.apps.googleusercontent.com';
const GOOGLE_APP_ID    = '629115974151';   // e.g. "629115974151"
const GOOGLE_API_KEY   = 'AIzaSyD18jSpzYIe5hp1jGv22kO0Zzu3I09ra-c'; // optional, enables Picker search
const DRIVE_SCOPE      = 'https://www.googleapis.com/auth/drive.file';

// ── Token helpers ─────────────────────────────────────────────────────────────
function _getTokens() {
  try { return JSON.parse(localStorage.getItem('google_drive_tokens') || 'null'); }
  catch { return null; }
}

/** Returns true when a Drive access token is present in localStorage. */
export function isGdriveConnected() {
  return !!_getTokens()?.accessToken;
}

/** Removes Drive tokens from localStorage and updates the UI button. */
export function gdriveSignOut() {
  localStorage.removeItem('google_drive_tokens');
  _updateGdriveBtn();
}

/** Reflects connected state on the header button (called after init / token change). */
export function _updateGdriveBtn() {
  const btn = document.getElementById('gdrive-btn');
  if (!btn) return;
  const connected = isGdriveConnected();
  btn.title = connected ? 'Google Drive connected — click to sign out' : 'Connect Google Drive';
  btn.style.color = connected ? 'var(--accent)' : '';
  btn.style.borderColor = connected ? 'var(--accent)' : '';
}

// ── 1. OAuth Login ────────────────────────────────────────────────────────────
/**
 * Redirects to Google OAuth consent screen.
 * After approval Google calls /api/callback, which exchanges the code for tokens,
 * stores them in localStorage, and redirects back to the IDE root.
 *
 * If a Drive token is already present, clicking the button signs out instead.
 */
export function toggleGdriveAuth() {
  if (isGdriveConnected()) {
    gdriveSignOut();
    return;
  }
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  `${window.location.origin}/api/callback`,
    response_type: 'code',
    scope:         DRIVE_SCOPE,
    access_type:   'offline',   // request refresh token
    prompt:        'consent',   // always show consent to guarantee refresh_token
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── 2. Save to Google Drive ───────────────────────────────────────────────────
/**
 * Saves text content to a new Google Drive file via the /api/save-drive endpoint.
 *
 * @param  {string} fileName        e.g. "index.html"
 * @param  {string} fileTextContent The file's text content
 * @returns {Promise<{success: boolean, id: string}>}
 * @throws  {Error} if not authenticated or request fails
 *
 * @example
 *   const result = await saveCurrentFileToGoogleDrive('index.html', editor.getValue());
 *   console.log('Saved with Drive ID:', result.id);
 */
export async function saveCurrentFileToGoogleDrive(fileName, fileTextContent) {
  const tokens = _getTokens();
  if (!tokens?.accessToken) {
    throw new Error('Not connected to Google Drive. Please sign in first.');
  }

  const response = await fetch('/api/save-drive', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${tokens.accessToken}`,
    },
    body: JSON.stringify({ name: fileName, content: fileTextContent }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Drive save failed (${response.status}): ${text}`);
  }

  return response.json(); // { success: true, id: "1BxiMV...mfQ" }
}

// ── 3. Read from Google Drive (used internally by the Picker) ─────────────────
/**
 * Fetches text content for a file from Google Drive via /api/read-drive.
 *
 * @param  {string} fileId  Google Drive file ID (from picker event or known ID)
 * @returns {Promise<string>} the file's text content
 */
export async function readFileFromGoogleDrive(fileId) {
  const tokens = _getTokens();
  if (!tokens?.accessToken) {
    throw new Error('Not connected to Google Drive. Please sign in first.');
  }

  const response = await fetch('/api/read-drive', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${tokens.accessToken}`,
    },
    body: JSON.stringify({ fileId }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Drive read failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.content; // string
}

// ── 4. Drive Picker Web Component Setup ───────────────────────────────────────
/**
 * Wires up the <drive-picker> custom element (CDN:
 * https://unpkg.com/@googleworkspace/drive-picker-element@latest/dist/index.js).
 *
 * The element must already exist in the DOM:
 *   <drive-picker id="gdrive-picker" app-id="..." client-id="..."></drive-picker>
 *
 * Call this once from your main init. The picker's OAuth token is refreshed
 * from localStorage each time it opens.
 *
 * @param {function} onFilePicked  Receives (fileId, fileName, textContent)
 *                                 after a file is selected and fetched.
 */
export function initDrivePicker(onFilePicked) {
  const picker = document.getElementById('gdrive-picker');
  if (!picker) {
    console.warn('[GDrive] <drive-picker id="gdrive-picker"> not found in DOM.');
    return;
  }

  // Stamp the access token onto the element whenever it's about to open
  const _refreshToken = () => {
    const tokens = _getTokens();
    if (tokens?.accessToken) {
      picker.setAttribute('oauth-token', tokens.accessToken);
    }
  };

  // Refresh before each open so stale tokens aren't used
  picker.addEventListener('click', _refreshToken);
  _refreshToken(); // apply immediately if already connected

  // ── File selected ────────────────────────────────────────────────────────
  picker.addEventListener('picker:picked', async (event) => {
    const docs = event.detail?.docs;
    if (!docs || docs.length === 0) return;

    const file     = docs[0];
    const fileId   = file.id;
    const fileName = file.name;

    try {
      const content = await readFileFromGoogleDrive(fileId);
      onFilePicked(fileId, fileName, content);
    } catch (err) {
      console.error('[GDrive] Failed to read picked file:', err.message);
      // Surface error to user via the IDE's dialog system if available
      window.IDE?.alert?.(`Drive read error: ${err.message}`, 'Google Drive');
    }
  });

  // ── Picker cancelled ─────────────────────────────────────────────────────
  picker.addEventListener('picker:canceled', () => {
    // No-op — nothing to do when the user closes without picking
  });

  // ── Picker error ─────────────────────────────────────────────────────────
  picker.addEventListener('picker:error', (event) => {
    console.error('[GDrive] Picker error:', event.detail);
  });
}

// ── 5. Open the picker programmatically ──────────────────────────────────────
/**
 * Triggers the Drive Picker dialog to open.
 * Guards against calling it when the user isn't authenticated.
 */
export function openDrivePicker() {
  if (!isGdriveConnected()) {
    toggleGdriveAuth(); // redirect to login
    return;
  }
  const picker = document.getElementById('gdrive-picker');
  if (!picker) return;

  // Refresh token first
  const tokens = _getTokens();
  if (tokens?.accessToken) picker.setAttribute('oauth-token', tokens.accessToken);

  // @googleworkspace/drive-picker-element opens via the `open` attribute
  picker.setAttribute('open', '');
}