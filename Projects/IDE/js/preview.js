/**
 * preview.js — Preview execution system: runWeb, runPython, tab manager,
 *              blob-URL dependency resolver, and open-in-new-tab (Task 3).
 *
 * Console panel lives UNDER the preview panel only (#web-console) and is
 * split into tabs: a permanent "System" tab (IDE-internal console mirror)
 * plus one dynamic tab per open preview tab, synced to the preview tab
 * lifecycle (created/activated/closed alongside the matching preview tab).
 */

import { S } from './state.js';
import { syncDocsToContent } from './editor.js';
import { customAlert } from './dialogs.js';
import { getSafePreviewParams } from './routing.js';

// ─── Lazy Babel ───────────────────────────────────────────────────────────────
let _babelLoading = false;
export async function loadBabel() {
  if (window.Babel) return;
  if (_babelLoading) { while (!window.Babel) await _sleep(100); return; }
  _babelLoading = true;
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@babel/standalone/babel.min.js';
    s.onload  = () => res();
    s.onerror = () => rej(new Error('Failed to load Babel'));
    document.head.appendChild(s);
  });
}

// ─── Path resolution ──────────────────────────────────────────────────────────
export function resolveVirtualPath(baseFile, relativePath) {
  if (!relativePath) return baseFile;
  let parts = baseFile ? baseFile.split('/') : [];
  const projectRoot = parts.length ? parts[0] : '';
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
    parts = projectRoot ? [projectRoot] : [];
  } else {
    if (parts.length) parts.pop();
  }
  for (const part of relativePath.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') { if (parts.length) parts.pop(); }
    else parts.push(part);
  }
  const resolved = parts.join('/');
  if (S.fileSystem[resolved] && S.fileSystem[resolved].type !== 'folder') return resolved;
  const fallback = resolved ? resolved + '/index.html' : 'index.html';
  if (S.fileSystem[fallback]) return fallback;
  return resolved;
}

// ─── Tab management (preview) ─────────────────────────────────────────────────
export function setTabsEmptyState(isEmpty) {
  const controls = document.getElementById('device-controls');
  const tabsCtr  = document.getElementById('preview-tabs');
  if (isEmpty) {
    controls?.classList.add('disabled');
    controls?.setAttribute('title', 'Run a file to enable controls');
    if (tabsCtr) tabsCtr.innerHTML = '<div class="empty-tabs-msg">Execute a file to preview</div>';
  } else {
    controls?.classList.remove('disabled');
    controls?.removeAttribute('title');
    tabsCtr?.querySelector('.empty-tabs-msg')?.remove();
  }
}

export function createTab(id, type) {
  setTabsEmptyState(false);
  if (S.openTabs.includes(id)) { activateTab(id); return; }
  S.openTabs.push(id);

  const tabCtr = document.getElementById('preview-tabs');
  const tabEl  = document.createElement('div');
  tabEl.className = 'preview-tab';
  tabEl.id = `tab-header-${id}`;
  tabEl.onclick = e => { if (!e.target.closest('.tab-close')) activateTab(id); };
  tabEl.innerHTML = `<div class="preview-tab-title" title="${id}">&lrm;${id}</div><div class="tab-close" onclick="IDE.closePreviewTab('${id}')">✕</div>`;
  tabCtr?.appendChild(tabEl);

  const contentArea = document.getElementById('content-area');
  const contentEl   = document.createElement('div');
  contentEl.className = 'tab-content';
  contentEl.id = `tab-content-${id}`;
  if (type === 'web') {
    contentEl.className += ' web-mode-container';
    contentEl.innerHTML = `<div class="iframe-wrapper"><iframe id="iframe-${id}" class="responsive"></iframe></div>`;
  }
  contentArea?.appendChild(contentEl);

  // ── Console tab lifecycle: mirror the preview tab 1:1 ──────────────────────
  createConsoleTab(id);
  activateTab(id);

  if (type === 'web') {
    const zs = document.getElementById('zoom-slider');
    const zv = document.getElementById('zoom-val');
    if (zs) zs.value = '1';
    if (zv) zv.innerText = '100%';
    updateZoom(1);
  }
}

export function activateTab(id) {
  S.activeTabId = id;
  document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-header-${id}`)?.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-content-${id}`)?.classList.add('active');
  activateConsoleTab(id);
}

