/**
 * editor.js — CodeMirror 6 initialisation, document tab management, file switching.
 *
 * ── CM5 → CM6 migration ───────────────────────────────────────────────────────
 * CM6 is loaded straight from jsdelivr's ESM CDN (no bundler, no <script> tags
 * in index.html at all — everything below is a normal ES module import).
 * Because the rest of the app (fs.js, crypto.js, github.js, share.js,
 * preview.js, ui.js) all talk to `S.cmEditor` / `S.editorDocs[path]` using
 * the old CM5-style API (`.getValue()`, `.setValue()`, `.setCursor()`,
 * `.getSelection()`, `.replaceRange()`, `.swapDoc()`, `.lineCount()`, …),
 * `makeShim()` below wraps the real CM6 EditorView in an object that exposes
 * those exact same methods. Every other module is therefore unchanged.
 *
 * Per-file documents: CM6 doesn't have a lightweight "Doc" you can swap in
 * and out like CM5 did — language support, history, etc. all live on the
 * EditorState. So each open file gets its own EditorState (created with the
 * right language extension for that file), and switching files is
 * `view.setState(thatFile.state)`. A single shared `EditorView.updateListener`
 * extension (present in every file's extension list) writes the live state
 * back onto the active file's stored object on every keystroke, so
 * `editorDocs[path].getValue()` is always correct whether or not that file
 * is the one currently on screen.
 */

import { S } from './state.js';
import { customAlert } from './dialogs.js';

import { EditorState }            from 'https://esm.sh/@codemirror/state@6';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from 'https://esm.sh/@codemirror/view@6';
import { defaultKeymap, history, historyKeymap, indentWithTab } from 'https://esm.sh/@codemirror/commands@6';
import { syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, StreamLanguage } from 'https://esm.sh/@codemirror/language@6';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap, startCompletion } from 'https://esm.sh/@codemirror/autocomplete@6';
import { tags as t }              from 'https://esm.sh/@lezer/highlight@1';
import { javascript }             from 'https://esm.sh/@codemirror/lang-javascript@6';
import { html }                   from 'https://esm.sh/@codemirror/lang-html@6';
import { css }                    from 'https://esm.sh/@codemirror/lang-css@6';
import { python }                 from 'https://esm.sh/@codemirror/lang-python@6';
import { markdown }               from 'https://esm.sh/@codemirror/lang-markdown@6';
import { json }                   from 'https://esm.sh/@codemirror/lang-json@6';

// ─── Cobalt syntax highlight style (colours live in css/cm6-cobalt.css) ───────
const cobaltHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword], class: 'cm-tok-keyword' },
  { tag: [t.string, t.special(t.string), t.regexp],                        class: 'cm-tok-string' },
  { tag: [t.comment, t.lineComment, t.blockComment],                       class: 'cm-tok-comment' },
  { tag: [t.number, t.integer, t.float],                                   class: 'cm-tok-number' },
  { tag: t.bool,                                                           class: 'cm-tok-bool' },
  { tag: t.null,                                                           class: 'cm-tok-null' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)],        class: 'cm-tok-function' },
  { tag: t.definition(t.variableName),                                    class: 'cm-tok-def' },
  { tag: t.variableName,                                                  class: 'cm-tok-variable' },
  { tag: [t.typeName, t.className, t.namespace],                          class: 'cm-tok-type' },
  { tag: t.tagName,                                                       class: 'cm-tok-tag' },
  { tag: t.attributeName,                                                 class: 'cm-tok-attribute' },
  { tag: t.propertyName,                                                  class: 'cm-tok-property' },
  { tag: [t.operator, t.compareOperator, t.arithmeticOperator],           class: 'cm-tok-operator' },
  { tag: [t.bracket, t.separator, t.punctuation],                         class: 'cm-tok-punctuation' },
  { tag: t.meta,                                                          class: 'cm-tok-meta' },
  { tag: t.invalid,                                                       class: 'cm-tok-invalid' },
]);

