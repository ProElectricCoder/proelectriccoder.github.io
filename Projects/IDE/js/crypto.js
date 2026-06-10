/**
 * crypto.js — SEP encryption/decryption modal, virtual-FS crypto operations.
 */

import { S } from './state.js';
import { customAlert } from './dialogs.js';
import { syncDocsToContent } from './editor.js';
import { renderEditorTabs } from './editor.js';

// ─── Lazy-load sep-crypto.js ──────────────────────────────────────────────────
let _cryptoLib = null;
export async function loadCryptoLib() {
  if (_cryptoLib) return _cryptoLib;
  try {
    _cryptoLib = await import('https://proelectriccoder.github.io/Projects/SEP/sep-crypto.js');
  } catch {
    _cryptoLib = await import('../SEP/sep-crypto.js');
  }
  return _cryptoLib;
}

// ─── Base64 helpers ───────────────────────────────────────────────────────────
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes) {
  let str = '';
  const BLOCK = 8192;
  for (let i = 0; i < bytes.length; i += BLOCK) {
    str += String.fromCharCode(...bytes.subarray(i, i + BLOCK));
  }
  return btoa(str);
}

// ─── Crypto modal (Promise-based) ─────────────────────────────────────────────
let _activeCryptoResolver = null;

export function closeCryptoModal() {
  const overlay = document.getElementById('crypto-modal-overlay');
  if (overlay) overlay.style.display = 'none';
  if (_activeCryptoResolver) { _activeCryptoResolver(null); _activeCryptoResolver = null; }
}

export function openCryptoModalAsync(action, title, defaultStrategy = 'double_pass') {
  return new Promise(resolve => {
    const overlay     = document.getElementById('crypto-modal-overlay');
    const titleEl     = document.getElementById('crypto-title');
    const confirmBtn  = document.getElementById('crypto-confirm-btn');
    const cancelBtn   = document.getElementById('crypto-cancel-btn');
    const stratSelect = document.getElementById('crypto-strategy');
    const passInput   = document.getElementById('crypto-pass');
    const keyContainer= document.getElementById('crypto-key-container');
    const passContainer=document.getElementById('crypto-pass-container');
    const keySelect   = document.getElementById('crypto-key-select');
    const keyUpload   = document.getElementById('crypto-key-upload');

    if (!overlay) { resolve(null); return; }

    if (titleEl)    titleEl.innerText       = title;
    if (confirmBtn) confirmBtn.innerText    = action === 'encrypt' ? 'Encrypt' : action === 'decrypt' ? 'Decrypt' : 'Unlock';
    if (passInput)  passInput.value         = '';
    if (stratSelect) stratSelect.value      = defaultStrategy;

    // Populate key file select
    if (keySelect) {
      keySelect.innerHTML = '<option value="">-- No Key Selected --</option><option value="UPLOAD">Upload from Computer…</option>';
      Object.keys(S.fileSystem).filter(p => p.endsWith('.sep')).forEach(p => {
        const opt = document.createElement('option'); opt.value = p; opt.innerText = p; keySelect.appendChild(opt);
      });
    }

    const updateVisibility = () => {
      const v = stratSelect?.value || '';
      if (passContainer) passContainer.style.display = v.includes('pass') ? 'block' : 'none';
      if (keyContainer)  keyContainer.style.display  = v.includes('key')  ? 'block' : 'none';
    };
    if (stratSelect) { stratSelect.onchange = updateVisibility; updateVisibility(); }

    if (keySelect && keyUpload) {
      keySelect.onchange = e => { if (e.target.value === 'UPLOAD') keyUpload.click(); };
      keyUpload.onchange = e => {
        const file = e.target.files[0]; if (!file) { keySelect.value = ''; return; }
        const r = new FileReader();
        r.onload = ev => {
          const path = 'DeepBlue/' + file.name;
          S.fileSystem[path] = { type: 'text', content: ev.target.result, modified: true };
          S._callbacks.renderSidebar?.();
          // Re-populate
          const opt = document.createElement('option'); opt.value = path; opt.innerText = path;
          keySelect.appendChild(opt); keySelect.value = path;
        };
        r.readAsText(file); e.target.value = '';
      };
    }

    overlay.style.display = 'flex';
    _activeCryptoResolver  = resolve;

    const handleConfirm = () => {
      const pass   = passInput?.value || '';
      const strat  = stratSelect?.value || 'double_pass';
      const keyPath= keySelect?.value || '';
      if (strat.includes('pass') && !pass)                           { customAlert('Password is required.'); return; }
      if (strat.includes('key') && (!keyPath || keyPath === 'UPLOAD')){ customAlert('Key file is required.'); return; }
      overlay.style.display   = 'none';
      _activeCryptoResolver   = null;
      confirmBtn.onclick       = null;
      cancelBtn.onclick        = null;
      if (passInput) passInput.onkeydown = null;
      resolve({ password: pass, strategy: strat, keyPath });
    };

    const handleCancel = () => { closeCryptoModal(); confirmBtn.onclick = null; cancelBtn.onclick = null; if (passInput) passInput.onkeydown = null; };

    if (confirmBtn) confirmBtn.onclick = handleConfirm;
    if (cancelBtn)  cancelBtn.onclick  = handleCancel;
    if (passInput)  passInput.onkeydown = e => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') handleCancel(); };
    setTimeout(() => { if (stratSelect?.value.includes('pass')) passInput?.focus(); }, 50);
  });
}