export function closePreviewTab(id) {
  const idx = S.openTabs.indexOf(id);
  if (idx > -1) S.openTabs.splice(idx, 1);
  document.getElementById(`tab-header-${id}`)?.remove();
  document.getElementById(`tab-content-${id}`)?.remove();
  closeConsoleTab(id);
  if (S.activeTabId === id) {
    if (S.openTabs.length) { const nid = S.openTabs[idx - 1] || S.openTabs[0]; activateTab(nid); }
    else {
      S.activeTabId = null;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      setTabsEmptyState(true);
      activateConsoleTab('system');
    }
  }
}

// ─── Console panel (tabs: System + one per open preview tab) ─────────────────
function _findConsoleTab(id) {
  return document.querySelector(`#console-tabs .console-tab[data-console-tab="${id}"]`);
}
function _findConsolePanel(id) {
  return document.querySelector(`#console-panels .console-panel[data-console-tab="${id}"]`);
}

export function createConsoleTab(id) {
  const tabsCtr   = document.getElementById('console-tabs');
  const panelsCtr = document.getElementById('console-panels');
  if (!tabsCtr || !panelsCtr || _findConsoleTab(id)) return;

  const label = id.split('/').pop();
  const tabEl = document.createElement('div');
  tabEl.className = 'console-tab';
  tabEl.dataset.consoleTab = id;
  tabEl.innerHTML = `<span class="console-tab-title" title="${id}">&lrm;${label}</span><span class="console-tab-close" title="Close">✕</span>`;
  tabEl.querySelector('.console-tab-close').onclick = e => { e.stopPropagation(); closePreviewTab(id); };
  tabEl.onclick = () => activateTab(id);
  tabsCtr.appendChild(tabEl);

  const panelEl = document.createElement('div');
  panelEl.className = 'console-panel';
  panelEl.dataset.consoleTab = id;
  panelEl.innerHTML = '<div class="console-log-container"></div>';
  panelsCtr.appendChild(panelEl);
}

export function activateConsoleTab(id) {
  S.activeConsoleTab = id;
  document.querySelectorAll('#console-tabs .console-tab')
    .forEach(t => t.classList.toggle('active', t.dataset.consoleTab === id));
  document.querySelectorAll('#console-panels .console-panel')
    .forEach(p => p.classList.toggle('active', p.dataset.consoleTab === id));
}

export function closeConsoleTab(id) {
  if (id === 'system') return; // permanent tab, never closed
  _findConsoleTab(id)?.remove();
  _findConsolePanel(id)?.remove();
  if (S.activeConsoleTab === id) activateConsoleTab('system');
}

// ─── Console logging ──────────────────────────────────────────────────────────
export function logToConsole(level, msg, tabId = 'system') {
  const panel = _findConsolePanel(tabId) || _findConsolePanel('system');
  const container = panel?.querySelector('.console-log-container');
  if (!container) return;
  const e = document.createElement('div');
  e.className = `console-entry ${level}`;
  e.innerText = msg;
  container.appendChild(e);
  container.scrollTop = container.scrollHeight;
}

