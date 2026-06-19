/**
 * ui.js — Sidebar rendering, drag-and-drop, AI assistant, resizers, misc UI.
 */

import { S } from './state.js';
import { switchFile, renderEditorTabs } from './editor.js';

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export function renderSidebar() {
  const list = document.getElementById('file-list-all');
  if (!list) return;
  list.innerHTML = '';

  const tree = { children: {}, files: [] };

  // Build explicit folder nodes first
  S.explicitFolders.forEach(fp => {
    const parts = fp.split('/');
    let cur = tree;
    parts.forEach(part => {
      if (!cur.children[part]) cur.children[part] = { children: {}, files: [] };
      cur = cur.children[part];
    });
  });

  // Place files into tree
  Object.keys(S.fileSystem).forEach(path => {
    const parts    = path.split('/');
    const fileName = parts.pop();
    let cur = tree;
    parts.forEach(part => {
      if (!cur.children[part]) cur.children[part] = { children: {}, files: [] };
      cur = cur.children[part];
    });
    cur.files.push({ path, name: fileName });
  });

  _renderTree(tree, list, 0, '');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: list });
}

function _renderTree(node, container, depth, pathPrefix) {
  // Folders
  Object.keys(node.children).sort().forEach(folderName => {
    const childNode  = node.children[folderName];
    const folderPath = pathPrefix ? `${pathPrefix}/${folderName}` : folderName;
    const isOpen     = S.folderStates[folderPath] === true;
    const isRepo     = depth === 0 && S.importedRepoFolders.includes(folderName);

    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder-group';

    const header = document.createElement('div');
    header.className = `folder-header ${isOpen ? 'open' : ''}`;
    header.style.paddingLeft = `${15 + depth * 15}px`;
    header.setAttribute('data-path', folderPath);

    const folderIconHTML = isRepo
      ? `<svg class="icon-github" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>`
      : `<i data-lucide="${isOpen ? 'folder-open' : 'folder'}" class="icon-folder"></i>`;

    const isRoot        = folderPath === 'DeepBlue' || isRepo;
    const renameBtn     = isRoot ? '' : `<button class="btn-icon" onclick="event.stopPropagation();IDE.renameFolder('${folderPath}')" title="Rename"><i data-lucide="edit-2" style="width:12px;height:12px"></i></button>`;
    const deleteBtn     = isRoot ? '' : `<button class="btn-icon" onclick="event.stopPropagation();IDE.deleteFolder('${folderPath}')" style="color:#ef4444" title="Delete"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>`;

    header.innerHTML = `
      <div class="folder-name-container">
        <i data-lucide="chevron-right" class="chevron"></i>
        ${folderIconHTML}
        ${folderName}
      </div>
      <div class="folder-actions">
        <button class="btn-icon" onclick="event.stopPropagation();IDE.openAddMenu('${folderPath}')" title="Add"><i data-lucide="plus" style="width:12px;height:12px"></i></button>
        ${renameBtn}${deleteBtn}
      </div>`;

    const content = document.createElement('div');
    content.className = `folder-content ${isOpen ? 'open' : ''}`;

    header.onclick = e => {
      if (e.target.closest('.folder-actions')) return;
      const willOpen = !header.classList.contains('open');
      S.folderStates[folderPath] = willOpen;
      header.classList.toggle('open', willOpen);
      content.classList.toggle('open', willOpen);
      if (!isRepo) {
        const iconEl = header.querySelector('.icon-folder');
        if (iconEl) { iconEl.setAttribute('data-lucide', willOpen ? 'folder-open' : 'folder'); lucide.createIcons({ root: header }); }
      }
    };

    _renderTree(childNode, content, depth + 1, folderPath);
    folderDiv.appendChild(header);
    folderDiv.appendChild(content);
    container.appendChild(folderDiv);
  });

  // Files
  node.files.sort((a, b) => a.name.localeCompare(b.name)).forEach(file => {
    const div = document.createElement('div');
    div.className = `tab ${file.path === S.activeFile ? 'active' : ''}`;
    div.style.paddingLeft = `${15 + depth * 15}px`;
    div.setAttribute('data-path', file.path);
    div.onclick = async e => { if (!e.target.closest('.btn-icon')) await switchFile(file.path); };

    const ext = file.path.split('.').pop().toLowerCase();
    let iconName = 'file', iconColor = '#7b8ea5';
    if (ext === 'html')              { iconName = 'file-code-2';  iconColor = '#e34c26'; }
    else if (ext === 'css')          { iconName = 'file-code';    iconColor = '#264de4'; }
    else if (['js','jsx'].includes(ext)) { iconName = 'file-json';    iconColor = ext === 'jsx' ? '#61dafb' : '#f7df1e'; }
    else if (ext === 'py')           { iconName = 'file-code';    iconColor = '#3b82f6'; }
    else if (ext === 'json')         { iconName = 'file-json-2';  iconColor = '#f7df1e'; }
    else if (['md','txt'].includes(ext)) { iconName = 'file-text'; iconColor = '#94a3b8'; }
    else if (ext === 'sep')          { iconName = 'file-key-2';   iconColor = '#00e5ff'; }
    else if (ext === 'enc')          { iconName = 'file-lock-2';  iconColor = '#f43f5e'; }
    else if (ext === 'pdf')          { iconName = 'file-text';    iconColor = '#ef4444'; }
    else if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) { iconName = 'file-image'; iconColor = '#10b981'; }
    else if (['mp3','wav','ogg'].includes(ext)) { iconName = 'file-audio'; iconColor = '#8b5cf6'; }
    else if (['mp4','webm'].includes(ext))      { iconName = 'file-video'; iconColor = '#f43f5e'; }

    const isMod  = S.fileSystem[file.path]?.modified;
    const modDot = isMod ? `<span class="mod-dot" style="color:var(--accent);font-weight:bold"> •</span>` : '';

    div.innerHTML = `
      <div class="tab-name">
        <i data-lucide="${iconName}" style="color:${iconColor};width:14px;height:14px"></i>
        ${file.name}${modDot}
      </div>
      <div class="tab-actions">
        <button class="btn-icon" onclick="IDE.renameFile('${file.path}')" title="Rename"><i data-lucide="edit-2" style="width:12px;height:12px"></i></button>
        <button class="btn-icon" onclick="IDE.deleteFile('${file.path}')" style="color:#ef4444" title="Delete"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>
      </div>`;
    container.appendChild(div);
  });
}

