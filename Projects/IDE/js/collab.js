/**
 * collab.js — Real-time collaborative editing for DeepBlue IDE.
 *
 * Stack:
 *   - Yjs (CRDT document model) — one shared Y.Doc per session, one Y.Text
 *     per collaboratively-open file, keyed by full virtual path.
 *   - y-codemirror.next — binds a Y.Text + Awareness straight into a CM6
 *     EditorState (live co-editing, remote cursors/selections, collab-aware
 *     undo/redo). See js/editor.js's switchFile()/refreshActiveFileForCollab().
 *   - CloudflareWSEngine (Projects/Chat/engine.js, used UNMODIFIED) as the
 *     WebRTC signalling + relay transport. Yjs sync + awareness messages are
 *     just opaque binary payloads to it.
 *   - Firebase Auth (same "proelectriccoder" project already used for
 *     GitHub sign-in) to mint the ID token the /api/ChatRooms Durable Object
 *     verifies, and to derive a stable name/photo/color identity.
 *
 * ── Module boundary (breaks the editor.js <-> collab.js circular import) ──
 * editor.js cannot import this file directly (this file imports FROM
 * editor.js), so it asks for collab bindings indirectly via
 * S._callbacks.getCollabBinding(filename) — wired up in main.js, exactly
 * like every other cross-module callback in this codebase. This file is
 * free to import editor.js's refreshActiveFileForCollab() directly since that
 * direction has no cycle.
 *
 * ── Scope / known limitations (by design, not oversights) ─────────────────
 *  1. This syncs file CONTENT for files that get opened during a session,
 *     not the virtual file tree itself. Creating/renaming/deleting files
 *     locally does not (yet) propagate to other participants — only text
 *     edits inside a shared file do. A Y.Map keyed by filename
 *     (`ydoc.getMap('files')`) tracks which filenames are "claimed" into the
 *     session; see getCollabBinding() below for exactly how that's used to
 *     avoid a nasty edge case (two people with same-named-but-different
 *     local files stomping each other the instant a guest opens, say,
 *     "index.html" before sync has finished).
 *  2. Topology is a star (host relays between guests), not a full mesh —
 *     that's what CloudflareWSEngine actually implements. If the host
 *     leaves, remaining guests lose their only path to each other. Guests
 *     get notified and the session is cleanly torn down locally when that
 *     happens (see onHostLost below); they'd need to start a fresh session
 *     to keep collaborating.
 *  3. Joining replaces the local view of any file that's already part of
 *     the session with the session's shared content — that's the whole
 *     point of joining a live session, but the UI confirms before doing it.
 */

import { S } from './state.js';
import { customAlert, customConfirm, customPrompt, showCustomDialog } from './dialogs.js';
import { isGdriveConnected } from './gdrive.js';
import { initFirebase } from './github.js';
import { refreshActiveFileForCollab } from './editor.js';

// ─── Pinned CDN imports ────────────────────────────────────────────────────────
// IMPORTANT: @codemirror/state and @codemirror/view here are pinned to the
// EXACT same version strings used in js/editor.js, and y-codemirror.next /
// y-protocols are told (via esm.sh's `?deps=` override) to resolve their own
// internal copies of yjs/@codemirror/state/@codemirror/view to those same
// pinned versions too. This is not cosmetic — CodeMirror 6's Facets and
// ViewPlugins are matched by object identity, and Yjs's AbstractType classes
// are matched with `instanceof`. If esm.sh ever served a second, separate
// copy of either package to this file vs. editor.js, the yCollab extensions
// built here would silently fail to attach (or throw "Unrecognized
// extension value") when merged into editor.js's EditorState. If remote
// cursors/selections stop rendering or collaborative edits don't apply,
// this dependency-identity assumption is the first thing to check — confirm
// the version strings below still match editor.js's imports byte-for-byte.
import * as Y from 'https://esm.sh/yjs@13.6.31';
import { yCollab, yUndoManagerKeymap } from 'https://esm.sh/y-codemirror.next@0.3.5?deps=yjs@13.6.31,y-protocols@1.0.7,lib0@0.2.117,@codemirror/state@6.7.0,@codemirror/view@6.43.4';
import { keymap } from 'https://esm.sh/@codemirror/view@6.43.4';
import * as awarenessProtocol from 'https://esm.sh/y-protocols@1.0.7/awareness';
import * as syncProtocol from 'https://esm.sh/y-protocols@1.0.7/sync';
import * as encoding from 'https://esm.sh/lib0@0.2.117/encoding';
import * as decoding from 'https://esm.sh/lib0@0.2.117/decoding';