// ─── Get raw bytes for a virtual file ─────────────────────────────────────────
export function getFileBytes(path) {
  const fObj = S.fileSystem[path];
  if (fObj.type === 'asset' && fObj.subtype !== 'svg') {
    return base64ToBytes(fObj.src.split(',')[1]);
  }
  const content = S.editorDocs[path] ? S.editorDocs[path].getValue() : fObj.content;
  return new TextEncoder().encode(content || '');
}

// ─── Zip a folder into bytes ───────────────────────────────────────────────────
export async function folderToZipBytes(folderPath) {
  await syncDocsToContent();
  const zip = new JSZip();
  for (const [path, fObj] of Object.entries(S.fileSystem)) {
    if (!path.startsWith(folderPath + '/')) continue;
    const rel = path.slice(folderPath.length + 1);
    if (fObj.type === 'asset' && fObj.subtype !== 'svg') {
      zip.file(rel, fObj.src.split(',')[1], { base64: true });
    } else {
      zip.file(rel, fObj.content || '');
    }
  }
  return zip.generateAsync({ type: 'uint8array' });
}

// ─── Extract zip bytes into virtual FS ────────────────────────────────────────
export async function extractZipToFolder(zipBytes, folderPath) {
  const zip = await JSZip.loadAsync(zipBytes);
  if (!S.explicitFolders.includes(folderPath)) S.explicitFolders.push(folderPath);
  for (const relativePath of Object.keys(zip.files)) {
    const entry = zip.files[relativePath];
    if (entry.dir) {
      const sub = `${folderPath}/${relativePath}`.replace(/\/$/, '');
      if (!S.explicitFolders.includes(sub)) S.explicitFolders.push(sub);
    } else {
      const data = await entry.async('uint8array');
      const ext  = relativePath.split('.').pop().toLowerCase();
      saveBytesToVirtualFile(`${folderPath}/${relativePath}`, data, ext);
    }
  }
}

// ─── Save raw bytes as a virtual file ─────────────────────────────────────────
export function saveBytesToVirtualFile(fullPath, bytes, ext) {
  ext = ext.toLowerCase();
  const textExts = ['html','css','js','jsx','json','md','txt','py','csv','xml','ts','tsx','yaml','yml','sh','bat'];
  if (textExts.includes(ext)) {
    let type = 'text';
    if (ext === 'html') type = 'html'; else if (ext === 'css') type = 'css'; else if (['js','jsx'].includes(ext)) type = 'js';
    S.fileSystem[fullPath] = { type, content: new TextDecoder().decode(bytes), modified: true };
  } else if (ext === 'svg') {
    S.fileSystem[fullPath] = { type: 'asset', subtype: 'svg', content: new TextDecoder().decode(bytes), modified: true };
  } else {
    const b64  = bytesToBase64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const mimeMap = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', mp4:'video/mp4', webm:'video/webm', pdf:'application/pdf' };
    const mime = mimeMap[ext] || 'application/octet-stream';
    let subtype = 'image';
    if (['mp3','wav','ogg'].includes(ext)) subtype = 'audio';
    else if (['mp4','webm'].includes(ext)) subtype = 'video';
    else if (ext === 'pdf') subtype = 'pdf';
    else if (!['png','jpg','jpeg','gif','webp'].includes(ext)) subtype = 'binary';
    S.fileSystem[fullPath] = { type: 'asset', subtype, src: `data:${mime};base64,${b64}`, content: null, modified: true };
  }
}