/** Renders a console.table()-style grid into the given console tab. */
export function logTableToConsole(data, columns, tabId = 'system') {
  const panel = _findConsolePanel(tabId) || _findConsolePanel('system');
  const container = panel?.querySelector('.console-log-container');
  if (!container) return;
  const entry = document.createElement('div');
  entry.className = 'console-entry table';
  entry.appendChild(_buildTableElement(data, columns));
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function _buildTableElement(data, columns) {
  const wrapper = document.createElement('div');
  wrapper.className = 'console-table-wrapper';

  if (data === null || typeof data !== 'object') {
    wrapper.innerText = String(data);
    return wrapper;
  }

  const rows = Array.isArray(data)
    ? data.map((v, i) => ({ idx: String(i), value: v }))
    : Object.entries(data).map(([k, v]) => ({ idx: k, value: v }));

  let cols = columns;
  if (!cols) {
    const colSet = new Set();
    rows.forEach(r => {
      if (r.value && typeof r.value === 'object' && !Array.isArray(r.value)) {
        Object.keys(r.value).forEach(k => colSet.add(k));
      } else {
        colSet.add('Values');
      }
    });
    cols = Array.from(colSet);
  }

  const table = document.createElement('table');
  table.className = 'console-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(_th('(index)'));
  cols.forEach(c => headRow.appendChild(_th(c)));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.appendChild(_td(r.idx));
    cols.forEach(c => {
      let cell = '';
      if (r.value && typeof r.value === 'object' && !Array.isArray(r.value)) {
        if (c in r.value) cell = _cellFmt(r.value[c]);
      } else if (c === 'Values') {
        cell = _cellFmt(r.value);
      }
      tr.appendChild(_td(cell));
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}
function _th(text) { const th = document.createElement('th'); th.innerText = text; return th; }
function _td(text) { const td = document.createElement('td'); td.innerText = text; return td; }
function _cellFmt(v) {
  if (v === null) return 'null';
  if (v === undefined) return '';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}

/**
 * Mirrors the top-level (IDE's own) console.* calls into the System console
 * tab, so the System tab "works on the IDE itself" — any internal log,
 * warning, error, or console.table() call made by DeepBlue's own code (or
 * typed into the System console input) shows up here, in addition to
 * whatever the real browser DevTools console shows.
 */
export function installSystemConsoleBridge() {
  const fmt = x => {
    if (typeof x === 'object' && x !== null) { try { return JSON.stringify(x, null, 2); } catch { return String(x); } }
    return String(x);
  };

  ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
    const orig = console[level];
    console[level] = function (...args) {
      orig.apply(console, args);
      try { logToConsole(level, args.map(fmt).join(' '), 'system'); } catch {}
    };
  });

  const origTable = console.table;
  console.table = function (data, columns) {
    if (origTable) { try { origTable.call(console, data, columns); } catch {} }
    try { logTableToConsole(data, columns, 'system'); } catch {}
  };

  window.addEventListener('error', e => {
    logToConsole('error', `IDE Error: ${e.message} (${e.filename}:${e.lineno})`, 'system');
  });
  window.addEventListener('unhandledrejection', e => {
    logToConsole('error', `IDE Unhandled Promise: ${e.reason}`, 'system');
  });
}

// ─── Execution loading indicator ──────────────────────────────────────────────
export function setExecLoading(state) {
  const bar = document.getElementById('execution-loading-bar');
  if (bar) bar.style.display = state ? 'block' : 'none';
}

// ─── Zoom / device ────────────────────────────────────────────────────────────
export function updateZoom(value) {
  const iframe = document.getElementById(`iframe-${S.activeTabId}`);
  if (!iframe) return;
  if (S.viewMode === 'responsive') {
    const pct = 100 / value;
    iframe.style.width  = `${pct}%`;
    iframe.style.height = `${pct}%`;
    iframe.style.transform = `scale(${value})`;
  } else {
    iframe.style.transform = `scale(${value})`;
  }
  const zv = document.getElementById('zoom-val');
  if (zv) zv.innerText = Math.round(value * 100) + '%';
}

export function setPresetSize(mode) {
  if (!S.activeTabId) return;
  const iframe = document.getElementById(`iframe-${S.activeTabId}`);
  if (!iframe) return;
  iframe.style.width = iframe.style.height = iframe.style.borderLeft = iframe.style.borderRight = '';
  iframe.classList.remove('responsive', 'fixed');
  if (mode === 'desktop') { S.viewMode = 'responsive'; iframe.classList.add('responsive'); }
  else {
    S.viewMode = mode;
    iframe.classList.add('fixed');
    if (mode === 'tablet') { iframe.style.width = '768px';  iframe.style.height = '1024px'; }
    else if (mode === 'mobile') { iframe.style.width = '375px'; iframe.style.height = '667px'; }
    iframe.style.borderLeft = iframe.style.borderRight = '1px solid #333';
  }
  const zs = document.getElementById('zoom-slider');
  if (zs) updateZoom(parseFloat(zs.value));
  document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
  if (event?.currentTarget) event.currentTarget.classList.add('active');
}

// ─── Main run dispatch ────────────────────────────────────────────────────────
export async function runCode() {
  if (!S.activeFile) { await runWeb(null, getSafePreviewParams()); return; }
  await syncDocsToContent();

  // Animate button
  const btn = document.querySelector('.btn[onclick*="runCode"]');
  if (btn) { btn.style.transform = 'scale(0.95)'; setTimeout(() => (btn.style.transform = ''), 150); }

  const queryParams = getSafePreviewParams();
  const fObj        = S.fileSystem[S.activeFile];
  const isEnc       = S.activeFile.endsWith('.enc');
  const trueExt     = isEnc
    ? (fObj?.originalExt || '.txt').toLowerCase()
    : '.' + S.activeFile.split('.').pop().toLowerCase();

  if (fObj?.type === 'asset' || (isEnc && !['.html','.css','.js','.jsx','.json','.md','.txt','.py'].includes(trueExt))) {
    await renderAssetPreview(S.activeFile);
  } else if (trueExt === '.py') {
    await runPython(S.activeFile);
  } else {
    await runWeb(null, queryParams);
  }
}

// ─── Web runner ───────────────────────────────────────────────────────────────
export async function runWeb(overrideFile = null, queryParams = '') {
  setExecLoading(true);
  await syncDocsToContent();

  try {
    let targetFile = overrideFile || S.activeFile;
    if (!targetFile) { _clearPreview(); return; }

    const ext = targetFile.split('.').pop().toLowerCase();

    // Plain text / markdown / JSON — use native viewer
    if (['txt','md','json'].includes(ext)) {
      createTab(targetFile, 'web');
      let content = S.fileSystem[targetFile].content;
      if (content === null && S.fileSystem[targetFile].ghUrl) {
        content = await S._callbacks.fetchWithProgress?.(S.fileSystem[targetFile].ghUrl) ?? '';
        S.fileSystem[targetFile].content = content;
      }
      let finalContent = content;
      let mime = 'text/plain';
      if (ext === 'md') {
        mime = 'text/html';
        const body = marked.parse(content);
        finalContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;line-height:1.6;padding:2rem;max-width:800px;margin:0 auto;color:#e2f1f8;background:#000;}pre{background:#1a2332;padding:1rem;border-radius:6px;overflow-x:auto;}code{font-family:monospace;background:#1a2332;padding:2px 4px;border-radius:4px;color:#00e5ff;}a{color:#00e5ff;}</style></head><body>${body}</body></html>`;
      }
      const iframe = document.getElementById(`iframe-${targetFile}`);
      if (iframe) iframe.src = URL.createObjectURL(new Blob([finalContent], { type: mime })) + queryParams;
      return;
    }

    // JSX virtual shell
    let isVirtualJSX = false, htmlContent = '';
    const needsBabel = Object.keys(S.fileSystem).some(f => f.endsWith('.jsx')) || targetFile.endsWith('.jsx');
    if (needsBabel) await loadBabel();

    if (ext === 'jsx') {
      isVirtualJSX = true;
      htmlContent  = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#0a0e14;color:#fff;font-family:system-ui;}</style><script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script><script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script></head><body><div id="react-root"></div><script type="module" src="${targetFile}"><\/script></body></html>`;
    } else if (!S.fileSystem[targetFile] || S.fileSystem[targetFile].type !== 'html') {
      if (S.fileSystem['index.html']) targetFile = 'index.html';
      else { _clearPreview(); return; }
    }

    const tabId = isVirtualJSX ? S.activeFile : targetFile;
    createTab(tabId, 'web');

    // Clear & mark this tab's console panel for the new run
    const runPanel = _findConsolePanel(tabId);
    const runLogEl = runPanel?.querySelector('.console-log-container');
    if (runLogEl) runLogEl.innerHTML = '';
    logToConsole('marker', '--- Run Started ---', tabId);

    if (!isVirtualJSX) {
      htmlContent = S.fileSystem[targetFile].content;
      if (htmlContent === null && S.fileSystem[targetFile].ghUrl) {
        try { htmlContent = await S._callbacks.fetchWithProgress?.(S.fileSystem[targetFile].ghUrl) ?? ''; S.fileSystem[targetFile].content = htmlContent; }
        catch { htmlContent = '<h1>Error loading entry file</h1>'; }
      }
    }

    // Build blob map
    const blobMap = {}, visiting = new Set();
    const getUrl = (filePath) => {
      if (blobMap[filePath]) return blobMap[filePath];
      if (visiting.has(filePath)) return filePath;
      const fObj = S.fileSystem[filePath];
      if (!fObj) return null;
      if (fObj.content === null && fObj.type !== 'asset') return null;
      visiting.add(filePath);
      let url = null;
      if (fObj.type === 'asset') {
        if (fObj.subtype === 'svg' && fObj.content === null) {}
        else if (fObj.subtype === 'svg') url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fObj.content);
        else url = fObj.src;
      } else {
        let fc = S.editorDocs[filePath] ? S.editorDocs[filePath].getValue() : fObj.content;
        const tExt = filePath.endsWith('.enc') ? (fObj.originalExt || '.txt').toLowerCase() : '.' + filePath.split('.').pop().toLowerCase();
        let mime = 'text/plain';
        if (['.js','.jsx'].includes(tExt)) mime = 'application/javascript';
        else if (tExt === '.css') mime = 'text/css';
        else if (tExt === '.json') mime = 'application/json';
        else if (tExt === '.html') mime = 'text/html';
        if (['.jsx','.js'].includes(tExt) && window.Babel && fc) {
          if (tExt === '.jsx') { try { fc = window.Babel.transform(fc, { presets: ['react'] }).code; } catch {} }
        }
        if ((['.js','.jsx'].includes(tExt)) && fc) {
          fc = fc.replace(/(import\s+.*?from\s+|import\s+|export\s+.*?from\s+|import\s*\(\s*)(["'])(.*?)\2/g, (m, prefix, q, path) => {
            if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return m;
            let res = resolveVirtualPath(filePath, path);
            if (!S.fileSystem[res]) { if (S.fileSystem[res+'.js']) res += '.js'; else if (S.fileSystem[res+'.jsx']) res += '.jsx'; }
            const du = getUrl(res);
            return du ? `${prefix}${q}${du}${q}` : m;
          });
        }
        if (tExt === '.css' && fc) {
          fc = fc.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q, path) => {
            if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return m;
            const res = resolveVirtualPath(filePath, path);
            if (S.fileSystem[res]) { const du = getUrl(res); if (du) return `url(${q||'"'}${du}${q||'"'})`; }
            return m;
          });
        }
        if (fc) url = URL.createObjectURL(new Blob([fc], { type: mime }));
      }
      visiting.delete(filePath);
      if (url) blobMap[filePath] = url;
      return url;
    };

    for (const fname of Object.keys(S.fileSystem)) { if (!isVirtualJSX && fname === targetFile) continue; getUrl(fname); }

    // Interceptor scripts — tag every console/table message with this preview
    // tab's id so logs route to the matching console tab, not just "system".
    const tabIdJSON = JSON.stringify(tabId);
    const consoleScript = `<script>(function(){function fmt(x){if(typeof x==='object'&&x!==null){try{return JSON.stringify(x,null,2);}catch(e){return String(x);}}return String(x);}function s(t,a){var m=a.map(fmt).join(' ');window.parent.postMessage({type:'console',level:t,msg:m,tabId:${tabIdJSON}},'*');}['log','warn','error','info','debug'].forEach(m=>{var o=console[m];console[m]=(...a)=>{if(o)o.apply(console,a);s(m,a);};});var ot=console.table;console.table=function(data,cols){if(ot){try{ot.call(console,data,cols);}catch(e){}}window.parent.postMessage({type:'console-table',data:data,columns:cols||null,tabId:${tabIdJSON}},'*');};window.onerror=function(m,u,l){s('error',['Runtime Error: '+m+' (Line '+l+')']);};window.addEventListener('unhandledrejection',function(e){s('error',['Unhandled Promise: '+(e.reason?e.reason.toString():'Unknown')]);});})();<\/script>`;
    const navScript     = `<script>(function(){document.addEventListener('click',function(e){const a=e.target.closest('a');if(a){const h=a.getAttribute('href');if(h&&!h.startsWith('http')&&!h.startsWith('data:')&&!h.startsWith('blob:')&&!h.startsWith('#')){e.preventDefault();window.parent.postMessage({type:'navigate',path:h},'*');}}});document.addEventListener('submit',function(e){const f=e.target;const ac=f.getAttribute('action')||'';if(!ac.startsWith('http')&&!ac.startsWith('data:')&&!ac.startsWith('blob:')){e.preventDefault();const fd=new FormData(f);const p=new URLSearchParams(fd).toString();window.parent.postMessage({type:'navigate',path:ac+(p?'?'+p:'')},'*');}});})();<\/script>`;
    const qpPolyfill    = queryParams ? `<script>(function(){var _s="${queryParams}";if(_s){var _O=window.URLSearchParams;window.URLSearchParams=class extends _O{constructor(i){super(i===undefined||i===null||i===window.location.search?_s:i);}};}})(window._mock_search="${queryParams}");<\/script>` : '';

    const injected = consoleScript + navScript + qpPolyfill;
    let processed  = htmlContent
      .replace(/(href|src)\s*=\s*["']([^"']+)["']/g, (m, attr, path) => {
        if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('#')) return m;
        const res = resolveVirtualPath(targetFile, path);
        const fo  = S.fileSystem[res];
        if (fo && (fo.type === 'html' || fo.type === 'text' || fo.type === 'python')) return m;
        if (blobMap[res]) return `${attr}="${blobMap[res]}"`;
        if (fo?.ghUrl) return `${attr}="${fo.ghUrl}"`;
        return m;
      })
      .replace(/(<script[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, body, close) => {
        if (open.includes('src=')) return m;
        const nb = body.replace(/(import\s+.*?from\s+|import\s+|export\s+.*?from\s+|import\s*\(\s*)(["'])(.*?)\2/g, (im, prefix, q, path) => {
          if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return im;
          let res = resolveVirtualPath(targetFile, path);
          if (!S.fileSystem[res]) { if (S.fileSystem[res+'.js']) res += '.js'; else if (S.fileSystem[res+'.jsx']) res += '.jsx'; }
          const du = getUrl(res);
          return du ? `${prefix}${q}${du}${q}` : im;
        });
        return `${open}${nb}${close}`;
      })
      .replace(/type\s*=\s*["']text\/babel["']/g, 'type="application/javascript"');

    if (processed.includes('<head>')) processed = processed.replace('<head>', '<head>' + injected);
    else processed = injected + processed;

    const oldIframe = document.getElementById(`iframe-${tabId}`);
    if (oldIframe) {
      const ni = document.createElement('iframe');
      ni.id = oldIframe.id; ni.className = oldIframe.className; ni.style.cssText = oldIframe.style.cssText;
      oldIframe.parentNode.replaceChild(ni, oldIframe);
      const blob = new Blob([processed], { type: 'text/html' });
      ni.src = URL.createObjectURL(blob) + queryParams;
    }
  } finally { setExecLoading(false); }
}

// ─── Open in new tab (Task 3) ─────────────────────────────────────────────────
export async function openPreviewInNewTab() {
  if (!S.activeFile) { await customAlert('No active file to preview.'); return; }
  // Reuse the currently rendered blob URL if available
  const iframe = document.getElementById(`iframe-${S.activeTabId}`);
  if (iframe?.src?.startsWith('blob:')) {
    window.open(iframe.src, '_blank');
    return;
  }
  // Otherwise build fresh
  await syncDocsToContent();
  const qp = getSafePreviewParams();
  // Temporarily capture: create a temp tab, get the blob URL, open, remove tab
  await runWeb(null, qp);
  const newIframe = document.getElementById(`iframe-${S.activeTabId}`);
  if (newIframe?.src) window.open(newIframe.src, '_blank');
}

// ─── Python runner ────────────────────────────────────────────────────────────
const PY_SERVER_CODE = `import http.server,json,sys,io,threading\nclass ES:\n def __init__(self):self.out,self.err,self.status,self.inp,self.ev,self.lock=io.StringIO(),io.StringIO(),'idle',None,threading.Event(),threading.Lock()\nstate=ES()\ndef ci(p=''):\n print(p,end='',flush=True)\n with state.lock:state.status,_='waiting_input',state.ev.clear()\n state.ev.wait()\n with state.lock:state.status='running';return state.inp\ndef rc(code):\n global state;env={'input':ci}\n class SC(io.StringIO):\n  def __init__(self,b):super().__init__();self.b=b\n  def write(self,s):\n   with state.lock:self.b.write(s)\n  def flush(self):pass\n old_o,old_e=sys.stdout,sys.stderr;sys.stdout,sys.stderr=SC(state.out),SC(state.err)\n with state.lock:state.status='running'\n try:exec(code,env)\n except Exception as e:print(e,file=sys.stderr)\n finally:\n  sys.stdout,sys.stderr=old_o,old_e\n  with state.lock:state.status='finished'\nclass H(http.server.SimpleHTTPRequestHandler):\n def log_message(self,f,*a):pass\n def do_OPTIONS(self):self.send_response(200);[self.send_header(k,v) for k,v in [('Access-Control-Allow-Origin','*'),('Access-Control-Allow-Methods','POST,GET,OPTIONS'),('Access-Control-Allow-Headers','Content-Type')]];self.end_headers()\n def sj(self,d):self.send_response(200);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(d).encode())\n def do_POST(self):\n  n=int(self.headers.get('Content-Length',0));d=json.loads(self.rfile.read(n)) if n else {}\n  if self.path=='/execute':\n   with state.lock:state.out,state.err=io.StringIO(),io.StringIO()\n   threading.Thread(target=rc,args=(d.get('code',''),),daemon=True).start()\n  elif self.path=='/input':\n   with state.lock:state.inp=d.get('input','');state.ev.set()\n  self.sj({'success':True})\n def do_GET(self):\n  if self.path=='/poll':\n   with state.lock:\n    o,e=state.out.getvalue(),state.err.getvalue();state.out.seek(0);state.out.truncate(0);state.err.seek(0);state.err.truncate(0)\n    self.sj({'status':state.status,'stdout':o,'stderr':e})\nprint('DeepBlue Python Server');http.server.HTTPServer(('127.0.0.1',8765),H).serve_forever()`;

export async function runPython(targetFile) {
  let code = S.fileSystem[targetFile].content;
  if (code === null && S.fileSystem[targetFile].ghUrl) {
    code = await S._callbacks.fetchWithProgress?.(S.fileSystem[targetFile].ghUrl) ?? '';
    S.fileSystem[targetFile].content = code;
  }
  const tryRun = async () => {
    try { const r = await fetch('http://127.0.0.1:8765/execute', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ code }) }); return r.ok; }
    catch { return false; }
  };

  setExecLoading(true);
  let running = await tryRun();
  setExecLoading(false);

  const hasSetup = localStorage.getItem('deepBlue_python_setup');
  if (!running || !hasSetup) {
    const { showCustomDialog } = await import('./dialogs.js');
    const act = await showCustomDialog('confirm', 'Python Execution Required',
      'Run DeepBluePython.py first, then click Run File.',
      { okText: 'Run File', cancelText: 'Cancel', extraText: 'Download Runner' }
    );
    if (act === 'extra') {
      const blob = new Blob([PY_SERVER_CODE], { type: 'text/plain' });
      saveAs(blob, 'DeepBluePython.py');
      localStorage.setItem('deepBlue_python_setup', 'true');
      return;
    } else if (act) {
      setExecLoading(true); running = await tryRun(); setExecLoading(false);
      if (!running) { await customAlert('Run DeepBluePython.py first.', 'Execution Failed'); return; }
      localStorage.setItem('deepBlue_python_setup', 'true');
    } else { return; }
  }

  createTab(targetFile, 'web');
  const termHTML = `<!DOCTYPE html><html><head><style>body{background:#000;color:#e2e8f0;font-family:monospace;padding:1rem;margin:0;height:100vh;box-sizing:border-box;overflow-y:auto;font-size:14px;}.err{color:#f87171;}#tc{white-space:pre-wrap;word-break:break-all;}#ai{color:#fff;white-space:pre-wrap;}#cur{display:none;width:6px;height:12px;background:#e2e8f0;vertical-align:bottom;animation:blink 1s step-end infinite;margin-left:1px;}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}#hi{position:absolute;opacity:0;width:1px;height:1px;}</style></head><body><span id="tc"></span><span id="ai"></span><span id="cur"></span><input id="hi" autocomplete="off" spellcheck="false"></body></html>`;
  const blob   = new Blob([termHTML], { type: 'text/html' });
  const iframe = document.getElementById(`iframe-${targetFile}`);
  if (iframe) iframe.src = URL.createObjectURL(blob);

  await _sleep(100);
  const poll = async () => {
    try {
      const r = await fetch('http://127.0.0.1:8765/poll');
      if (!r.ok) throw new Error();
      const data  = await r.json();
      const doc   = iframe.contentDocument;
      if (!doc) return;
      const tc = doc.getElementById('tc'), ai = doc.getElementById('ai');
      const cur = doc.getElementById('cur'), hi = doc.getElementById('hi');
      if (!doc.body.hasAttribute('data-bound')) {
        doc.body.setAttribute('data-bound','1');
        doc.addEventListener('click', () => { if (cur.style.display === 'inline-block') hi.focus(); });
        hi.addEventListener('input', () => { ai.textContent = hi.value; doc.body.scrollTop = doc.body.scrollHeight; });
      }
      if (data.stdout && tc) { tc.appendChild(doc.createTextNode(data.stdout)); doc.body.scrollTop = doc.body.scrollHeight; }
      if (data.stderr && tc) { const s = doc.createElement('span'); s.className='err'; s.textContent=data.stderr; tc.appendChild(s); doc.body.scrollTop = doc.body.scrollHeight; }
      if (data.status === 'waiting_input') {
        cur.style.display = 'inline-block'; hi.focus();
        hi.onkeydown = async e => {
          if (e.key !== 'Enter') return;
          const val = hi.value; hi.value = ''; ai.textContent = ''; cur.style.display = 'none';
          tc.appendChild(doc.createTextNode(val + '\n')); doc.body.scrollTop = doc.body.scrollHeight;
          hi.onkeydown = null;
          await fetch('http://127.0.0.1:8765/input', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ input: val }) });
          poll();
        };
      } else if (data.status === 'finished') {
        setExecLoading(false);
        const d = doc.createElement('div'); d.style = 'color:#64748b;margin-top:10px;font-style:italic'; d.textContent='--- Program finished ---';
        tc.appendChild(d); doc.body.scrollTop = doc.body.scrollHeight;
      } else { S.pythonPollTimer = setTimeout(poll, 200); }
    } catch {
      setExecLoading(false);
      const doc = iframe.contentDocument;
      if (doc?.getElementById('tc')) { const s = doc.createElement('span'); s.className='err'; s.textContent='\n[Disconnected from Python Server]\n'; doc.getElementById('tc').appendChild(s); }
    }
  };
  poll();
}