// ─── Outer transport envelope (first byte of every payload we hand the engine) ─
const MESSAGE_SYNC      = 0;
const MESSAGE_AWARENESS = 1;

// Tag applied to transactions/awareness-updates we apply because a message
// arrived over the wire, so our own 'update' listeners know NOT to re-send
// them (avoids echo loops). The engine's own relay — not this tag — is what
// actually fans messages out to other peers; this only governs what WE
// originate vs. merely receive.
const REMOTE_ORIGIN = 'deepblue-collab:remote';

const PRESENCE_PALETTE = ['#00e5ff', '#ff6b6b', '#ffd166', '#06d6a0', '#c77dff', '#ff8fab', '#7bdff2', '#f4a259'];

// ─── CloudflareWSEngine loader (same dual-path pattern as js/crypto.js's
//     loadCryptoLib() for the cross-project SEP library) ─────────────────────
let _engineLib = null;
async function loadEngineLib() {
  if (_engineLib) return _engineLib;
  try {
    _engineLib = await import('https://proelectriccoder.github.io/Projects/Chat/engine.js');
  } catch {
    // Adjust this path if DeepBlue IDE and the Chat app aren't deployed in a
    // way that makes this relative path resolve (see js/crypto.js's
    // loadCryptoLib() for the precedent this mirrors).
    _engineLib = await import('../Chat/engine.js');
  }
  return _engineLib;
}

