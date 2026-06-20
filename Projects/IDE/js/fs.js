/**
 * fs.js — Virtual file system operations, auto-save, disk persistence.
 */

import { S } from './state.js';
import { customAlert, customConfirm, customPrompt } from './dialogs.js';
import { syncDocsToContent, clearModifiedFlags, closeEditorTab, renderEditorTabs, switchFile } from './editor.js';

// ─── Auto-save (localStorage) ─────────────────────────────────────────────────
export function initAutoSave() {
  const loadKey = (k, def, parse = false) => {
    try {
      const v = localStorage.getItem(k);
      if (!v) return def;
      return parse ? JSON.parse(v) : v;
    } catch { return def; }
  };

  const savedFS      = loadKey('deepBlueFS',       null,              true);
  const savedFolders = loadKey('deepBlueFolders',   null,              true);
  const savedDeleted = loadKey('deepBlueDeleted',   null,              true);
  const savedRepos   = loadKey('deepBlueRepoFolders', null,            true);

  if (savedFS)      Object.assign(S.fileSystem, savedFS);
  if (savedFolders) { S.explicitFolders = savedFolders; if (!S.explicitFolders.includes('DeepBlue')) S.explicitFolders.push('DeepBlue'); }
  if (savedDeleted) S.deletedFiles = savedDeleted;
  if (savedRepos)   S.importedRepoFolders = savedRepos;

  // Migrate old GitHub config
  const oldRepo   = localStorage.getItem('deepBlue_gh_repo');
  const oldBranch = localStorage.getItem('deepBlue_gh_branch');
  if (oldRepo && oldBranch) {
    const folder = oldRepo.split('/').pop();
    S.githubRepos[folder] = { repo: oldRepo, branch: oldBranch };
    localStorage.removeItem('deepBlue_gh_repo');
    localStorage.removeItem('deepBlue_gh_branch');
    localStorage.setItem('deepBlue_gh_repos', JSON.stringify(S.githubRepos));
    if (!S.importedRepoFolders.includes(folder)) S.importedRepoFolders.push(folder);
  }

  setInterval(async () => {
    if (!S.unsavedChanges) return;
    await syncDocsToContent();
    localStorage.setItem('deepBlueFS',          JSON.stringify(S.fileSystem));
    localStorage.setItem('deepBlueFolders',     JSON.stringify(S.explicitFolders));
    localStorage.setItem('deepBlueDeleted',     JSON.stringify(S.deletedFiles));
    localStorage.setItem('deepBlueRepoFolders', JSON.stringify(S.importedRepoFolders));
    S.unsavedChanges = false;
  }, 5000);
}

// ─── Save project (File System Access API or ZIP fallback) ────────────────────
export async function saveProject(isAutoSave = false) {
  await syncDocsToContent();
  const btn = document.getElementById('save-btn');
  if (btn && !isAutoSave) btn.innerText = 'Saving…';

  try {
    if ('showDirectoryPicker' in window) {
      if (!S.projectHandle && !isAutoSave) {
        S.projectHandle = await window.showDirectoryPicker();
      }
      if (S.projectHandle) {
        await saveToHandle(S.projectHandle);
        if (!isAutoSave) { if (btn) { btn.innerText = 'Saved!'; setTimeout(() => (btn.innerText = 'Save'), 2000); } clearModifiedFlags(); }
        else             { if (btn) { btn.style.color = '#4ade80'; setTimeout(() => (btn.style.color = ''), 1000); } }
        return;
      }
    }
    throw new Error('API not supported');
  } catch (err) {
    if (!isAutoSave) {
      await saveToZip();
      if (err.name === 'AbortError') S.projectHandle = null;
      if (btn) { btn.innerText = 'Saved!'; setTimeout(() => (btn.innerText = 'Save'), 2000); }
      clearModifiedFlags();
    }
  }
}

