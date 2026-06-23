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
 *  3. Add your redirect URI to the OAuth client's Authorised Redirect URIs:
 *       https://<your-domain>/api/callback
 *
 * ── Why everything here is lazy ────────────────────────────────────────────────
 * Nothing in this module touches the network, mounts DOM, or loads the Drive
 * Picker's script UNTIL the person explicitly clicks something. Earlier the
 * <drive-picker> element + its CDN script were present on every page load,
 * which made the component initialize itself immediately and pop the Google
 * sign-in screen on its own. Now the element and its script are only created
 * inside openDrivePicker(), the moment it's actually requested.
 */

// ── Configuration ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_APP_ID    = 'YOUR_NUMERIC_PROJECT_ID';   // e.g. "629115974151"
const DRIVE_SCOPE      = 'https://www.googleapis.com/auth/drive.file';
const PICKER_SCRIPT_URL = 'https://unpkg.com/@googleworkspace/drive-picker-element@latest/dist/index.js';

// ── Token helpers ─────────────────────────────────────────────────────────────
function _getTokens() {
  try { return JSON.parse(localStorage.getItem('google_drive_tokens') || 'null'); }
  catch { return null; }
}

/** Returns true when a Drive access token is present in localStorage. */
export function isGdriveConnected() {
  return !!_getTokens()?.accessToken;
}

/** Removes Drive tokens from localStorage and updates the header button. */
export function gdriveSignOut() {
  localStorage.removeItem('google_drive_tokens');
  _updateGdriveBtn();
}

/**
 * Reflects connected state via the button's title/aria-label only — no color
 * change, by design. (Open the Drive dropdown to see Connect vs. Sign Out.)
 */
export function _updateGdriveBtn() {
  const btn = document.getElementById('drive-btn');
  if (!btn) return;
  const connected = isGdriveConnected();
  btn.title = connected ? 'Google Drive (connected)' : 'Google Drive (not connected)';
  btn.setAttribute('aria-label', btn.title);
}

// ── 1. OAuth Login — only runs when explicitly invoked (button click) ─────────
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
    access_type:   'offline',
    prompt:        'consent',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── 2. Save to Google Drive ───────────────────────────────────────────────────
/**
 * @param  {string} fileName
 * @param  {string} fileTextContent
 * @returns {Promise<{success: boolean, id: string}>}
 */
export async function saveCurrentFileToGoogleDrive(fileName, fileTextContent) {
  const tokens = _getTokens();
  if (!tokens?.accessToken) throw new Error('Not connected to Google Drive. Please sign in first.');

  const response = await fetch('/api/save-drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.accessToken}` },
    body: JSON.stringify({ name: fileName, content: fileTextContent }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Drive save failed (${response.status}): ${text}`);
  }
  return response.json();
}

// ── 3. Read from Google Drive ──────────────────────────────────────────────────
export async function readFileFromGoogleDrive(fileId) {
  const tokens = _getTokens();
  if (!tokens?.accessToken) throw new Error('Not connected to Google Drive. Please sign in first.');

  const response = await fetch('/api/read-drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.accessToken}` },
    body: JSON.stringify({ fileId }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Drive read failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return data.content;
}

// ── 4. Drive Picker — lazily loaded & mounted ──────────────────────────────────
let _onFilePicked   = null;
let _pickerScriptP   = null;  // in-flight/loaded script promise (cached)
let _pickerEl        = null;  // the <drive-picker> element, created on first use

/**
 * Registers the callback to run once a file is picked from Drive.
 * Cheap and synchronous — does NOT load any script or touch the DOM, so it's
 * safe to call unconditionally during app init.
 *
 * @param {function(fileId, fileName, textContent)} cb
 */
export function setDrivePickedHandler(cb) {
  _onFilePicked = cb;
}

function _loadPickerScript() {
  if (_pickerScriptP) return _pickerScriptP;
  _pickerScriptP = import(/* @vite-ignore */ PICKER_SCRIPT_URL).catch(err => {
    _pickerScriptP = null; // allow retry on next attempt
    throw err;
  });
  return _pickerScriptP;
}

function _ensurePickerElement() {
  if (_pickerEl) return _pickerEl;

  _pickerEl = document.createElement('drive-picker');
  _pickerEl.id = 'gdrive-picker';
  if (GOOGLE_APP_ID && GOOGLE_APP_ID !== 'YOUR_NUMERIC_PROJECT_ID') _pickerEl.setAttribute('app-id', GOOGLE_APP_ID);
  if (GOOGLE_CLIENT_ID) _pickerEl.setAttribute('client-id', GOOGLE_CLIENT_ID);
  document.body.appendChild(_pickerEl);

  _pickerEl.addEventListener('picker:picked', async (event) => {
    const docs = event.detail?.docs;
    if (!docs || docs.length === 0) return;
    const file = docs[0];
    try {
      const content = await readFileFromGoogleDrive(file.id);
      _onFilePicked?.(file.id, file.name, content);
    } catch (err) {
      console.error('[GDrive] Failed to read picked file:', err.message);
    }
  });
  _pickerEl.addEventListener('picker:error', (event) => {
    console.error('[GDrive] Picker error:', event.detail);
  });

  return _pickerEl;
}

/**
 * Opens the Drive file picker. Loads the picker script and mounts the
 * <drive-picker> element on first call only — nothing Drive-Picker-related
 * exists in the page until this runs.
 */
export async function openDrivePicker() {
  if (!isGdriveConnected()) { toggleGdriveAuth(); return; }

  try {
    await _loadPickerScript();
  } catch (err) {
    console.error('[GDrive] Failed to load Drive Picker:', err.message);
    return;
  }

  const picker = _ensurePickerElement();
  const tokens = _getTokens();
  if (tokens?.accessToken) picker.setAttribute('oauth-token', tokens.accessToken);
  picker.setAttribute('open', '');
}