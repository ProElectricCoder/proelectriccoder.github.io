/**
 * editor.js — CodeMirror initialisation, document tab management, file switching.
 */

import { S } from './state.js';
import { customAlert } from './dialogs.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getModeForFile(filename) {
  if (!filename) return 'text/plain';
  if (filename.endsWith('.html'))                return 'htmlmixed';
  if (filename.endsWith('.css'))                 return 'css';
  if (filename.endsWith('.js') || filename.endsWith('.jsx') || filename.endsWith('.json')) return 'javascript';
  if (filename.endsWith('.md'))                  return 'markdown';
  if (filename.endsWith('.py'))                  return 'python';
  return 'text/plain';
}

// ─── CodeMirror init ──────────────────────────────────────────────────────────
export function initCodeMirror(containerEl) {
  S.cmEditor = CodeMirror(containerEl, {
    theme:        'cobalt',
    mode:         'htmlmixed',
    lineNumbers:  true,
    indentUnit:   4,
    tabSize:      4,
    lineWrapping: false,
    autoCloseBrackets: true,
    autoCloseTags:     true,
    matchBrackets:     true,
    foldGutter:   true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    extraKeys: {
      'Ctrl-Space': 'autocomplete',
      'Ctrl-F':     () => S._callbacks.toggleSearch?.(),
      'Cmd-F':      () => S._callbacks.toggleSearch?.(),
    },
  });

  S.cmEditor.on('change', () => {
    if (S.isSwitchingFile) return;
    S.unsavedChanges = true;
    if (S.activeFile && S.fileSystem[S.activeFile] && !S.fileSystem[S.activeFile].modified) {
      S.fileSystem[S.activeFile].modified = true;
      S._callbacks.renderSidebar?.();
      renderEditorTabs();
    }
  });

  S.cmEditor.on('cursorActivity', () => {
    const pos = S.cmEditor.getCursor();
    const el = document.getElementById('cursor-pos');
    if (el) el.innerText = `Ln ${pos.line + 1}, Col ${pos.ch + 1}`;
  });

  S.cmEditor.on('inputRead', (editor, change) => {
    if (S.isSwitchingFile || editor.state.completionActive) return;
    if (change.text[0] && /[\w.]/.test(change.text[0])) {
      CodeMirror.commands.autocomplete(editor, null, { completeSingle: false });
    }
  });
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
    const mode = (isAsset && subtype === 'svg') ? 'xml' : getModeForFile('dummy.' + ext);

    if (!S.editorDocs[filename]) {
      let initial = contentToLoad;
      if (initial === null && target.ghUrl) initial = 'Loading…';
      S.editorDocs[filename] = new CodeMirror.Doc(initial || '', mode);
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