// ─── Asset preview ────────────────────────────────────────────────────────────
export async function renderAssetPreview(filename) {
  createTab(filename, 'web');
  const iframe = document.getElementById(`iframe-${filename}`);
  if (!iframe) return;
  const asset = S.fileSystem[filename];

  if (filename.endsWith('.enc')) {
    let unlockData = S.unlockedKeys[filename];
    if (!unlockData) {
      const res = await S._callbacks.openCryptoModalAsync?.('unlock', 'Unlock Media', asset.strategy || 'double_pass');
      if (!res) return;
      unlockData = { password: res.password, keyPath: res.keyPath };
      S.unlockedKeys[filename] = unlockData; asset.strategy = res.strategy;
    }
    const lib = await S._callbacks.loadCryptoLib?.();
    const eb  = _b64ToBytes(asset.content);
    let kc = '';
    if (unlockData.keyPath && S.fileSystem[unlockData.keyPath]) {
      kc = S.editorDocs[unlockData.keyPath] ? S.editorDocs[unlockData.keyPath].getValue() : S.fileSystem[unlockData.keyPath].content;
    }
    const secret = (unlockData.password || '') + kc;
    let dec;
    if (asset.strategy?.includes('double')) dec = await lib.decryptFile(eb, secret);
    else if (asset.strategy?.includes('sep')) dec = await lib.decryptSEP(eb, secret);
    else dec = { data: await lib.decryptAES(eb, secret), ext: asset.originalExt || '.bin' };
    const mimeMap = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', mp3:'audio/mpeg', wav:'audio/wav', mp4:'video/mp4', webm:'video/webm', pdf:'application/pdf', svg:'image/svg+xml' };
    const ext  = dec.ext.replace('.','');
    const mime = mimeMap[ext] || 'application/octet-stream';
    iframe.src = URL.createObjectURL(new Blob([dec.data], { type: mime }));
    return;
  }

  if (asset.subtype === 'svg') iframe.src = URL.createObjectURL(new Blob([asset.content], { type: 'image/svg+xml' }));
  else iframe.src = asset.src;
}

// ─── Private helpers ──────────────────────────────────────────────────────────
function _clearPreview() {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
  S.activeTabId = null;
  setTabsEmptyState(true);
}

function _b64ToBytes(b64) {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }