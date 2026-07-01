/**
 * routing.js — URL parameter handling. Fixes Task 4: ?action=github / ?action=new
 * no longer bleed into the preview iframe's query string.
 *
 * ?collab=<roomId> follows the exact same rule: it's how collaboration invite
 * links work (see js/collab.js's _inviteLink()), so it must never reach the
 * preview iframe either.
 */

import { S } from './state.js';

// ─── IDE-internal params — must NEVER be forwarded to the preview iframe ──────
const IDE_PARAMS = new Set(['file', 'action', 'collab']);

/**
 * Returns a query string containing only non-IDE params from the current URL.
 * e.g. ?file=foo.html&action=github&theme=dark  →  ?theme=dark
 * e.g. ?file=foo.html&action=github             →  (empty string)
 */
export function getSafePreviewParams() {
  const raw  = new URLSearchParams(window.location.search);
  const safe = new URLSearchParams();
  for (const [key, value] of raw.entries()) {
    if (!IDE_PARAMS.has(key)) safe.set(key, value);
  }
  const s = safe.toString();
  return s ? '?' + s : '';
}

/** Returns the ?file= param value, or null. */
export function getFileParam() {
  return new URLSearchParams(window.location.search).get('file');
}

/** Returns the ?action= param value, or null. */
export function getActionParam() {
  return new URLSearchParams(window.location.search).get('action');
}

/** Returns the ?collab= param value (a session room code), or null. */
export function getCollabParam() {
  return new URLSearchParams(window.location.search).get('collab');
}

/** Silently updates ?file= in the URL bar without navigation. */
export function updateFileParam(filename) {
  const url = new URL(window.location);
  if (filename) url.searchParams.set('file', filename);
  else          url.searchParams.delete('file');
  window.history.replaceState(null, '', url);
}

/** Removes the ?action= param after it has been consumed on init. */
export function consumeActionParam() {
  const url = new URL(window.location);
  url.searchParams.delete('action');
  window.history.replaceState(null, '', url);
}

/** Removes the ?collab= param after it has been consumed on init. */
export function consumeCollabParam() {
  const url = new URL(window.location);
  url.searchParams.delete('collab');
  window.history.replaceState(null, '', url);
}