// ─── Add / Save menus ─────────────────────────────────────────────────────────
export function openAddMenu(folderPath = '') {
  S.targetFolderForAdd = folderPath;
  const modal = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const urlOpt = document.getElementById('import-url-option');
  if (title) title.innerText = folderPath ? `Add to ${folderPath.split('/').pop()}` : 'Add File or Asset';
  if (urlOpt) urlOpt.style.display = 'flex';
  if (modal) { modal.classList.add('open'); modal.style.display = 'flex'; }
}

export function closeAddMenu() {
  const modal = document.getElementById('modal-overlay');
  if (modal) { modal.classList.remove('open'); setTimeout(() => (modal.style.display = 'none'), 200); }
}

export function openSaveMenu()  {
  const m = document.getElementById('save-modal-overlay');
  if (m) { m.classList.add('open'); m.style.display = 'flex'; }
}
export function closeSaveMenu() {
  const m = document.getElementById('save-modal-overlay');
  if (m) { m.classList.remove('open'); setTimeout(() => (m.style.display = 'none'), 200); }
}

export function uploadToCurrentFolder() {
  if (S.activeFile) {
    const parts = S.activeFile.split('/');
    parts.pop();
    S.targetFolderForAdd = parts.join('/');
  } else { S.targetFolderForAdd = ''; }
  document.getElementById('file-upload')?.click();
}

// ─── Drag & drop ──────────────────────────────────────────────────────────────
export function initDragDrop() {
  const overlay = document.getElementById('drag-overlay');
  if (!overlay) return;
  let counter = 0;
  window.addEventListener('dragenter',  e => { e.preventDefault(); counter++;  overlay.classList.add('active'); });
  window.addEventListener('dragleave',  e => { e.preventDefault(); counter--;  if (counter === 0) overlay.classList.remove('active'); });
  window.addEventListener('dragover',   e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); counter = 0; overlay.classList.remove('active');
    S._callbacks.handleDroppedFiles?.(e.dataTransfer.files);
  });
}

// ─── Console input ────────────────────────────────────────────────────────────
/**
 * Routes a typed command to whichever console tab is currently active:
 *  - "system"   → evaluated against the IDE's own global scope (indirect
 *                 eval), so `deepBlue.*`, `IDE.*`, `console.hack()`, etc. are
 *                 all reachable directly from the console input.
 *  - file tab   → evaluated inside that preview tab's live iframe, as before.
 */
