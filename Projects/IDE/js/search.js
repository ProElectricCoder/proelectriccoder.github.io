/**
 * search.js — Find & replace toolbar, ported from CM5's getSearchCursor to
 * CM6's @codemirror/search SearchCursor. Talks directly to S.cmEditor.view
 * (the real EditorView, exposed by editor.js's shim) rather than going
 * through CM5-style cursor objects, since SearchCursor's iterator API
 * (`.next()` → `{value:{from,to}, done}`) is different enough that a thin
 * shim wasn't worth it — this module owns its own search logic instead.
 */

import { S } from './state.js';
import { SearchCursor } from 'https://cdn.jsdelivr.net/npm/@codemirror/search@6/+esm';

const _norm = s => s.toLowerCase();

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

function _view() { return S.cmEditor?.view || null; }

function _highlight(from, to) {
  S.cmEditor?.setSelection(from, to);
  S.cmEditor?.scrollIntoView({ from }, 60);
}

// ─── Find next / prev ─────────────────────────────────────────────────────────
export function findNext() {
  const val  = document.getElementById('search-input')?.value;
  const view = _view();
  if (!val || !view) return;

  const fromPos = view.state.selection.main.to;
  let cursor = new SearchCursor(view.state.doc, val, fromPos, view.state.doc.length, _norm);
  let result = cursor.next();
  if (result.done) {
    cursor = new SearchCursor(view.state.doc, val, 0, view.state.doc.length, _norm);
    result = cursor.next();
  }
  if (!result.done) _highlight(result.value.from, result.value.to);
  _updateCount(val);
}

export function findPrev() {
  const val  = document.getElementById('search-input')?.value;
  const view = _view();
  if (!val || !view) return;

  const beforePos = view.state.selection.main.from;
  let last = null;
  let cursor = new SearchCursor(view.state.doc, val, 0, view.state.doc.length, _norm);
  let r = cursor.next();
  while (!r.done && r.value.to <= beforePos) { last = r.value; r = cursor.next(); }

  if (!last) {
    // Wrap: take the last match in the whole document.
    cursor = new SearchCursor(view.state.doc, val, 0, view.state.doc.length, _norm);
    r = cursor.next();
    while (!r.done) { last = r.value; r = cursor.next(); }
  }
  if (last) _highlight(last.from, last.to);
  _updateCount(val);
}

// ─── Replace ──────────────────────────────────────────────────────────────────
export function replaceOne() {
  const findVal = document.getElementById('search-input')?.value;
  const repVal  = document.getElementById('replace-input')?.value ?? '';
  const view = _view();
  if (!findVal || !view) return;

  const sel     = view.state.selection.main;
  const selText = view.state.sliceDoc(sel.from, sel.to);
  if (selText.toLowerCase() === findVal.toLowerCase()) {
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: repVal } });
  }
  findNext();
}

export function replaceAll() {
  const findVal = document.getElementById('search-input')?.value;
  const repVal  = document.getElementById('replace-input')?.value ?? '';
  const view = _view();
  if (!findVal || !view) return;

  const changes = [];
  const cursor  = new SearchCursor(view.state.doc, findVal, 0, view.state.doc.length, _norm);
  let r = cursor.next();
  while (!r.done) { changes.push({ from: r.value.from, to: r.value.to, insert: repVal }); r = cursor.next(); }
  if (changes.length) view.dispatch({ changes });
  _updateCount(findVal);
}

// ─── Live count update ────────────────────────────────────────────────────────
function _updateCount(query) {
  const countEl = document.getElementById('search-count');
  const view    = _view();
  if (!countEl || !view || !query) return;
  let n = 0;
  const cursor = new SearchCursor(view.state.doc, query, 0, view.state.doc.length, _norm);
  let r = cursor.next();
  while (!r.done) { n++; r = cursor.next(); }
  countEl.innerText = n ? `${n}` : '0';
}