export async function saveToHandle(dirHandle) {
  for (const [name, file] of Object.entries(S.fileSystem)) {
    if (file.modified === false) continue;
    const parts    = name.split('/');
    const fileName = parts.pop();
    let cur        = dirHandle;
    for (const part of parts) cur = await cur.getDirectoryHandle(part, { create: true });

    const fh = await cur.getFileHandle(fileName, { create: true });
    const wr = await fh.createWritable();
    if (file.type === 'asset') {
      if (file.subtype === 'svg') await wr.write(new Blob([file.content], { type: 'image/svg+xml' }));
      else { const res = await fetch(file.src); await wr.write(await res.blob()); }
    } else {
      await wr.write(file.content);
    }
    await wr.close();
  }

  for (const name of S.deletedFiles) {
    try {
      const parts = name.split('/');
      const fn    = parts.pop();
      let cur     = dirHandle;
      for (const p of parts) cur = await cur.getDirectoryHandle(p);
      await cur.removeEntry(fn);
    } catch {}
  }
}

export async function saveToZip() {
  const zip = new JSZip();
  const promises = [];
  for (const [name, file] of Object.entries(S.fileSystem)) {
    if (file.type === 'asset') {
      if (file.subtype === 'svg') zip.file(name, file.content);
      else promises.push(fetch(file.src).then(r => r.blob()).then(b => zip.file(name, b)).catch(() => {}));
    } else {
      zip.file(name, file.content);
    }
  }
  await Promise.all(promises);
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, 'project.zip');
}

export async function isBinaryFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const arr = new Uint8Array(e.target.result);
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === 0) { // null byte
          resolve(true);
          return;
        }
      }
      resolve(false);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file.slice(0, 8192));
  });
}

export async function processFileHandleLoad(handles) {
  let lastFile = null;
  for (const handle of handles) {
    try {
      const file = await handle.getFile();
      const name = 'DeepBlue/' + file.name;
      const ext = name.split('.').pop().toLowerCase();

      const isBinary = await isBinaryFile(file);
      const isSVG = ext === 'svg';

      const reader = new FileReader();
      if (!isBinary || isSVG) {
        const content = await file.text();
        if (isSVG) {
          S.fileSystem[name] = { type: 'asset', subtype: 'svg', content, modified: true };
        } else {
          let type = 'text';
          if (ext === 'html') type = 'html';
          else if (ext === 'css') type = 'css';
          else if (['js','jsx'].includes(ext)) type = 'js';
          S.fileSystem[name] = { type, content, modified: true };
        }
      } else {
        const content = await new Promise((r, reject) => {
          const req = new FileReader();
          req.onload = e => r(e.target.result);
          req.onerror = reject;
          req.readAsDataURL(file);
        });
        if (ext === 'enc') {
          S.fileSystem[name] = { type: 'enc', content: content.split(',')[1], modified: true, strategy: 'double_pass', originalExt: '.txt' };
        } else {
          let subtype = 'image';
          if (['mp3','wav','ogg'].includes(ext)) subtype = 'audio';
          else if (['mp4','webm'].includes(ext)) subtype = 'video';
          else if (ext === 'pdf') subtype = 'pdf';
          S.fileSystem[name] = { type: 'asset', subtype, src: content, content: null, modified: true };
        }
      }
      lastFile = name;
    } catch(e) {
      console.error(e);
    }
  }
  if (lastFile) {
    if (!S.explicitFolders.includes('DeepBlue')) S.explicitFolders.push('DeepBlue');
    S._callbacks.renderSidebar?.();
    S.unsavedChanges = true;
    await switchFile(lastFile);
  }
}