export function initConsoleInput() {
  const input = document.getElementById('console-input');
  if (!input) return;
  input.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const cmd = input.value;
    if (!cmd) return;
    const target = S.activeConsoleTab || 'system';
    S._callbacks.logToConsole?.('input', cmd, target);
    input.value = '';

    if (target === 'system') {
      try {
        const result = (0, eval)(cmd); // indirect eval → runs in global/module scope
        if (result instanceof Promise) {
          result.then(v => { if (v !== undefined) S._callbacks.logToConsole?.('log', _fmtResult(v), 'system'); })
                .catch(err => S._callbacks.logToConsole?.('error', String(err), 'system'));
        } else if (result !== undefined) {
          S._callbacks.logToConsole?.('log', _fmtResult(result), 'system');
        }
      } catch (err) { S._callbacks.logToConsole?.('error', err.toString(), 'system'); }
      return;
    }

    const iframe = document.getElementById(`iframe-${target}`);
    if (iframe?.contentWindow) {
      try {
        const result = iframe.contentWindow.eval(cmd);
        if (result instanceof Promise) {
          result.then(v => { if (v !== undefined) S._callbacks.logToConsole?.('log', String(v), target); })
                .catch(err => S._callbacks.logToConsole?.('error', String(err), target));
        } else if (result !== undefined) { S._callbacks.logToConsole?.('log', String(result), target); }
      } catch (err) { S._callbacks.logToConsole?.('error', err.toString(), target); }
    } else { S._callbacks.logToConsole?.('warn', 'No active web preview.', target); }
  });
}

function _fmtResult(v) {
  if (v === null) return 'null';
  if (typeof v === 'object') { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }
  return String(v);
}