// ─── Direct delete helpers (no confirm dialog) ────────────────────────────────
export function deleteFileDirect(name) {
  if (S.fileSystem[name]) { delete S.fileSystem[name]; S.deletedFiles.push(name); }
  if (S.editorDocs[name]) delete S.editorDocs[name];
  const idx = S.openEditorTabs.indexOf(name);
  if (idx > -1) S.openEditorTabs.splice(idx, 1);
  if (S.activeFile === name) S.activeFile = null;
}

export function deleteFolderDirect(folderPath) {
  S.explicitFolders = S.explicitFolders.filter(f => f !== folderPath && !f.startsWith(folderPath + '/'));
  for (const p of Object.keys(S.fileSystem)) {
    if (!p.startsWith(folderPath + '/')) continue;
    delete S.fileSystem[p]; S.deletedFiles.push(p);
  }
  for (const p of Object.keys(S.editorDocs)) { if (p.startsWith(folderPath + '/')) delete S.editorDocs[p]; }
  S.openEditorTabs = S.openEditorTabs.filter(p => !p.startsWith(folderPath + '/'));
}

// ─── Execute encrypt / decrypt on file or folder ──────────────────────────────
export async function executeCrypto(mode, targetPath, targetType, password, strategy, keyPath) {
  S._callbacks.setExecLoading?.(true);
  try {
    const lib = await loadCryptoLib();
    let keyContent = '';
    if (keyPath && S.fileSystem[keyPath]) {
      keyContent = S.editorDocs[keyPath] ? S.editorDocs[keyPath].getValue() : S.fileSystem[keyPath].content;
    }
    const secret = (password || '') + keyContent;

    if (mode === 'encrypt') {
      let bytes, ext;
      if (targetType === 'folder') { bytes = await folderToZipBytes(targetPath); ext = '.zip'; }
      else { bytes = getFileBytes(targetPath); ext = '.' + targetPath.split('.').pop(); }

      let encBytes;
      if (strategy.includes('double'))      encBytes = await lib.encryptFile(bytes, ext, secret);
      else if (strategy.includes('sep'))    encBytes = await lib.encryptSEP(bytes, ext, secret);
      else if (strategy.includes('aes'))    encBytes = await lib.encryptAES(bytes, secret);

      const b64      = bytesToBase64(encBytes);
      let newPath;
      if (targetType === 'folder') {
        newPath = targetPath + '.enc';
      } else {
        const lastDot   = targetPath.lastIndexOf('.');
        const lastSlash = targetPath.lastIndexOf('/');
        newPath = lastDot > lastSlash ? targetPath.slice(0, lastDot) + '.enc' : targetPath + '.enc';
      }

      if (targetType === 'folder') deleteFolderDirect(targetPath); else deleteFileDirect(targetPath);
      S.fileSystem[newPath] = { type: 'enc', content: b64, modified: true, strategy, originalExt: ext };

    } else {
      // decrypt
      const fObj    = S.fileSystem[targetPath];
      const encBytes= base64ToBytes(fObj.content);
      const strat   = fObj.strategy || strategy;
      const origExt = fObj.originalExt || '.txt';

      let decResult;
      if (strat.includes('double'))      decResult = await lib.decryptFile(encBytes, secret);
      else if (strat.includes('sep'))    decResult = await lib.decryptSEP(encBytes, secret);
      else if (strat.includes('aes'))    decResult = { data: await lib.decryptAES(encBytes, secret), ext: origExt };

      const baseName = targetPath.replace(/\.enc$/i, '');
      if (decResult.ext === '.zip') await extractZipToFolder(decResult.data, baseName);
      else saveBytesToVirtualFile(baseName + decResult.ext, decResult.data, decResult.ext.replace('.', ''));

      deleteFileDirect(targetPath);
    }

    S._callbacks.renderSidebar?.();
    renderEditorTabs();
    S.unsavedChanges = true;
  } catch (e) {
    console.error(e);
    await customAlert('Crypto operation failed: ' + e.message, 'Error');
  }
  S._callbacks.setExecLoading?.(false);
}
