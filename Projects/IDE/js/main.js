/**
 * main.js — DeepBlue IDE entry point.
 * Imports all modules, wires S._callbacks, runs the init sequence,
 * and exposes legacy globals for inline onclick handlers.
 */

import { S }                                                        from './state.js';
import { customAlert, customConfirm }                               from './dialogs.js';
import { initCodeMirror, switchFile, syncDocsToContent,
  renderEditorTabs, closeEditorTab, formatCurrentFile,
  clearModifiedFlags }                                       from './editor.js';
import { initAutoSave, saveProject, createNewFile, createNewFolder,
  renameFile, deleteFile, renameFolder, deleteFolder,
  processUpload, processFolderUpload,
  handleDroppedFiles }                                       from './fs.js';
import { runCode, runWeb, setExecLoading, logToConsole,
  logTableToConsole, installSystemConsoleBridge, activateConsoleTab,
  createTab, closePreviewTab, setPresetSize, updateZoom,
  resolveVirtualPath, openPreviewInNewTab }                  from './preview.js';
import { renderSidebar, openAddMenu, closeAddMenu, uploadToCurrentFolder,
  initDragDrop, initConsoleInput, toggleFullscreen,
  initResizers, initAIResizer,
  toggleAI, callGemini, checkApiKey, saveApiKey }            from './ui.js';
import { confirmGithubAuth, openGithubAuth, fetchWithProgress,
  handleGithubImport, openGithubCommitModal,
  closeCommitModal, executeGithubCommit }                    from './github.js';
import { shareProject }                                             from './share.js';
import { loadCryptoLib, openCryptoModalAsync, closeCryptoModal,
  executeCrypto }                                            from './crypto.js';
import { getFileParam, getActionParam,
  getSafePreviewParams, consumeActionParam }                  from './routing.js';
import { toggleSearch, findNext, findPrev,
  replaceOne, replaceAll }                                    from './search.js';
import defaultTour                                                  from './tour.js';
import { toggleGdriveAuth, saveCurrentFileToGoogleDrive,
  openDrivePicker, _updateGdriveBtn }        from './gdrive.js';

// ─── System console bridge ─────────────────────────────────────────────────────
// Installed immediately (module scope) so the System console tab captures
// every console.log/warn/error/table call made by the IDE's own code from
// the very first paint, not just after the 'load' event.
installSystemConsoleBridge();

// ─── Wire cross-module callbacks (breaks circular deps) ───────────────────────
S._callbacks = {
  renderSidebar,
  fetchWithProgress,
  loadCryptoLib,
  openCryptoModalAsync,
  toggleSearch,
  closeAddMenu,
  switchFile,
  logToConsole,
  setExecLoading,
  handleDroppedFiles,
};

// ─── IDE easter eggs ──────────────────────────────────────────────────────────
console.hack = async function() {
  try {
    const d = await (await fetch('https://get.geojs.io/v1/ip/geo.json')).json();
    console.log('IP Address to hack: ' + d.ip);
    console.log("(It's yours tho 😏)");
  } catch {
    console.log("Sorry, you can't hack us,");
    console.warn('(But WE can hack you 😏)');
  }
};
console.destroy = async function(target) {
  console.log('Acquiring target coordinates…');
  try {
    const d = await (await fetch('https://get.geojs.io/v1/ip/geo.json')).json();
    console.warn('Target locked: ' + d.ip);
    console.error(`Airstriking ${d.city||'Your'}, ${d.region||'City'} instead of ${target} 🚀💥`);
  } catch { console.error('Satellite uplink failed. Airstrike aborted.'); }
};