// ─── Shared update listener: keeps the active file's stored state fresh,
//     mirrors the old 'change'/'cursorActivity' CM5 handlers ─────────────────
const _syncListener = EditorView.updateListener.of(update => {
  const shim = S.cmEditor;
  if (shim && shim._activeDoc && (update.docChanged || update.selectionSet)) {
    shim._activeDoc.state = update.state;
  }
  if (update.selectionSet) {
    const pos  = update.state.selection.main.head;
    const line = update.state.doc.lineAt(pos);
    const el   = document.getElementById('cursor-pos');
    if (el) el.innerText = `Ln ${line.number}, Col ${pos - line.from + 1}`;
  }
  if (update.docChanged && !S.isSwitchingFile) {
    S.unsavedChanges = true;
    if (S.activeFile && S.fileSystem[S.activeFile] && !S.fileSystem[S.activeFile].modified) {
      S.fileSystem[S.activeFile].modified = true;
      S._callbacks.renderSidebar?.();
      renderEditorTabs();
    }
  }
});

function baseExtensions(langExt) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    foldGutter(),
    autocompletion({ activateOnTyping: true }),
    indentUnit.of('\t'),
    syntaxHighlighting(cobaltHighlightStyle, { fallback: true }),
    EditorView.theme({}, { dark: true }),
    keymap.of([
      { key: 'Ctrl-Space', run: startCompletion },
      { key: 'Mod-f',      run: () => { S._callbacks.toggleSearch?.(); return true; } },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    _syncListener,
    langExt || [],
  ];
}

// ─── Language resolution (eager core langs + lazy dynamic-import for the rest) ─
// Dynamic import() URLs are deduped by the browser's module cache on their own,
// so unlike the old CM5 sequential-script-loader, no manual dependency
// ordering is needed here (php/clike etc. resolve their own deps via ESM).
const _langCache = new Map();

async function getLanguageExtension(ext) {
  ext = (ext || '').toLowerCase();
  if (_langCache.has(ext)) return _langCache.get(ext);

  let result;
  try {
    switch (ext) {
      case 'html': result = html({ autoCloseTags: true, matchClosingTags: true }); break;
      case 'css':  result = css(); break;
      case 'js':   result = javascript(); break;
      case 'jsx':  result = javascript({ jsx: true }); break;
      case 'ts':   result = javascript({ typescript: true }); break;
      case 'tsx':  result = javascript({ jsx: true, typescript: true }); break;
      case 'json': result = json(); break;
      case 'py':   result = python(); break;
      case 'md':   result = markdown(); break;
      case 'svg':  result = (await import('https://esm.sh/@codemirror/lang-xml@6/+esm')).xml(); break;
      case 'sql': {
        const { sql } = await import('https://esm.sh/@codemirror/lang-sql@6/+esm');
        result = sql(); break;
      }
      case 'c': case 'h': case 'cpp': case 'cc': case 'cxx': case 'hpp': {
        const { cpp } = await import('https://esm.sh/@codemirror/lang-cpp@6/+esm');
        result = cpp(); break;
      }
      case 'java': {
        const { java } = await import('https://esm.sh/@codemirror/lang-java@6/+esm');
        result = java(); break;
      }
      case 'php': {
        const { php } = await import('https://esm.sh/@codemirror/lang-php@6/+esm');
        result = php(); break;
      }
      case 'cs': {
        const clikeMod = await import('https://esm.sh/@codemirror/legacy-modes@6/mode/clike.js/+esm');
        result = StreamLanguage.define(clikeMod.csharp); break;
      }
      case 'go': {
        const goMod = await import('https://esm.sh/@codemirror/legacy-modes@6/mode/go.js/+esm');
        result = StreamLanguage.define(goMod.go); break;
      }
      case 'rs': {
        const rustMod = await import('https://esm.sh/@codemirror/legacy-modes@6/mode/rust.js/+esm');
        result = StreamLanguage.define(rustMod.rust); break;
      }
      default: result = [];
    }
  } catch (e) {
    console.warn('[DeepBlue] Language mode failed to load, falling back to plain text:', e.message);
    result = [];
  }

  _langCache.set(ext, result);
  return result;
}

// ─── Per-file "doc" object ────────────────────────────────────────────────────
// Only needs .getValue() (read by crypto.js/share.js/preview.js/syncDocsToContent)
// and .setValue() (used once, by switchFile, after a lazy GitHub fetch resolves).
function createCMDoc(content, langExt) {
  return {
    state: EditorState.create({ doc: content, extensions: baseExtensions(langExt) }),
    getValue() { return this.state.doc.toString(); },
    setValue(text) {
      if (S.cmEditor && S.cmEditor._activeDoc === this) {
        S.cmEditor.view.dispatch({ changes: { from: 0, to: S.cmEditor.view.state.doc.length, insert: text } });
        this.state = S.cmEditor.view.state;
      } else {
        this.state = this.state.update({ changes: { from: 0, to: this.state.doc.length, insert: text } }).state;
      }
    },
  };
}