// ─── File / folder CRUD ───────────────────────────────────────────────────────
export async function createNewFile() {
  const defaultPath = S.targetFolderForAdd ? S.targetFolderForAdd + '/' : '';
  const name = await customPrompt(
      'Enter file path (e.g. src/script.js, style.css):',
      defaultPath, 'New File', Object.keys(S.fileSystem)
  );
  if (!name) return;
  if (S.fileSystem[name]) { await customAlert('File name exists!', 'Error'); return; }

  const titleName = name.split('/').pop().replace(/\.[^/.]+$/, '');
  const ext       = name.split('.').pop().toLowerCase();
  let type = 'text', content = '';

  if (['js','jsx'].includes(ext))     { type = 'js';  content = `// ${name}\n`; }
  else if (ext === 'css')             { type = 'css'; content = `/* ${name} */\n`; }
  else if (ext === 'html')            { type = 'html'; content = `<!DOCTYPE html>\n<html>\n<head>\n\t<title>${titleName}</title>\n</head>\n<body>\n\t<h1>${titleName}</h1>\n</body>\n</html>`; }
  else if (ext === 'json')            { type = 'text'; content = `{\n\t\n}`; }
  else if (ext === 'md')              { type = 'text'; content = `# ${titleName}\n`; }
  else if (ext === 'py')              { type = 'text'; content = `# ${name}\nprint("Hello, world!")\n`; }
  else if (ext === 'txt')             { type = 'text'; content = ''; }
  // ── Additional languages (CodeMirror modes lazy-loaded on open, see editor.js) ──
  else if (['ts','tsx'].includes(ext)) { type = 'text'; content = `// ${name}\n`; }
  else if (ext === 'sql')             { type = 'text'; content = `-- ${name}\n`; }
  else if (['c','h'].includes(ext))   { type = 'text'; content = `// ${name}\n#include <stdio.h>\n\nint main(void) {\n\tprintf("Hello, world!\\n");\n\treturn 0;\n}\n`; }
  else if (['cpp','cc','cxx','hpp'].includes(ext)) { type = 'text'; content = `// ${name}\n#include <iostream>\n\nint main() {\n\tstd::cout << "Hello, world!" << std::endl;\n\treturn 0;\n}\n`; }
  else if (ext === 'cs')              { type = 'text'; content = `// ${name}\nusing System;\n\nclass Program {\n\tstatic void Main() {\n\t\tConsole.WriteLine("Hello, world!");\n\t}\n}\n`; }
  else if (ext === 'java')            { type = 'text'; content = `// ${name}\npublic class ${titleName} {\n\tpublic static void main(String[] args) {\n\t\tSystem.out.println("Hello, world!");\n\t}\n}\n`; }
  else if (ext === 'go')              { type = 'text'; content = `// ${name}\npackage main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, world!")\n}\n`; }
  else if (ext === 'rs')              { type = 'text'; content = `// ${name}\nfn main() {\n\tprintln!("Hello, world!");\n}\n`; }
  else if (ext === 'php')             { type = 'text'; content = `<?php\n// ${name}\necho "Hello, world!";\n`; }
  else if (ext === 'svg') {
    S.fileSystem[name] = { type: 'asset', subtype: 'svg', content: '<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><circle cx="25" cy="25" r="20" fill="red"/></svg>', modified: true };
    S.unsavedChanges = true;
    S._callbacks.renderSidebar?.();
    await switchFile(name); return;
  } else if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
    S.fileSystem[name] = { type: 'asset', subtype: 'image', src: 'https://placehold.co/100x100/333/white?text=IMG', content: null, modified: true };
    S.unsavedChanges = true;
    S._callbacks.renderSidebar?.();
    await switchFile(name); return;
  } else {
    await customAlert('Supported: .html .css .js .jsx .ts .tsx .py .json .md .txt .sql .c .h .cpp .cs .java .go .rs .php .svg .png', 'Invalid Format'); return;
  }

  S.fileSystem[name] = { type, content, modified: true };
  S.unsavedChanges = true;
  S._callbacks.renderSidebar?.();
  await switchFile(name);
  setTimeout(() => {
    if (ext === 'html') S.cmEditor.setCursor({ line: 7, ch: 0 });
    else if (ext === 'json') S.cmEditor.setCursor({ line: 1, ch: 0 });
    else S.cmEditor.setCursor({ line: S.cmEditor.lineCount(), ch: 0 });
    S.cmEditor.focus();
  }, 50);
}