// ─── window.deepBlue — IDE debug / scripting API ──────────────────────────────
// Reachable both from the browser DevTools console and from the System tab
// of DeepBlue's own console panel (its input box runs indirect eval() against
// this same global scope).
window.deepBlue = {
  /** Wipes local autosave state and reloads with the default project. */
  init: async () => {
    if (!await customConfirm('Reset IDE? All current files will be replaced with defaults.', 'System Reset')) return;
    ['deepBlueFS','deepBlueFolders','deepBlueDeleted','deepBlueRepoFolders'].forEach(k => localStorage.removeItem(k));
    console.log('IDE Initialized. Reloading…');
    location.reload();
  },

  // ── Direct virtual-FS operations (no confirm dialogs — for scripting) ──────

  /** deepBlue.del("DeepBlue/old.js") — deletes a file by full virtual path. */
  del(path) {
    if (!S.fileSystem[path]) { console.warn(`deepBlue.del: '${path}' not found.`); return false; }
    delete S.fileSystem[path];
    S.deletedFiles.push(path);
    if (S.editorDocs[path]) delete S.editorDocs[path];
    const idx = S.openEditorTabs.indexOf(path);
    if (idx > -1) S.openEditorTabs.splice(idx, 1);
    if (S.activeFile === path) S.activeFile = null;
    renderSidebar();
    renderEditorTabs();
    S.unsavedChanges = true;
    console.log(`Deleted '${path}'.`);
    return true;
  },

  /** deepBlue.create("DeepBlue/new.js", "// optional initial content") */
  create(path, content = '') {
    if (S.fileSystem[path]) { console.warn(`deepBlue.create: '${path}' already exists.`); return false; }
    const ext = path.split('.').pop().toLowerCase();
    let type = 'text';
    if (ext === 'html') type = 'html';
    else if (ext === 'css') type = 'css';
    else if (['js','jsx'].includes(ext)) type = 'js';
    S.fileSystem[path] = { type, content, modified: true };
    renderSidebar();
    S.unsavedChanges = true;
    console.log(`Created '${path}'.`);
    return true;
  },

  /** deepBlue.rename("DeepBlue/old.js", "DeepBlue/new.js") — full path → full path. */
  rename(from, to) {
    if (!S.fileSystem[from]) { console.warn(`deepBlue.rename: '${from}' not found.`); return false; }
    if (S.fileSystem[to])    { console.warn(`deepBlue.rename: '${to}' already exists.`); return false; }
    S.fileSystem[to] = { ...S.fileSystem[from], modified: true };
    delete S.fileSystem[from];
    S.deletedFiles.push(from);
    if (S.editorDocs[from]) { S.editorDocs[to] = S.editorDocs[from]; delete S.editorDocs[from]; }
    const idx = S.openEditorTabs.indexOf(from);
    if (idx > -1) S.openEditorTabs[idx] = to;
    if (S.activeFile === from) S.activeFile = to;
    renderSidebar();
    renderEditorTabs();
    S.unsavedChanges = true;
    console.log(`Renamed '${from}' → '${to}'.`);
    return true;
  },

  /**
   * deepBlue.move("DeepBlue/script.js", "DeepBlue/utils")
   * If `to` looks like a folder (no file extension on its last segment, or
   * it's a known explicit folder), the file is moved INTO that folder under
   * its original name. Otherwise `to` is treated as an exact destination
   * path, identical to deepBlue.rename().
   */
  move(from, to) {
    if (!S.fileSystem[from]) { console.warn(`deepBlue.move: '${from}' not found.`); return false; }
    const baseName       = from.split('/').pop();
    const lastSeg         = to.split('/').pop();
    const looksLikeFolder = !lastSeg.includes('.') || S.explicitFolders.includes(to);
    const destPath        = looksLikeFolder ? `${to.replace(/\/$/, '')}/${baseName}` : to;
    return window.deepBlue.rename(from, destPath);
  },

  // ── Easter eggs (aliases for console.hack / console.destroy) ───────────────
  hack:    async ()       => { await console.hack(); },
  destroy: async (target) => { await console.destroy(target); },
};

// ─── Main init ────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {

  // 1. CodeMirror
  const editorEl = document.getElementById('code-editor');
  if (editorEl) initCodeMirror(editorEl);

  // 2. Persist state (localStorage auto-save)
  initAutoSave();

  // 3. UI wiring
  initDragDrop();
  initConsoleInput();
  initResizers();
  initAIResizer();
  checkApiKey();

  // 3b. The System console tab is static markup (always present), so it
  // needs its click handler wired manually — dynamic file tabs get theirs
  // from createConsoleTab() in preview.js.
  document.querySelector('#console-tabs .console-tab[data-console-tab="system"]')
    ?.addEventListener('click', () => activateConsoleTab('system'));

  // 4. GitHub commit button visibility
  if (S.githubToken) document.getElementById('gh-commit-btn')?.style.setProperty('display','flex');

  // 4b. Google Drive button state + Picker wiring

  // 5. Context menu
  document.getElementById('ctx-rename')?.addEventListener('click', () => {
    document.getElementById('ctx-menu')?.classList.remove('active');
    if (S.ctxType === 'file') renameFile(S.ctxTarget);
    else renameFolder(S.ctxTarget);
  });
  document.getElementById('ctx-delete')?.addEventListener('click', () => {
    document.getElementById('ctx-menu')?.classList.remove('active');
    if (S.ctxType === 'file') deleteFile(S.ctxTarget);
    else deleteFolder(S.ctxTarget);
  });
  document.getElementById('ctx-encrypt')?.addEventListener('click', async () => {
    document.getElementById('ctx-menu')?.classList.remove('active');
    const res = await openCryptoModalAsync('encrypt', `Encrypt ${S.ctxType}`);
    if (res) executeCrypto('encrypt', S.ctxTarget, S.ctxType, res.password, res.strategy, res.keyPath);
  });
  document.getElementById('ctx-decrypt')?.addEventListener('click', async () => {
    document.getElementById('ctx-menu')?.classList.remove('active');
    const defStrat = S.ctxType === 'file' ? (S.fileSystem[S.ctxTarget]?.strategy || 'double_pass') : 'double_pass';
    const res = await openCryptoModalAsync('decrypt', `Decrypt ${S.ctxType}`, defStrat);
    if (res) executeCrypto('decrypt', S.ctxTarget, S.ctxType, res.password, res.strategy, res.keyPath);
  });

  // 6. Global context-menu trigger
  document.addEventListener('contextmenu', e => {
    const tab    = e.target.closest('.tab');
    const folder = e.target.closest('.folder-header');
    if (!tab && !folder) return;
    e.preventDefault();
    S.ctxTarget = (tab || folder).getAttribute('data-path');
    S.ctxType   = tab ? 'file' : 'folder';
    const menu  = document.getElementById('ctx-menu');
    if (!menu) return;
    menu.classList.add('active');
    menu.style.left = e.pageX + 'px';
    menu.style.top  = e.pageY + 'px';
    const isEnc  = S.ctxTarget?.endsWith('.enc');
    const isRoot = S.ctxTarget === 'DeepBlue' || S.importedRepoFolders.includes(S.ctxTarget);
    document.getElementById('ctx-encrypt')?.style.setProperty('display', isEnc   ? 'none' : 'flex');
    document.getElementById('ctx-decrypt')?.style.setProperty('display', isEnc   ? 'flex' : 'none');
    document.getElementById('ctx-rename') ?.style.setProperty('display', isRoot  ? 'none' : 'flex');
    document.getElementById('ctx-delete') ?.style.setProperty('display', isRoot  ? 'none' : 'flex');
    document.querySelector('.ctx-sep')    ?.style.setProperty('display', isRoot  ? 'none' : 'block');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#ctx-menu')) document.getElementById('ctx-menu')?.classList.remove('active');
  });

  // 7. Window events
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('output-container')?.classList.contains('expanded')) toggleFullscreen();
    if (document.getElementById('modal-overlay')?.style.display === 'flex')          closeAddMenu();
    if (document.getElementById('commit-modal-overlay')?.style.display === 'flex')   closeCommitModal();
    if (document.getElementById('crypto-modal-overlay')?.style.display === 'flex')   closeCryptoModal();
  });
  window.addEventListener('beforeunload', e => { if (S.unsavedChanges) { e.preventDefault(); e.returnValue = ''; } });

  // 8. iframe → IDE message bridge
  window.addEventListener('message', e => {
    if (e.data?.type === 'console')        logToConsole(e.data.level, e.data.msg, e.data.tabId);
    if (e.data?.type === 'console-table')  logTableToConsole(e.data.data, e.data.columns, e.data.tabId);
    if (e.data?.type === 'navigate') {
      const [pathPart, queryPart] = e.data.path.split('?');
      const queryParams = queryPart ? '?' + queryPart : '';
      const resolved    = resolveVirtualPath(S.activeFile, pathPart);
      if (S.fileSystem[resolved]) {
        const url = new URL(window.location);
        url.search = queryParams;
        window.history.replaceState(null, '', url);
        switchFile(resolved).then(() => runWeb(resolved, queryParams));
      } else {
        logToConsole('error', '404 — File not found: ' + pathPart + ' (resolved: ' + resolved + ')', 'system');
      }
    }
  });

  // 9. First render
  renderSidebar();

  // 10. URL routing — handle ?file= and ?action= (Task 4 fix)
  const fileParam   = getFileParam();
  const actionParam = getActionParam();

  if (actionParam === 'github') { consumeActionParam(); confirmGithubAuth(); }
  if (actionParam === 'new')    { consumeActionParam(); window.deepBlue.init(); }

  const initialFile = (fileParam && S.fileSystem[fileParam]) ? fileParam : 'DeepBlue/index.html';
  await switchFile(initialFile);
  await runWeb(null, getSafePreviewParams());

  // 11. Tour
  defaultTour.init();

  // 12. Expose globals
  _exposeGlobals();

  // 13. File Handling API setup
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
      const { processFileHandleLoad } = await import('./fs.js');
      if (launchParams.files && launchParams.files.length) {
        await processFileHandleLoad(launchParams.files);
      }
    });
  }
});

// ─── Google Drive: save the active file ───────────────────────────────────────
async function saveActiveFileToDrive() {
  if (!S.activeFile) { await customAlert('No active file to save.', 'Google Drive'); return; }
  await syncDocsToContent();
  const fileName = S.activeFile.split('/').pop();
  const content  = S.editorDocs[S.activeFile] ? S.editorDocs[S.activeFile].getValue() : (S.fileSystem[S.activeFile]?.content ?? '');
  try {
    const result = await saveCurrentFileToGoogleDrive(fileName, content);
    logToConsole('log', `Saved '${fileName}' to Google Drive (id: ${result.id}).`, 'system');
    await customAlert(`Saved to Google Drive!\nFile ID: ${result.id}`, 'Success');
  } catch (e) {
    logToConsole('error', `Google Drive save failed: ${e.message}`, 'system');
    await customAlert('Drive save failed: ' + e.message, 'Error');
  }
}

// ─── Global exposure for HTML onclick handlers ────────────────────────────────
function _exposeGlobals() {
  // IDE namespace (used by dynamically-generated sidebar HTML)
  window.IDE = {
    openAddMenu,
    closeEditorTab,
    closePreviewTab,
    renameFile,
    deleteFile,
    renameFolder,
    deleteFolder,
    openPreviewInNewTab,
  };

  // Legacy flat globals (used by static onclick="" attributes in the HTML)
  Object.assign(window, {
    // File modal
    handleCreateNew:      () => { closeAddMenu(); setTimeout(createNewFile,   250); },
    handleCreateFolder:   () => { closeAddMenu(); setTimeout(createNewFolder, 250); },
    handleUpload:         () => { closeAddMenu(); document.getElementById('file-upload')?.click(); },
    handleFolderUpload:   () => { closeAddMenu(); document.getElementById('folder-upload')?.click(); },
    handleGithubImport,
    closeAddMenu,
    uploadToCurrentFolder,

    // Header controls
    formatCurrentFile,
    saveProject,
    runCode,
    shareProject,
    openPreviewInNewTab,

    // GitHub
    confirmGithubAuth,
    openGithubCommitModal,
    closeCommitModal,
    executeGithubCommit,

    // Google Drive
    toggleGdriveAuth,
    openDrivePicker,
    saveActiveFileToDrive,

    // AI
    toggleAI,
    callGemini,
    saveApiKey,

    // Search
    toggleSearch,
    findNext,
    findPrev,
    replaceOne,
    replaceAll,

    // Preview controls
    setPresetSize,
    updateZoom,
    toggleFullscreen,

    // File inputs
    processUpload,
    processFolderUpload,

    // Crypto
    closeCryptoModal,
  });
}