async function buildEngine(roomId, idToken, isHost) {
  const { CloudflareWSEngine } = await loadEngineLib();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${location.host}/api/ChatRooms`;
  const engine = new CloudflareWSEngine({ relay: isHost, wsUrl });
  if (isHost) await engine.createRoom(roomId, idToken);
  else        await engine.joinRoom(roomId, idToken);
  return engine;
}

// ─── CollabSession — wraps one CloudflareWSEngine connection as a Yjs
//     sync + awareness transport ──────────────────────────────────────────────
class CollabSession {
  constructor({ engine, identity, isHost }) {
    this.engine   = engine;
    this.identity = identity;
    this.isHost   = isHost;
    this.ydoc     = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.ydoc);
    this.undoManagers = new Map(); // filename -> Y.UndoManager
    this._presenceListeners = new Set();
    this._hostLostCb = null;
    this._destroyed = false;

    this.awareness.setLocalStateField('user', {
      name: identity.name,
      color: identity.color,
      colorLight: identity.color + '33',
      provider: identity.provider,
      photo: identity.photo || null,
    });

    this.ydoc.on('update', (update, origin) => {
      if (origin === REMOTE_ORIGIN || this._destroyed) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this._send(encoder);
    });

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin === REMOTE_ORIGIN || this._destroyed) return;
      const changed = added.concat(updated).concat(removed);
      if (!changed.length) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
      this._send(encoder);
    });

    this.engine.onMessage(data => this._handleMessage(data));
    this.engine.onPeerConnected(() => this._onPeerConnected());
    this.engine.onPeerDisconnected(() => this._onPeerDisconnected());
  }

  // Hands the engine a real ArrayBuffer. CloudflareWSEngine's own _ser() only
  // treats actual ArrayBuffer/Blob instances as binary-safe — anything else
  // (including a bare Uint8Array, since typeof it is 'object') gets
  // JSON.stringify'd, which would corrupt this payload. See
  // Projects/Chat/engine.js's _ser()/_deser() and binaryType='arraybuffer'.
  _send(encoder) {
    const arr = encoding.toUint8Array(encoder);
    const buf = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
    try { this.engine.send(buf); } catch (e) { console.warn('[Collab] send failed:', e.message); }
  }

  _onPeerConnected() {
    // Both sides proactively announce on every (re)connect, per y-protocols/
    // sync's own guidance for peer-to-peer topologies ("both parties should
    // initiate the connection with SyncStep1"). The engine has no per-peer
    // unicast, so this broadcasts to everyone already connected too — a
    // little wasteful in a 3+-person session, harmless since Yjs updates are
    // idempotent.
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(syncEncoder, this.ydoc);
    this._send(syncEncoder);

    const states = this.awareness.getStates();
    if (states.size) {
      const awEncoder = encoding.createEncoder();
      encoding.writeVarUint(awEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(awEncoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(states.keys())));
      this._send(awEncoder);
    }
    this._notifyPresence();
  }

  _onPeerDisconnected() {
    this._notifyPresence();
    // Star topology: a guest's ONLY peer is the host. If that connection
    // drops, the guest has no path to anyone else either.
    if (!this.isHost && this.engine.peers.size === 0 && !this._destroyed) {
      this._hostLostCb?.();
    }
  }

  _handleMessage(data) {
    if (!(data instanceof ArrayBuffer)) return;
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const messageType = decoding.readVarUint(decoder);
    if (messageType === MESSAGE_SYNC) {
      const replyEncoder = encoding.createEncoder();
      encoding.writeVarUint(replyEncoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, replyEncoder, this.ydoc, REMOTE_ORIGIN);
      if (encoding.length(replyEncoder) > 1) this._send(replyEncoder);
    } else if (messageType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), REMOTE_ORIGIN);
      this._notifyPresence();
    }
  }

  onPresenceChange(cb) { this._presenceListeners.add(cb); }
  _notifyPresence() { this._presenceListeners.forEach(cb => { try { cb(); } catch (e) { console.warn(e); } }); }

  onHostLost(cb) { this._hostLostCb = cb; }

  getOrCreateUndoManager(filename, ytext) {
    let um = this.undoManagers.get(filename);
    if (!um) { um = new Y.UndoManager(ytext); this.undoManagers.set(filename, um); }
    return um;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    // awareness.destroy() internally calls setLocalState(null), which fires
    // our own 'update' listener (origin 'local', not REMOTE_ORIGIN) one last
    // time — broadcasting our departure — BEFORE we tear the engine down.
    try { this.awareness.destroy(); } catch {}
    this.undoManagers.forEach(um => { try { um.destroy(); } catch {} });
    this.undoManagers.clear();
    try { this.ydoc.destroy(); } catch {}
    try { this.engine.disconnect(); } catch {}
  }
}

// ─── Identity resolution (Firebase Auth account-selection logic) ─────────────
//   1. GitHub connected (S.githubToken)            -> GitHub
//   2. else Google Drive connected (isGdriveConnected()) -> Google
//   3. (GitHub wins whenever both are available, per spec)
//   4. neither -> ask the person to pick one
async function resolveCollabIdentity() {
  await initFirebase();

  const githubConnected = !!S.githubToken;
  const driveConnected  = isGdriveConnected();

  let providerChoice = null;
  if (githubConnected)      providerChoice = 'github';
  else if (driveConnected)  providerChoice = 'google';

  if (!providerChoice) {
    providerChoice = await _promptProviderChoice();
    if (!providerChoice) return null; // cancelled
  }

  try {
    const fbUser  = await _signInForCollab(providerChoice);
    const idToken = await fbUser.getIdToken();
    const cached  = _loadCachedIdentity();
    const color   = (cached && cached.uid === fbUser.uid && cached.color) || _colorForUid(fbUser.uid);
    const identity = {
      uid: fbUser.uid,
      name: fbUser.displayName || (cached && cached.uid === fbUser.uid && cached.name) || (providerChoice === 'github' ? 'GitHub User' : 'Google User'),
      photo: fbUser.photoURL || null,
      provider: providerChoice,
      color,
      idToken,
    };
    _persistIdentity(identity);
    return identity;
  } catch (e) {
    await customAlert('Sign-in failed: ' + e.message, 'Collaborate');
    return null;
  }
}

function _promptProviderChoice() {
  return showCustomDialog(
    'confirm',
    'Sign in to Collaborate',
    'Choose an account for this collaboration session. Your name and a cursor colour derived from your account will be visible to everyone else in the session.',
    { okText: 'Continue with GitHub', cancelText: 'Cancel', extraText: 'Continue with Google' }
  ).then(res => (res === true ? 'github' : res === 'extra' ? 'google' : null));
}

function _waitForAuthReady() {
  return new Promise(resolve => {
    if (!S.firebaseAuth) { resolve(null); return; }
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(S.firebaseAuth.currentUser || null); } }, 2500);
    const unsub = S.firebaseAuth.onAuthStateChanged(user => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { unsub(); } catch {}
      resolve(user);
    });
  });
}

async function _signInForCollab(providerChoice) {
  const { GoogleAuthProvider, GithubAuthProvider, signInWithPopup } =
    await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');

  const current = await _waitForAuthReady();
  const wantsProviderId = providerChoice === 'github' ? 'github.com' : 'google.com';
  if (current && current.providerData.some(p => p.providerId === wantsProviderId)) {
    return current; // already signed in with the right provider — no popup needed
  }

  const provider = providerChoice === 'github' ? new GithubAuthProvider() : new GoogleAuthProvider();
  const result = await signInWithPopup(S.firebaseAuth, provider);
  return result.user;
}

function _colorForUid(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return PRESENCE_PALETTE[hash % PRESENCE_PALETTE.length];
}

function _loadCachedIdentity() {
  try { return JSON.parse(localStorage.getItem('deepBlue_collab_identity') || 'null'); } catch { return null; }
}
function _persistIdentity(identity) {
  try {
    localStorage.setItem('deepBlue_collab_identity', JSON.stringify({
      uid: identity.uid, name: identity.name, photo: identity.photo, color: identity.color, provider: identity.provider,
    }));
  } catch {}
}

// ─── Room codes / invite links ────────────────────────────────────────────────
function _generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function _extractRoomId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const fromUrl = url.searchParams.get('collab');
    if (fromUrl) return fromUrl;
  } catch { /* not a URL — fall through and treat as a raw code */ }
  return /^[A-Za-z0-9_-]{4,64}$/.test(trimmed) ? trimmed : null;
}

function _inviteLink(roomId) {
  return `${location.origin}${location.pathname}?collab=${encodeURIComponent(roomId)}`;
}

async function _shareInviteLink(roomId, title) {
  const link = _inviteLink(roomId);
  try {
    await navigator.clipboard.writeText(link);
    await customAlert(`Invite link copied to clipboard:\n${link}`, title);
  } catch {
    await customPrompt('Copy this invite link manually:', link, title);
  }
}

// ─── Public session lifecycle ─────────────────────────────────────────────────
export async function startCollabSession() {
  if (S.collab.session) { await customAlert('A collaboration session is already active. Leave it first.', 'Collaborate'); return; }

  const proceed = await customConfirm(
    'Start a live collaboration session? Anyone with the invite link will be able to view and edit files you open, in real time.',
    'Start Session'
  );
  if (!proceed) return;

  const identity = await resolveCollabIdentity();
  if (!identity) return;

  const roomId = _generateRoomId();
  let engine;
  try {
    engine = await buildEngine(roomId, identity.idToken, true);
  } catch (e) {
    await customAlert('Could not start session: ' + e.message, 'Collaborate');
    return;
  }

  const session = new CollabSession({ engine, identity, isHost: true });
  S.collab.session = session;
  S.collab.roomId  = roomId;
  S.collab.isHost  = true;

  session.onPresenceChange(_renderCollabUI);
  refreshActiveFileForCollab();
  _renderCollabUI();

  await _shareInviteLink(roomId, 'Session Started');
}

export async function joinCollabSessionPrompt() {
  const input = await customPrompt('Enter the session code or paste an invite link:', '', 'Join Collaboration Session');
  if (!input) return;
  const roomId = _extractRoomId(input);
  if (!roomId) { await customAlert("That doesn't look like a valid session code or link.", 'Join Session'); return; }
  await joinCollabSession(roomId);
}

export async function joinCollabSession(roomId) {
  if (S.collab.session) { await customAlert('Leave the current session before joining another.', 'Collaborate'); return; }

  const proceed = await customConfirm(
    "Joining will load this project's shared files from the session host, which may replace the content of any matching files you have open locally. Continue?",
    'Join Collaboration Session'
  );
  if (!proceed) return;

  const identity = await resolveCollabIdentity();
  if (!identity) return;

  let engine;
  try {
    engine = await buildEngine(roomId, identity.idToken, false);
  } catch (e) {
    await customAlert('Could not join session: ' + e.message, 'Collaborate');
    return;
  }

  const session = new CollabSession({ engine, identity, isHost: false });
  S.collab.session = session;
  S.collab.roomId  = roomId;
  S.collab.isHost  = false;

  session.onPresenceChange(_renderCollabUI);
  session.onHostLost(async () => {
    if (S.collab.session !== session) return;
    await customAlert('Lost connection to the session host.', 'Collaborate');
    await leaveCollabSession();
  });

  refreshActiveFileForCollab();
  _renderCollabUI();

  await customAlert('Joined the collaboration session.', 'Collaborate');
}

export async function leaveCollabSession() {
  if (!S.collab.session) return;
  const wasHost = S.collab.isHost;

  S.collab.session.destroy();
  S.collab.session = null;
  S.collab.roomId  = null;
  S.collab.isHost  = false;

  refreshActiveFileForCollab(); // unbinds yCollab from open tabs, keeping current text
  _renderCollabUI();

  await customAlert(wasHost ? 'Session ended.' : 'Left the session.', 'Collaborate');
}

export async function copyCollabInviteLink() {
  if (!S.collab.roomId) return;
  await _shareInviteLink(S.collab.roomId, 'Invite Link');
}

// ─── editor.js integration point (wired onto S._callbacks in main.js) ─────────
/**
 * Returns { extensions, initialContent } for a collaboratively-bound file,
 * or null if this file should just be edited locally (no active session, or
 * — for a guest — this filename hasn't been claimed into the session yet).
 *
 * `ydoc.getMap('files')` is the session's shared registry of which filenames
 * are part of it. Only the HOST may claim a new filename into that registry
 * (and seed its Y.Text from local content) — guests only ever bind to
 * filenames that are ALREADY claimed. Without that restriction, a guest
 * opening a commonly-named local file (e.g. "index.html") the instant they
 * join — before the host's content has finished syncing to them — would
 * race to seed the SAME shared Y.Text with their own, unrelated local
 * content, corrupting it for everyone. With it, guests just bind and wait
 * for sync; only the host (the one source of "what this session's files
 * actually are") ever originates content for a not-yet-seen filename.
 */
export function getCollabBinding(filename) {
  const session = S.collab.session;
  if (!session) return null;

  const filesMap = session.ydoc.getMap('files');
  if (!filesMap.has(filename)) {
    if (!session.isHost) return null;
    filesMap.set(filename, true);
    const ytext = session.ydoc.getText(filename);
    const existing = S.fileSystem[filename]?.content;
    if (typeof existing === 'string' && existing.length) ytext.insert(0, existing);
  }

  const ytext = session.ydoc.getText(filename);
  const undoManager = session.getOrCreateUndoManager(filename, ytext);
  return {
    extensions: [
      ...yCollab(ytext, session.awareness, { undoManager }),
      keymap.of(yUndoManagerKeymap),
    ],
    initialContent: ytext.toString(),
  };
}

// ─── Presence UI (badge + dropdown list) — owned entirely by this module ──────
function _renderCollabUI() {
  const badge  = document.getElementById('collab-badge');
  const list   = document.getElementById('collab-presence-list');
  const status = document.getElementById('collab-status');
  const session = S.collab.session;

  if (!session) {
    if (badge)  badge.style.display = 'none';
    if (list)   list.innerHTML = '';
    if (status) status.innerText = 'Not connected';
    return;
  }

  const others = Array.from(session.awareness.getStates().entries())
    .filter(([id]) => id !== session.awareness.clientID)
    .map(([, s]) => s.user)
    .filter(Boolean);

  if (badge) {
    if (others.length) { badge.style.display = 'flex'; badge.innerText = String(others.length); }
    else badge.style.display = 'none';
  }

  if (status) {
    status.innerText = session.isHost
      ? `Hosting · code ${S.collab.roomId}`
      : `Connected · code ${S.collab.roomId}`;
  }

  if (list) {
    const me = session.awareness.getLocalState()?.user;
    const rows = [];
    if (me) rows.push(_presenceRow(me, true));
    others.forEach(u => rows.push(_presenceRow(u, false)));
    list.innerHTML = rows.join('');
  }
}

function _presenceRow(user, isYou) {
  const name    = _escapeHtml(user.name || 'Anonymous');
  const initial = (user.name || '?').trim().charAt(0).toUpperCase();
  const avatar  = user.photo
    ? `<img src="${user.photo}" class="collab-avatar-img" alt="">`
    : `<span class="collab-avatar-fallback" style="background:${user.color}">${initial}</span>`;
  return `<div class="collab-presence-row">${avatar}<span class="collab-presence-name">${name}${isYou ? ' (you)' : ''}</span><span class="collab-presence-dot" style="background:${user.color}"></span></div>`;
}

function _escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Exposed so main.js's header-dropdown refresh logic can show/hide the
// Start/Join/Invite/Leave menu items without duplicating session state here.
export function isCollabActive() { return !!S.collab.session; }
export function isCollabHost()   { return !!S.collab.session && S.collab.isHost; }