// ─── Fullscreen ───────────────────────────────────────────────────────────────
export function toggleFullscreen() {
  const container = document.getElementById('output-container');
  const btn       = document.getElementById('fullscreen-btn');
  if (!container || !btn) return;
  container.classList.toggle('expanded');
  const isExpanded = container.classList.contains('expanded');
  btn.innerHTML = isExpanded
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8"/><path d="M9 19.8V15m0 0H4.2M9 15l-6 6"/><path d="M15 4.2V9m0 0h4.8M15 9l6-6"/><path d="M9 4.2V9m0 0H4.2M9 9 3 3"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 15 6 6"/><path d="m15 9 6-6"/><path d="M21 16v5h-5"/><path d="M21 8V3h-5"/><path d="M3 16v5h5"/><path d="m3 21 6-6"/><path d="M3 8V3h5"/><path d="M9 9 3 3"/></svg>`;
  btn.title = isExpanded ? 'Exit Fullscreen (Esc)' : 'Fullscreen (Esc to exit)';
}

// ─── Panel resizers ───────────────────────────────────────────────────────────
export function initResizers() {
  const resizerLeft  = document.getElementById('resizer-left');
  const resizerRight = document.getElementById('resizer-right');
  const sidebar      = document.getElementById('sidebar-panel');
  const output       = document.getElementById('output-container');
  const container    = document.getElementById('main-container');
  const cmEditor     = () => S.cmEditor;
  if (!resizerLeft || !resizerRight || !sidebar || !output || !container) return;

  let isResizing = false, currentResizer = null;

  const onDown = (e, r) => {
    isResizing = true; currentResizer = r; r.classList.add('resizing');
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    document.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = 'none'));
    if (r === resizerRight) { const w = output.getBoundingClientRect().width; output.style.flex = 'none'; output.style.width = w + 'px'; }
  };
  const onMove = e => {
    if (!isResizing) return;
    const cr = container.getBoundingClientRect();
    if (currentResizer === resizerLeft) {
      let w = e.clientX - cr.left;
      if (w < 150) w = 150; if (w > cr.width * 0.4) w = cr.width * 0.4;
      sidebar.style.width = w + 'px';
    } else if (currentResizer === resizerRight) {
      let w = cr.right - e.clientX;
      if (w < 200) w = 200; if (w > cr.width * 0.5) w = cr.width * 0.5;
      output.style.width = w + 'px';
    }
    cmEditor()?.refresh();
  };
  const onUp = () => {
    if (!isResizing) return;
    isResizing = false; currentResizer?.classList.remove('resizing'); currentResizer = null;
    document.body.style.cursor = ''; document.body.style.userSelect = '';
    document.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = ''));
    cmEditor()?.refresh();
  };

  resizerLeft.addEventListener('mousedown',  e => onDown(e, resizerLeft));
  resizerRight.addEventListener('mousedown', e => onDown(e, resizerRight));
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

export function initAIResizer() {
  const r  = document.getElementById('ai-resizer');
  const ai = document.getElementById('ai-sidebar');
  if (!r || !ai) return;
  let active = false;
  r.addEventListener('mousedown', () => { active = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; document.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = 'none')); });
  document.addEventListener('mousemove', e => { if (!active) return; let w = window.innerWidth - e.clientX; if (w < 250) w = 250; if (w > window.innerWidth * 0.8) w = window.innerWidth * 0.8; ai.style.width = w + 'px'; });
  document.addEventListener('mouseup',   () => { if (!active) return; active = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; document.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = '')); });
}

// ─── AI Assistant ─────────────────────────────────────────────────────────────
export function toggleAI() {
  document.getElementById('ai-sidebar')?.classList.toggle('open');
  checkApiKey();
}

export function checkApiKey() {
  const key = localStorage.getItem('gemini_api_key');
  const ctr = document.getElementById('apikey-container');
  if (!ctr) return;
  ctr.classList.toggle('visible', !key);
}

export function saveApiKey() {
  const input = document.getElementById('apikey-input');
  if (input?.value.trim()) { localStorage.setItem('gemini_api_key', input.value.trim()); checkApiKey(); addAiMessage('bot', 'API Key saved!'); }
}

export function addAiMessage(role, text) {
  const box = document.getElementById('ai-chat-box');
  if (!box) return;
  const div = document.createElement('div');
  div.className = `ai-msg ${role}`;
  div.innerHTML = marked.parse(text);
  div.querySelectorAll('pre').forEach(pre => {
    const codeEl  = pre.querySelector('code');
    const rawCode = codeEl ? codeEl.innerText : pre.innerText;
    const wrapper = document.createElement('div'); wrapper.className = 'code-block-wrapper';
    const header  = document.createElement('div'); header.className  = 'code-block-header';
    header.innerHTML = `<span>Code</span><div class="code-block-actions"><button class="insert-btn">Insert</button><button class="replace-btn">Replace</button></div>`;
    header.querySelector('.insert-btn').onclick = () => { S.cmEditor?.replaceRange(rawCode, S.cmEditor.getCursor()); S.cmEditor?.focus(); };
    header.querySelector('.replace-btn').onclick = () => { S.cmEditor?.setValue(rawCode); S.cmEditor?.focus(); };
    const content = document.createElement('div'); content.className = 'code-block-content';
    pre.parentNode.insertBefore(wrapper, pre);
    content.appendChild(pre); wrapper.appendChild(header); wrapper.appendChild(content);
    pre.style.margin = pre.style.background = pre.style.padding = pre.style.border = '';
  });
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

export async function callGemini() {
  const input  = document.getElementById('ai-user-input');
  const prompt = input?.value.trim();
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  if (!prompt || !input) return;

  addAiMessage('user', prompt);
  input.value = '';

  // @mention file inclusion
  let extraContext = '';
  const fileRegex  = /@([\w./-]+)/g;
  let m;
  while ((m = fileRegex.exec(prompt)) !== null) {
    const fn = m[1];
    if (S.fileSystem[fn]?.content) extraContext += `\n--- Included: ${fn} ---\n\`\`\`\n${S.fileSystem[fn].content}\n\`\`\`\n`;
  }

  let context = `Current File: ${S.activeFile}\nCode:\n\`\`\`\n${S.cmEditor?.getValue() ?? ''}\n\`\`\``;
  const sel   = S.cmEditor?.getSelection();
  if (sel)    context += `\nSelected:\n\`\`\`\n${sel}\n\`\`\``;
  if (extraContext) context += extraContext;
  context += `\nUser Request: ${prompt}`;

  const loadDiv = document.createElement('div');
  loadDiv.className = 'ai-msg bot'; loadDiv.innerText = 'Thinking…'; loadDiv.id = 'ai-loading';
  document.getElementById('ai-chat-box')?.appendChild(loadDiv);

  try {
    const url     = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const payload = {
      systemInstruction: { parts: [{ text: 'You are an AI coding assistant integrated into DeepBlue IDE by ProElectricCoder.' }] },
      contents: [{ parts: [{ text: context }] }]
    };
    const res    = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const result = await res.json();
    const text   = result.candidates?.[0]?.content?.parts?.[0]?.text;
    document.getElementById('ai-loading')?.remove();
    addAiMessage('bot', text || 'No response');
  } catch (e) {
    document.getElementById('ai-loading')?.remove();
    addAiMessage('bot', 'Error: ' + e.message);
  }
}