// ─── CM5-compatible shim around the live EditorView ───────────────────────────
function makeShim(view) {
  return {
    view,
    _activeDoc: null,

    getValue() { return this.view.state.doc.toString(); },
    setValue(text) { this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } }); },

    getSelection() {
      const r = this.view.state.selection.main;
      return this.view.state.sliceDoc(r.from, r.to);
    },
    replaceSelection(text) {
      const r = this.view.state.selection.main;
      this.view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length } });
    },
    replaceRange(text, pos) {
      const off = this._posToOffset(pos);
      this.view.dispatch({ changes: { from: off, to: off, insert: text }, selection: { anchor: off + text.length } });
    },

    getCursor() {
      const head = this.view.state.selection.main.head;
      const line = this.view.state.doc.lineAt(head);
      return { line: line.number - 1, ch: head - line.from };
    },
    setCursor(pos) {
      const off = this._posToOffset(pos);
      this.view.dispatch({ selection: { anchor: off }, scrollIntoView: true });
    },
    setSelection(anchorPos, headPos) {
      const a = typeof anchorPos === 'number' ? anchorPos : this._posToOffset(anchorPos);
      const h = typeof headPos === 'number' ? headPos : this._posToOffset(headPos ?? anchorPos);
      this.view.dispatch({ selection: { anchor: a, head: h }, scrollIntoView: true });
    },

    lineCount() { return this.view.state.doc.lines; },
    scrollIntoView(range) {
      let pos;
      if (typeof range === 'number') pos = range;
      else if (range && typeof range.from === 'number') pos = range.from;
      else if (range && range.from) pos = this._posToOffset(range.from);
      else pos = this.view.state.selection.main.head;
      this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    },

    focus() { this.view.focus(); },
    refresh() { this.view.requestMeasure(); },

    swapDoc(doc) { this._activeDoc = doc; this.view.setState(doc.state); },

    _posToOffset(pos) {
      if (typeof pos === 'number') return pos;
      const ln   = Math.max(1, Math.min(this.view.state.doc.lines, (pos.line ?? 0) + 1));
      const line = this.view.state.doc.line(ln);
      return Math.min(line.to, line.from + (pos.ch ?? 0));
    },
  };
}

// ─── CodeMirror init ──────────────────────────────────────────────────────────
export function initCodeMirror(containerEl) {
  const view = new EditorView({
    parent: containerEl,
    state: EditorState.create({ doc: '', extensions: baseExtensions(null) }),
  });
  S.cmEditor = makeShim(view);
}

// ─── Editor Tabs ──────────────────────────────────────────────────────────────
export function renderEditorTabs() {
  const container = document.getElementById('editor-tabs');
  if (!container) return;
  container.innerHTML = '';

  S.openEditorTabs.forEach(filename => {
    const fObj = S.fileSystem[filename];
    if (!fObj) return;
    const name   = filename.split('/').pop();
    const isMod  = fObj.modified;
    const modDot = isMod ? `<span class="mod-dot">•</span>` : '';

    const tab = document.createElement('div');
    tab.className = `editor-tab ${S.activeFile === filename ? 'active' : ''}`;
    tab.onclick = e => {
      if (!e.target.closest('.editor-tab-close')) switchFile(filename);
    };
    tab.innerHTML = `<span class="editor-tab-name" title="${filename}">&lrm;${name}${modDot}</span>
      <span class="editor-tab-close" onclick="event.stopPropagation();IDE.closeEditorTab('${filename}')">✕</span>`;
    container.appendChild(tab);
  });
}

export function closeEditorTab(filename) {
  const idx = S.openEditorTabs.indexOf(filename);
  if (idx > -1) S.openEditorTabs.splice(idx, 1);

  const fObj = S.fileSystem[filename];
  if (fObj && S.editorDocs[filename]) {
    if (!filename.endsWith('.enc')) fObj.content = S.editorDocs[filename].getValue();
    if (fObj.ghUrl && !fObj.modified && fObj.subtype !== 'image') fObj.content = null;
    delete S.editorDocs[filename];
    delete S.unlockedKeys[filename];
  }

  if (S.activeFile === filename) {
    const next = S.openEditorTabs[idx - 1] || S.openEditorTabs[0] || null;
    if (next) {
      switchFile(next);
    } else {
      S.activeFile = null;
      _showBinaryOverlay('No File Selected');
      document.getElementById('editor-lang-label').innerText = 'NONE';
      const url = new URL(window.location);
      url.searchParams.delete('file');
      window.history.replaceState(null, '', url);
      renderEditorTabs();
      S._callbacks.renderSidebar?.();
    }
  } else {
    renderEditorTabs();
  }
}

// ─── File Switching ───────────────────────────────────────────────────────────
export async function switchFile(filename) {
  const target = S.fileSystem[filename];
  if (!target) return;

  // Handle encrypted files
  let isUnwrappedEnc = false;
  let decResult      = null;

  if (filename.endsWith('.enc')) {
    let unlockData = S.unlockedKeys[filename];
    let strat      = target.strategy || 'double_pass';

    if (!unlockData) {
      const res = await S._callbacks.openCryptoModalAsync?.('unlock', 'Unlock File', strat);
      if (!res) return;
      unlockData = { password: res.password, keyPath: res.keyPath };
      strat = res.strategy;
    }

    try {
      const cryptoLib = await S._callbacks.loadCryptoLib?.();
      const encBytes  = _base64ToBytes(target.content);
      let keyContent  = '';
      if (unlockData.keyPath && S.fileSystem[unlockData.keyPath]) {
        const kd = S.fileSystem[unlockData.keyPath];
        keyContent = S.editorDocs[unlockData.keyPath]
          ? S.editorDocs[unlockData.keyPath].getValue()
          : kd.content;
      }
      const secret = (unlockData.password || '') + keyContent;

      if (strat.includes('double'))     decResult = await cryptoLib.decryptFile(encBytes, secret);
      else if (strat.includes('sep'))   decResult = await cryptoLib.decryptSEP(encBytes, secret);
      else if (strat.includes('aes'))   decResult = { data: await cryptoLib.decryptAES(encBytes, secret), ext: target.originalExt || '.txt' };

      S.unlockedKeys[filename] = unlockData;
      isUnwrappedEnc = true;
      target.originalExt = decResult.ext;
      target.strategy    = strat;
    } catch {
      await customAlert('Decryption failed. Incorrect password, key, or corrupted file.', 'Error');
      delete S.unlockedKeys[filename];
      return;
    }
  }

  S.isSwitchingFile = true;
  S.activeFile = filename;

  if (!S.openEditorTabs.includes(filename)) S.openEditorTabs.push(filename);

  S._callbacks.renderSidebar?.();
  renderEditorTabs();

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set('file', filename);
  window.history.replaceState(null, '', url);

  const labelEl = document.getElementById('editor-lang-label');

  let ext          = filename.split('.').pop().toLowerCase();
  let contentToLoad= target.content;
  let isAsset      = target.type === 'asset';
  let subtype      = target.subtype;
  let labelText    = (target.type || 'text').toUpperCase();

  if (isUnwrappedEnc) {
    if (decResult.ext === '.zip') {
      _showBinaryOverlay('Encrypted Folder (Right-click → Decrypt to extract)');
      if (labelEl) labelEl.innerText = 'ENC (ZIP)';
      S.isSwitchingFile = false;
      return;
    }
    ext = decResult.ext.replace('.', '').toLowerCase();
    const textExts = ['html','css','js','jsx','json','md','txt','py','csv','xml','ts','tsx','yaml','yml','sh','bat'];
    if (textExts.includes(ext)) {
      isAsset       = false;
      contentToLoad = new TextDecoder().decode(decResult.data);
    } else if (ext === 'svg') {
      isAsset = true; subtype = 'svg';
      contentToLoad = new TextDecoder().decode(decResult.data);
    } else {
      isAsset = true; subtype = 'image';
    }
    labelText = `ENC (${ext.toUpperCase()})`;
  }

  if (isAsset && subtype !== 'svg') {
    _showBinaryOverlay(isUnwrappedEnc ? 'Encrypted Media (Run to view)' : `${filename} (${subtype})`);
    if (labelEl) labelEl.innerText = labelText !== 'ASSET' ? labelText : 'MEDIA';
  } else {
    _showEditorPane();

    let langExt = [];
    try { langExt = await getLanguageExtension(isAsset && subtype === 'svg' ? 'svg' : ext); }
    catch (e) { console.warn('[DeepBlue] Language mode failed to load, falling back to plain text:', e.message); langExt = []; }

    if (!S.editorDocs[filename]) {
      let initial = contentToLoad;
      if (initial === null && target.ghUrl) initial = 'Loading…';
      S.editorDocs[filename] = createCMDoc(initial || '', langExt);
    }

    S.cmEditor.swapDoc(S.editorDocs[filename]);

    if (contentToLoad === null && target.ghUrl && !isUnwrappedEnc) {
      try {
        target.content = await S._callbacks.fetchWithProgress?.(target.ghUrl) ?? '';
      } catch {
        target.content = '// Error loading file';
      }
      S.editorDocs[filename].setValue(target.content || '');
    }

    if (labelEl) labelEl.innerText = (isAsset && subtype === 'svg') ? 'SVG' : labelText;
  }

  S.isSwitchingFile = false;
}

// ─── Sync CM docs back to fileSystem ─────────────────────────────────────────
export async function syncDocsToContent() {
  for (const filename of Object.keys(S.editorDocs)) {
    if (!S.fileSystem[filename]) continue;
    const plainText = S.editorDocs[filename].getValue();
    if (filename.endsWith('.enc')) {
      const unlockData = S.unlockedKeys[filename];
      if (unlockData) {
        try {
          const cryptoLib = await S._callbacks.loadCryptoLib?.();
          const ext       = S.fileSystem[filename].originalExt || '.txt';
          const strategy  = S.fileSystem[filename].strategy    || 'double_pass';
          const bytes     = new TextEncoder().encode(plainText);
          let keyContent  = '';
          if (unlockData.keyPath && S.fileSystem[unlockData.keyPath]) {
            const kd = S.fileSystem[unlockData.keyPath];
            keyContent = S.editorDocs[unlockData.keyPath]
              ? S.editorDocs[unlockData.keyPath].getValue()
              : kd.content;
          }
          const secret = (unlockData.password || '') + keyContent;
          let encBytes;
          if (strategy.includes('double'))   encBytes = await cryptoLib.encryptFile(bytes, ext, secret);
          else if (strategy.includes('sep')) encBytes = await cryptoLib.encryptSEP(bytes, ext, secret);
          else if (strategy.includes('aes')) encBytes = await cryptoLib.encryptAES(bytes, secret);
          S.fileSystem[filename].content = _bytesToBase64(encBytes);
        } catch (e) { console.error('Auto-encrypt failed:', e); }
      }
    } else {
      S.fileSystem[filename].content = plainText;
    }
  }
}

// ─── Format ───────────────────────────────────────────────────────────────────
export async function formatCurrentFile() {
  if (!S.fileSystem[S.activeFile]) return;
  const content = S.cmEditor.getValue();
  let parser = null;
  if (S.activeFile.endsWith('.html')) parser = 'html';
  else if (S.activeFile.endsWith('.css')) parser = 'css';
  else if (S.activeFile.endsWith('.js'))  parser = 'babel';

  if (parser) {
    try {
      const formatted = prettier.format(content, {
        parser,
        plugins: prettierPlugins,
        tabWidth: 4,
        useTabs: true,
      });
      S.isSwitchingFile = true;
      S.cmEditor.setValue(formatted);
      S.isSwitchingFile = false;
      S.fileSystem[S.activeFile].content  = formatted;
      S.fileSystem[S.activeFile].modified = true;
      S.unsavedChanges = true;
      S._callbacks.renderSidebar?.();
    } catch (e) {
      await customAlert('Format Error: ' + e.message, 'Error');
    }
  } else {
    await customAlert('Formatting not supported for this file type.', 'Notice');
  }
}

// ─── Clear modified flags (after save) ───────────────────────────────────────
export function clearModifiedFlags() {
  Object.values(S.fileSystem).forEach(f => { f.modified = false; });
  S.deletedFiles   = [];
  S.unsavedChanges = true;
  S._callbacks.renderSidebar?.();
  renderEditorTabs();
}

// ─── Private helpers ──────────────────────────────────────────────────────────
function _showBinaryOverlay(msg) {
  const overlay   = document.getElementById('binary-overlay');
  const edWrapper = document.querySelector('.editor-wrapper');
  if (overlay)   overlay.style.display = 'flex';
  if (edWrapper) edWrapper.style.display = 'none';
  const info = document.getElementById('binary-info');
  if (info) info.innerText = msg;
}

function _showEditorPane() {
  const overlay   = document.getElementById('binary-overlay');
  const edWrapper = document.querySelector('.editor-wrapper');
  if (overlay)   overlay.style.display = 'none';
  if (edWrapper) edWrapper.style.display = 'flex';
}

function _base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function _bytesToBase64(bytes) {
  let str = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(str);
}
