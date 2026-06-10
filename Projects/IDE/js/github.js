/**
 * github.js — Firebase GitHub OAuth, GitHub REST API, repo import & commit.
 */

import { S, FIREBASE_CONFIG } from './state.js';
import { customAlert, customConfirm, customPrompt, showCustomDialog } from './dialogs.js';
import { syncDocsToContent } from './editor.js';
import { clearModifiedFlags } from './editor.js';

// ─── Firebase lazy init ───────────────────────────────────────────────────────
async function initFirebase() {
  if (S.firebaseApp) return;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
  const { getAuth }       = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
  S.firebaseApp  = initializeApp(FIREBASE_CONFIG);
  S.firebaseAuth = getAuth(S.firebaseApp);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export async function confirmGithubAuth() {
  if (S.githubToken) { await customAlert('You are already connected to GitHub.', 'GitHub'); return; }
  const ok = await customConfirm('Connect your GitHub account to import and commit to repositories.', 'Connect GitHub');
  if (ok) openGithubAuth();
}

export async function openGithubAuth() {
  try {
    await initFirebase();
    const { signInWithPopup, GithubAuthProvider } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    const provider = new GithubAuthProvider();
    provider.addScope('repo');
    const result     = await signInWithPopup(S.firebaseAuth, provider);
    const credential = GithubAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      S.githubToken = credential.accessToken;
      localStorage.setItem('deepBlue_gh_token', S.githubToken);
      document.getElementById('gh-commit-btn')?.style.setProperty('display', 'flex');
      await customAlert(`Logged in as ${result.user.displayName || result.user.email}`, 'Success');
    }
  } catch (e) {
    await customAlert('Login Failed: ' + e.message, 'Auth Error');
  }
}