export async function createNewFolder() {
  const defaultPath = S.targetFolderForAdd ? S.targetFolderForAdd + '/' : '';
  let name = await customPrompt('Enter folder path:', defaultPath, 'New Folder', S.explicitFolders);
  if (!name) return;
  name = name.replace(/\/+$/, '');
  if (!S.explicitFolders.includes(name)) { S.explicitFolders.push(name); S._callbacks.renderSidebar?.(); S.unsavedChanges = true; }
}

export async function renameFile(oldName) {
  const newName = await customPrompt('Rename to:', oldName, 'Rename File');
  if (!newName || newName === oldName) return;
  if (S.fileSystem[newName]) { await customAlert('Name already taken!', 'Error'); return; }
  if (S.fileSystem[oldName]) {
    S.fileSystem[newName] = { ...S.fileSystem[oldName], modified: true };
    delete S.fileSystem[oldName];
    S.deletedFiles.push(oldName);
  }
  if (S.editorDocs[oldName]) { S.editorDocs[newName] = S.editorDocs[oldName]; delete S.editorDocs[oldName]; }
  const tabIdx = S.openEditorTabs.indexOf(oldName);
  if (tabIdx > -1) S.openEditorTabs[tabIdx] = newName;
  if (S.activeFile === oldName) S.activeFile = newName;
  S._callbacks.renderSidebar?.();
  renderEditorTabs();
  S.unsavedChanges = true;
}

export async function deleteFile(name) {
  if (!await customConfirm(`Delete '${name}'?`, 'Confirm')) return;
  if (S.fileSystem[name]) { delete S.fileSystem[name]; S.deletedFiles.push(name); }
  if (S.editorDocs[name]) delete S.editorDocs[name];

  const idx = S.openEditorTabs.indexOf(name);
  if (idx > -1) {
    S.openEditorTabs.splice(idx, 1);
    if (S.activeFile === name) {
      S.activeFile = null;
      const next = S.openEditorTabs[idx - 1] || S.openEditorTabs[0] || null;
      if (next) await switchFile(next);
      else {
        document.querySelector('.editor-wrapper').style.display = 'none';
        document.getElementById('binary-overlay').style.display = 'flex';
        document.getElementById('binary-info').innerText = 'No File Selected';
        document.getElementById('editor-lang-label').innerText = 'NONE';
        const url = new URL(window.location);
        url.searchParams.delete('file');
        window.history.replaceState(null, '', url);
        renderEditorTabs();
      }
    } else { renderEditorTabs(); }
  }
  S._callbacks.renderSidebar?.();
  S.unsavedChanges = true;
}

export async function renameFolder(oldPath) {
  if (oldPath === 'DeepBlue' || S.importedRepoFolders.includes(oldPath)) return;
  const parts   = oldPath.split('/');
  const oldName = parts.pop();
  const parent  = parts.join('/');
  const newName = await customPrompt('Rename folder to:', oldName, 'Rename Folder');
  if (!newName || newName === oldName) return;
  if (newName.includes('/')) { await customAlert('Folder names cannot contain slashes.', 'Error'); return; }
  const newPath = parent ? `${parent}/${newName}` : newName;
  if (S.explicitFolders.includes(newPath)) { await customAlert('Folder already exists!', 'Error'); return; }

  S.explicitFolders = S.explicitFolders.map(f =>
      f === oldPath ? newPath : f.startsWith(oldPath + '/') ? newPath + f.slice(oldPath.length) : f
  );

  for (const p of Object.keys(S.fileSystem)) {
    if (!p.startsWith(oldPath + '/')) continue;
    const np = newPath + p.slice(oldPath.length);
    S.fileSystem[np] = { ...S.fileSystem[p], modified: true };
    delete S.fileSystem[p];
    S.deletedFiles.push(p);
    if (S.editorDocs[p]) { S.editorDocs[np] = S.editorDocs[p]; delete S.editorDocs[p]; }
    if (S.activeFile === p) S.activeFile = np;
  }

  S.openEditorTabs = S.openEditorTabs.map(p => p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p);

  const newStates = {};
  for (const [p, v] of Object.entries(S.folderStates)) {
    const np = p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p;
    newStates[np] = v;
  }
  S.folderStates = newStates;

  S.unsavedChanges = true;
  S._callbacks.renderSidebar?.();
  renderEditorTabs();
  if (S.activeFile) await switchFile(S.activeFile);
}

export async function deleteFolder(folderPath) {
  if (folderPath === 'DeepBlue') return;
  if (!await customConfirm(`Delete folder '${folderPath}' and all its contents?`, 'Confirm')) return;

  if (S.importedRepoFolders.includes(folderPath)) {
    delete S.githubRepos[folderPath];
    localStorage.setItem('deepBlue_gh_repos', JSON.stringify(S.githubRepos));
  }

  S.explicitFolders      = S.explicitFolders.filter(f => f !== folderPath && !f.startsWith(folderPath + '/'));
  S.importedRepoFolders  = S.importedRepoFolders.filter(f => f !== folderPath);

  let activeDeleted = false;
  for (const p of Object.keys(S.fileSystem)) {
    if (!p.startsWith(folderPath + '/')) continue;
    delete S.fileSystem[p];
    S.deletedFiles.push(p);
    if (S.activeFile === p) activeDeleted = true;
  }
  for (const p of Object.keys(S.editorDocs)) {
    if (p.startsWith(folderPath + '/')) delete S.editorDocs[p];
  }
  S.openEditorTabs = S.openEditorTabs.filter(p => !p.startsWith(folderPath + '/'));

  if (activeDeleted) {
    S.activeFile = null;
    const next = S.openEditorTabs.length ? S.openEditorTabs[S.openEditorTabs.length - 1] : (Object.keys(S.fileSystem)[0] || null);
    if (next) await switchFile(next);
    else {
      document.querySelector('.editor-wrapper').style.display = 'none';
      document.getElementById('binary-overlay').style.display = 'flex';
      document.getElementById('binary-info').innerText = 'No File Selected';
      document.getElementById('editor-lang-label').innerText = 'NONE';
      const url = new URL(window.location); url.searchParams.delete('file');
      window.history.replaceState(null, '', url);
      renderEditorTabs();
    }
  } else { renderEditorTabs(); }

  S.unsavedChanges = true;
  S._callbacks.renderSidebar?.();
}

// ─── File upload handlers ─────────────────────────────────────────────────────
export async function processUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const name = S.targetFolderForAdd ? `${S.targetFolderForAdd}/${file.name}` : file.name;
  if (S.fileSystem[name]) { if (!await customConfirm(`Overwrite '${name}'?`, 'File Exists')) { event.target.value = ''; return; } }

  const ext      = name.split('.').pop().toLowerCase();
  const isBinary = await isBinaryFile(file);
  const isSVG    = ext === 'svg';

  const reader = new FileReader();
  if (!isBinary || isSVG) reader.readAsText(file); else reader.readAsDataURL(file);

  reader.onload = async e => {
    const content = e.target.result;
    if (isSVG) {
      S.fileSystem[name] = { type: 'asset', subtype: 'svg', content, modified: true };
    } else if (!isBinary) {
      let type = 'text';
      if (ext === 'html') type = 'html';
      else if (ext === 'css') type = 'css';
      else if (['js','jsx'].includes(ext)) type = 'js';
      S.fileSystem[name] = { type, content, modified: true };
    } else if (ext === 'enc') {
      const b64 = content.split(',')[1];
      S.fileSystem[name] = { type: 'enc', content: b64, modified: true, strategy: 'double_pass', originalExt: '.txt' };
    } else {
      let subtype = 'image';
      if (['mp3','wav','ogg'].includes(ext)) subtype = 'audio';
      else if (['mp4','webm'].includes(ext)) subtype = 'video';
      else if (ext === 'pdf') subtype = 'pdf';
      S.fileSystem[name] = { type: 'asset', subtype, src: content, content: null, modified: true };
    }
    S.unsavedChanges = true;
    S._callbacks.renderSidebar?.();
    await switchFile(name);
    event.target.value = '';
  };
}

