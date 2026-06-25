/**
 * gdrive.js — Google Drive integration for DeepBlue IDE
 * Backend endpoints (Cloudflare Pages Functions):
 *   POST /api/save-drive  — saves a file to Drive (now binary-safe, see below)
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
 *
 * ── Workspace "Edit in Docs/Sheets/Slides/Photos" buttons ──────────────────────
 * openFileInWorkspace() below: connects (if needed), silently uploads the
 * given virtual file to Drive, then opens it directly in the matching
 * Workspace app. For Docs/Sheets/Slides this uses Drive's own upload-time
 * conversion (set the Drive metadata mimeType to the target Google-native
 * type while sending the source bytes/mimeType as-is — Drive converts
 * compatible formats automatically, e.g. a .csv becomes a real Sheet).
 *
 * NOTE — Photos specifically: there's no Drive-native equivalent of an
 * image, and *actually* opening something in the Google Photos app requires
 * the separate Photos Library API (a different OAuth scope/consent screen
 * than this app's existing `drive.file` scope). Rather than silently
 * pretending to do that, images are uploaded to Drive and opened in Drive's
 * own viewer instead — the closest equivalent without adding a second
 * consent flow. Wiring up real Photos Library API support would be the next
 * step if that's wanted.
 */

// ── Configuration ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '629115974151-be9vfilk42ou68lctco3sa2h44ioolqr.apps.googleusercontent.com';
const GOOGLE_APP_ID    = '629115974151';
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

// ── 2. Save to Google Drive (binary-safe) ─────────────────────────────────────
/**
 * @param  {string} fileName
 * @param  {string} contentBase64   Base64-encoded raw bytes of the file.
 * @param  {string} sourceMimeType  The actual format of those bytes (e.g. "text/plain", "image/png", "text/csv").
 * @param  {string} [targetMimeType] If different from sourceMimeType (e.g. a Google-native
 *                                    "application/vnd.google-apps.*" type), Drive converts on upload.
 * @returns {Promise<{success: boolean, id: string}>}
 */
export async function saveCurrentFileToGoogleDrive(fileName, contentBase64, sourceMimeType = 'text/plain', targetMimeType = null) {
  const tokens = _getTokens();
  if (!tokens?.accessToken) throw new Error('Not connected to Google Drive. Please sign in first.');

  const response = await fetch('/api/save-drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.accessToken}` },
    body: JSON.stringify({
      name: fileName,
      contentBase64,
      sourceMimeType,
      targetMimeType: targetMimeType || sourceMimeType,
    }),
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

// ── 5. "Edit in <Workspace app>" — upload then open ────────────────────────────
const WORKSPACE_TARGET_MIME = {
  docs:   'application/vnd.google-apps.document',
  sheets: 'application/vnd.google-apps.spreadsheet',
  slides: 'application/vnd.google-apps.presentation',
  // photos: intentionally no conversion target — see file header note above.
};
const WORKSPACE_OPEN_URL = {
  docs:   id => `https://docs.google.com/document/d/${id}/edit`,
  sheets: id => `https://docs.google.com/spreadsheets/d/${id}/edit`,
  slides: id => `https://docs.google.com/presentation/d/${id}/edit`,
  photos: id => `https://drive.google.com/file/d/${id}/view`,
};

/**
 * Connects to Drive (if needed), silently uploads the given virtual file,
 * then opens it in the matching Workspace app's editor in a new tab.
 *
 * @param {string} filePath   Full virtual path, e.g. "DeepBlue/diagram.png"
 * @param {string} app        'docs' | 'sheets' | 'slides' | 'photos'
 * @param {object} fileSystem S.fileSystem
 */
export async function openFileInWorkspace(filePath, app, fileSystem) {
  if (!isGdriveConnected()) {
    toggleGdriveAuth();
    return { started: false, reason: 'not-connected' };
  }

  const fObj = fileSystem[filePath];
  if (!fObj) return { started: false, reason: 'missing-file' };
  const fileName = filePath.split('/').pop();

  let contentBase64, sourceMimeType;
  if (fObj.type === 'asset' && fObj.subtype === 'svg') {
    contentBase64  = btoa(unescape(encodeURIComponent(fObj.content || '')));
    sourceMimeType = 'image/svg+xml';
  } else if (fObj.type === 'asset' && typeof fObj.src === 'string') {
    const match = fObj.src.match(/^data:([^;]+);base64,([\s\S]*)$/);
    if (!match) return { started: false, reason: 'unsupported-content' };
    sourceMimeType = match[1];
    contentBase64  = match[2];
  } else {
    return { started: false, reason: 'unsupported-content' };
  }

  const targetMimeType = WORKSPACE_TARGET_MIME[app] || sourceMimeType;
  const result  = await saveCurrentFileToGoogleDrive(fileName, contentBase64, sourceMimeType, targetMimeType);
  const openUrl = (WORKSPACE_OPEN_URL[app] || WORKSPACE_OPEN_URL.photos)(result.id);
  window.open(openUrl, '_blank');
  return { started: true, id: result.id };
}