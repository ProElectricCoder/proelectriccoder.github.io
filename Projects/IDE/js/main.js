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
window.deepBlue = {
  init: async () => {
    if (!await customConfirm('Reset IDE? All current files will be replaced with defaults.', 'System Reset')) return;
    ['deepBlueFS','deepBlueFolders','deepBlueDeleted','deepBlueRepoFolders'].forEach(k => localStorage.removeItem(k));
    console.log('IDE Initialized. Reloading…');
    location.reload();
  },
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

  // 4. GitHub commit button visibility
  if (S.githubToken) document.getElementById('gh-commit-btn')?.style.setProperty('display','flex');

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
    if (e.data?.type === 'console') logToConsole(e.data.level, e.data.msg);
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
        logToConsole('error', '404 — File not found: ' + pathPart + ' (resolved: ' + resolved + ')');
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
});

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