export async function processFolderUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  const uploadedFolders = new Set();
  const promises = files.map(file => new Promise(async resolve => {
    const original = file.webkitRelativePath || file.name;
    const path     = S.targetFolderForAdd ? `${S.targetFolderForAdd}/${original}` : original;
    const parts    = path.split('/');
    parts.pop();
    let cur = '';
    for (const p of parts) { cur = cur ? `${cur}/${p}` : p; uploadedFolders.add(cur); }

    const ext      = path.split('.').pop().toLowerCase();
    const isBinary = await isBinaryFile(file);
    const isSVG    = ext === 'svg';

    const reader   = new FileReader();
    if (!isBinary || isSVG) reader.readAsText(file); else reader.readAsDataURL(file);
    reader.onload = e => {
      const content = e.target.result;
      if (isSVG) { S.fileSystem[path] = { type: 'asset', subtype: 'svg', content, modified: true }; }
      else if (!isBinary) {
        let type = 'text';
        if (ext === 'html') type = 'html';
        else if (ext === 'css') type = 'css';
        else if (['js','jsx'].includes(ext)) type = 'js';
        S.fileSystem[path] = { type, content, modified: true };
      } else {
        let subtype = 'image';
        if (['mp3','wav','ogg'].includes(ext)) subtype = 'audio';
        else if (['mp4','webm'].includes(ext)) subtype = 'video';
        else if (ext === 'pdf') subtype = 'pdf';
        S.fileSystem[path] = { type: 'asset', subtype, src: content, content: null, modified: true };
      }
      resolve();
    };
  }));

  await Promise.all(promises);
  for (const f of uploadedFolders) if (!S.explicitFolders.includes(f)) S.explicitFolders.push(f);
  S.unsavedChanges = true;
  S._callbacks.renderSidebar?.();
  event.target.value = '';
}

export async function handleDroppedFiles(files) {
  for (const file of Array.from(files)) {
    const name = file.name;
    if (S.fileSystem[name] && !await customConfirm(`Overwrite ${name}?`, 'File Exists')) continue;

    const isBinary = await isBinaryFile(file);
    const ext = name.split('.').pop().toLowerCase();
    const isSVG = ext === 'svg';

    const reader = new FileReader();
    if (!isBinary || isSVG) {
      reader.onload = async e => {
        if (isSVG) S.fileSystem[name] = { type: 'asset', subtype: 'svg', content: e.target.result, modified: true };
        else {
          let type = 'html';
          if (['js', 'jsx'].includes(ext)) type = 'js';
          else if (ext === 'css') type = 'css';
          else type = 'text';
          S.fileSystem[name] = { type, content: e.target.result, modified: true };
        }
        S._callbacks.renderSidebar?.(); S.unsavedChanges = true;
        await switchFile(name);
      };
      reader.readAsText(file);
    } else {
      reader.onload = async e => {
        let subtype = 'image';
        if (['mp3','wav','ogg'].includes(ext)) subtype = 'audio';
        else if (['mp4','webm'].includes(ext)) subtype = 'video';
        else if (ext === 'pdf') subtype = 'pdf';
        else if (ext === 'enc') {
          S.fileSystem[name] = { type: 'enc', content: e.target.result.split(',')[1], modified: true, strategy: 'double_pass', originalExt: '.txt' };
          S._callbacks.renderSidebar?.(); S.unsavedChanges = true;
          await switchFile(name);
          return;
        }
        S.fileSystem[name] = { type: 'asset', subtype, src: e.target.result, content: null, modified: true };
        S._callbacks.renderSidebar?.(); S.unsavedChanges = true;
        await switchFile(name);
      };
      reader.readAsDataURL(file);
    }
  }
}