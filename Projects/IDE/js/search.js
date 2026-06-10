/**
 * search.js — Find & replace toolbar powered by CodeMirror SearchCursor.
 */

import { S } from './state.js';

// ─── Toggle toolbar ───────────────────────────────────────────────────────────
export function toggleSearch() {
  const toolbar = document.getElementById('search-toolbar');
  const input   = document.getElementById('search-input');
  if (!toolbar) return;
  if (toolbar.classList.contains('visible')) {
    toolbar.classList.remove('visible');
    S.cmEditor?.focus();
  } else {
    toolbar.classList.add('visible');
    input?.focus();
    input?.select();
  }
}

// ─── Internal: build / reset cursor ──────────────────────────────────────────
function _getCursor(query, fromStart = false) {
  if (!S.cmEditor) return null;
  const start = fromStart ? { line: 0, ch: 0 } : S.cmEditor.getCursor();
  S.lastSearchQuery = query;
  S.searchCursor    = S.cmEditor.getSearchCursor(query, start, { caseFold: true });
  return S.searchCursor;
}

function _highlight(cursor) {
  S.cmEditor.setSelection(cursor.from(), cursor.to());
  S.cmEditor.scrollIntoView({ from: cursor.from(), to: cursor.to() }, 60);
}

// ─── Find next / prev ─────────────────────────────────────────────────────────
export function findNext() {
  const val = document.getElementById('search-input')?.value;
  if (!val || !S.cmEditor) return;
  if (S.lastSearchQuery !== val || !S.searchCursor) _getCursor(val);
  if (S.searchCursor.findNext()) {
    _highlight(S.searchCursor);
  } else {
    // Wrap to beginning
    const wrapped = S.cmEditor.getSearchCursor(val, { line: 0, ch: 0 }, { caseFold: true });
    if (wrapped.findNext()) { S.searchCursor = wrapped; _highlight(S.searchCursor); }
  }
  _updateCount(val);
}

export function findPrev() {
  const val = document.getElementById('search-input')?.value;
  if (!val || !S.cmEditor) return;
  if (S.lastSearchQuery !== val || !S.searchCursor) _getCursor(val);
  if (S.searchCursor.findPrevious()) {
    _highlight(S.searchCursor);
  } else {
    // Wrap to end
    const wrapped = S.cmEditor.getSearchCursor(val, { line: S.cmEditor.lineCount(), ch: 0 }, { caseFold: true });
    if (wrapped.findPrevious()) { S.searchCursor = wrapped; _highlight(S.searchCursor); }
  }
  _updateCount(val);
}

// ─── Replace ──────────────────────────────────────────────────────────────────
export function replaceOne() {
  const findVal = document.getElementById('search-input')?.value;
  const repVal  = document.getElementById('replace-input')?.value ?? '';
  if (!findVal || !S.cmEditor) return;
  const sel = S.cmEditor.getSelection();
  if (sel.toLowerCase() === findVal.toLowerCase()) {
    S.cmEditor.replaceSelection(repVal);
    findNext();
  } else {
    findNext();
  }
}

export function replaceAll() {
  const findVal = document.getElementById('search-input')?.value;
  const repVal  = document.getElementById('replace-input')?.value ?? '';
  if (!findVal || !S.cmEditor) return;
  const cursor = S.cmEditor.getSearchCursor(findVal, { line: 0, ch: 0 }, { caseFold: true });
  let count = 0;
  while (cursor.findNext()) { cursor.replace(repVal); count++; }
  _updateCount(findVal);
}

// ─── Live count update ────────────────────────────────────────────────────────
function _updateCount(query) {
  const countEl = document.getElementById('search-count');
  if (!countEl || !S.cmEditor || !query) return;
  let n = 0;
  const c = S.cmEditor.getSearchCursor(query, { line: 0, ch: 0 }, { caseFold: true });
  while (c.findNext()) n++;
  countEl.innerText = n ? `${n}` : '0';
}