// ─── GitHub REST API helper ───────────────────────────────────────────────────
export async function ghApi(endpoint, method = 'GET', body = null) {
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (S.githubToken) headers['Authorization'] = `token ${S.githubToken}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.github.com${endpoint}`, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { const d = await res.json(); if (d.message) msg = d.message; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ─── Progress bar fetch ───────────────────────────────────────────────────────
export async function fetchWithProgress(url) {
  const bar = document.getElementById('gh-loading-bar');
  if (bar) { bar.style.opacity = '1'; bar.style.width = '50%'; }
  try {
    const res  = await fetch(url);
    const text = await res.text();
    if (bar) { bar.style.width = '100%'; setTimeout(() => { bar.style.opacity = '0'; setTimeout(() => (bar.style.width = '0%'), 300); }, 300); }
    return text;
  } catch (e) {
    if (bar) { bar.style.opacity = '0'; setTimeout(() => (bar.style.width = '0%'), 300); }
    throw e;
  }
}

// ─── Import repository ────────────────────────────────────────────────────────
export function handleGithubImport() {
  S._callbacks.closeAddMenu?.();
  setTimeout(async () => {
    let repoInput = await customPrompt('Enter GitHub Repo (e.g. ProElectricCoder/proelectriccoder.github.io):', '', 'Import GitHub Repository');
    if (!repoInput) return;
    repoInput = repoInput.replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');

    const bar = document.getElementById('gh-loading-bar');
    try {
      const repoInfo     = await ghApi(`/repos/${repoInput}`);
      const defaultBranch= repoInfo.default_branch || 'main';
      const branch       = await customPrompt('Branch:', defaultBranch, 'Branch') || defaultBranch;

      if (bar) { bar.style.opacity = '1'; bar.style.width = '10%'; }

      const treeData      = await ghApi(`/repos/${repoInput}/git/trees/${branch}?recursive=1`);
      const repoFolder    = repoInput.split('/').pop();

      S.githubRepos[repoFolder] = { repo: repoInput, branch };
      localStorage.setItem('deepBlue_gh_repos', JSON.stringify(S.githubRepos));
      if (!S.explicitFolders.includes(repoFolder))       S.explicitFolders.push(repoFolder);
      if (!S.importedRepoFolders.includes(repoFolder))   S.importedRepoFolders.push(repoFolder);
      S.folderStates[repoFolder] = true;

      if (bar) bar.style.width = '30%';

      // Conflict check
      const fileItems  = treeData.tree.filter(i => i.type !== 'tree');
      const conflicts  = fileItems.filter(i => S.fileSystem[`${repoFolder}/${i.path}`]);
      let overwrite    = true;
      if (conflicts.length) overwrite = await customConfirm(`${conflicts.length} file(s) already exist in '${repoFolder}'. Overwrite?`, 'Conflicts');

      let loaded = 0;
      for (const item of treeData.tree) {
        const prefixed = `${repoFolder}/${item.path}`;
        if (item.type === 'tree') { if (!S.explicitFolders.includes(prefixed)) S.explicitFolders.push(prefixed); continue; }
        if (conflicts.some(c => `${repoFolder}/${c.path}` === prefixed) && !overwrite) { loaded++; continue; }
        const rawUrl = `https://raw.githubusercontent.com/${repoInput}/${branch}/${item.path}`;
        if (/\.(png|jpe?g|gif|webp|pdf|mp3|wav|ogg|mp4|webm)$/i.test(item.path)) {
          let subtype = 'image';
          if (/\.(mp3|wav|ogg)$/i.test(item.path))  subtype = 'audio';
          if (/\.(mp4|webm)$/i.test(item.path))     subtype = 'video';
          if (/\.pdf$/i.test(item.path))             subtype = 'pdf';
          S.fileSystem[prefixed] = { type: 'asset', subtype, src: rawUrl, content: null, modified: false, ghUrl: rawUrl };
        } else if (/\.svg$/i.test(item.path)) {
          S.fileSystem[prefixed] = { type: 'asset', subtype: 'svg', content: null, modified: false, ghUrl: rawUrl };
        } else {
          let type = 'html';
          if (/\.(js|jsx)$/i.test(item.path)) type = 'js';
          else if (/\.css$/i.test(item.path)) type = 'css';
          else if (/\.(json|md|txt)$/i.test(item.path)) type = 'text';
          S.fileSystem[prefixed] = { type, content: null, modified: false, ghUrl: rawUrl };
        }
        loaded++;
        if (bar) bar.style.width = `${40 + (loaded / Math.max(fileItems.length, 1)) * 50}%`;
      }

      S._callbacks.renderSidebar?.();
      const first = Object.keys(S.fileSystem).find(f => f.startsWith(repoFolder + '/') && f.endsWith('index.html'))
        || Object.keys(S.fileSystem).find(f => f.startsWith(repoFolder + '/'));
      if (first && !S.activeFile) await S._callbacks.switchFile?.(first);
      S.deletedFiles  = [];
      S.unsavedChanges= true;
      if (bar) { bar.style.width = '100%'; setTimeout(() => { bar.style.opacity = '0'; setTimeout(() => (bar.style.width = '0%'), 300); }, 500); }
    } catch (e) {
      if (bar) { bar.style.opacity = '0'; setTimeout(() => (bar.style.width = '0%'), 300); }
      await customAlert('GitHub Import Failed: ' + e.message, 'Error');
    }
  }, 250);
}

// ─── Commit modal ─────────────────────────────────────────────────────────────
export function openGithubCommitModal() {
  if (!S.importedRepoFolders.length) { customAlert('Import a GitHub repository first.', 'Not Connected'); return; }
  if (!S.githubToken)                { openGithubAuth(); return; }

  const select = document.getElementById('commit-repo-select');
  if (select) {
    select.innerHTML = '';
    S.importedRepoFolders.forEach(folder => {
      const conf = S.githubRepos[folder];
      if (conf) { const opt = document.createElement('option'); opt.value = folder; opt.innerText = `${folder} (${conf.branch})`; select.appendChild(opt); }
    });
    if (S.activeFile) {
      const af = S.activeFile.split('/')[0];
      if (S.importedRepoFolders.includes(af)) select.value = af;
    }
  }
  const titleInput = document.getElementById('commit-title-input');
  const descInput  = document.getElementById('commit-desc-input');
  if (titleInput) titleInput.value = '';
  if (descInput)  descInput.value  = '';

  const overlay = document.getElementById('commit-modal-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  setTimeout(() => { overlay.classList.add('open'); document.getElementById('commit-title-input')?.focus(); }, 10);
}

export function closeCommitModal() {
  const overlay = document.getElementById('commit-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => (overlay.style.display = 'none'), 200);
}

// ─── Execute commit ───────────────────────────────────────────────────────────
export async function executeGithubCommit() {
  await syncDocsToContent();
  const folder    = document.getElementById('commit-repo-select')?.value;
  const repoConf  = S.githubRepos[folder];
  if (!repoConf) { await customAlert('Repository configuration missing.', 'Error'); return; }

  const title  = document.getElementById('commit-title-input')?.value.trim();
  const desc   = document.getElementById('commit-desc-input')?.value.trim();
  if (!title)  { await customAlert('Enter a commit message.', 'Required'); return; }

  const message = desc ? `${title}\n\n${desc}` : title;
  const btn     = document.getElementById('commit-confirm-btn');
  if (btn) { btn.innerText = 'Committing…'; btn.disabled = true; }

  try {
    const { repo, branch } = repoConf;
    const refData   = await ghApi(`/repos/${repo}/git/ref/heads/${branch}`);
    const latestSHA = refData.object.sha;

    const treeItems = [];
    for (const [path, file] of Object.entries(S.fileSystem)) {
      if (!path.startsWith(folder + '/')) continue;
      const repoPath = path.slice(folder.length + 1);
      if (!file.modified && file.modified !== undefined) continue;
      if (file.type !== 'asset' || file.subtype === 'svg') {
        if (file.content !== null) treeItems.push({ path: repoPath, mode: '100644', type: 'blob', content: String(file.content) });
      } else if (file.src) {
        const b64 = file.src.split(',')[1];
        if (b64) {
          if (btn) btn.innerText = 'Uploading…';
          const blobRes = await ghApi(`/repos/${repo}/git/blobs`, 'POST', { content: b64, encoding: 'base64' });
          treeItems.push({ path: repoPath, mode: '100644', type: 'blob', sha: blobRes.sha });
        }
      }
    }
    for (const path of S.deletedFiles) {
      if (!path.startsWith(folder + '/')) continue;
      treeItems.push({ path: path.slice(folder.length + 1), mode: '100644', type: 'blob', sha: null });
    }
    if (!treeItems.length) { closeCommitModal(); if (btn) { btn.innerText = 'Commit'; btn.disabled = false; } await customAlert('No unsaved changes to commit.', 'Up to date'); return; }

    if (btn) btn.innerText = 'Committing…';
    const newTree   = await ghApi(`/repos/${repo}/git/trees`,   'POST', { base_tree: latestSHA, tree: treeItems });
    const newCommit = await ghApi(`/repos/${repo}/git/commits`, 'POST', { message, tree: newTree.sha, parents: [latestSHA] });
    await ghApi(`/repos/${repo}/git/refs/heads/${branch}`, 'PATCH', { sha: newCommit.sha });

    clearModifiedFlags();
    closeCommitModal();
    if (btn) { btn.innerText = 'Commit'; btn.disabled = false; }
    await customAlert('Successfully committed to GitHub!', 'Success');
  } catch (e) {
    if (btn) { btn.innerText = 'Commit'; btn.disabled = false; }
    await customAlert('Commit failed: ' + e.message, 'GitHub API Error');
  }
}
