// ── Message features: reactions, replies, edit / delete for everyone, polls ──────────────────────
// Every message carries one id that both sides share (the sender makes it), so a reaction, reply, edit,
// delete or poll vote can point at "the same message" on every device. Everything travels over the chat's
// existing P2P channel:
//   chat        { id, aid, text, reply? }          msg-react  { id, key, on, aid, name }
//   msg-edit    { id, text, encrypted, aid }       msg-delete { id, aid }
//   poll        { id, aid, q, o[], multi }         poll-vote  { id, sel[], aid, name }      poll-close { id, aid }
// `aid` is the sender's stable author id (Chat ID once signed in). Peers may react and vote on anything,
// but can only edit, delete or close what they authored: in 1:1 chats that is every message that is not mine,
// in groups the message's stored aid has to match.
import { S, uid, getAid, cleanId } from './state.js';
import { DB } from './db.js';
import { Crypt } from './crypto.js';
import { el, escH, toast, fmtTime } from './utils.js';
import { iconSvg } from './icons.js';
import { formatText } from './text-format.js';
import { safeSend } from './sessions.js';
import { renderMsgItem, renderChatList, addBubble } from './chat-render.js';
import { notifyMessage } from './notify.js';

export const REACTIONS = [['like', 'Like'], ['heart', 'Love'], ['smile', 'Haha'], ['bolt', 'Wow'], ['frown', 'Sad'], ['check', 'Agree']];
const REACT_KEYS = new Set(REACTIONS.map(r => r[0]));
export const hooks = { composeChanged() {} };   // msg-ui.js redraws the reply/edit bar from here

const str = (v, max) => String(v ?? '').slice(0, max);
export const newId = () => 'msg_' + Date.now() + '_' + uid();
export const findMsg = (sess, id) => (id ? sess.messages.find(m => m.id === id) : null);
const persist = m => DB.saveMessage(m);
const sel = id => `[data-msg-id="${String(id).replace(/"/g, '')}"]`;

// ── Text shown in quotes, the chat list and replies ─────────────────────────────────────────────
export function previewText(m) {
	if (m.deleted) return 'Message deleted';
	if (m.type === 'poll') return 'Poll: ' + (m.poll?.q || '');
	if (m.type === 'file') return m.file?.name || m.content || 'File';
	return m.content || '';
}

function touchLast(sess, m) {
	const last = [...sess.messages].reverse().find(x => x.type !== 'system');
	if (last !== m) return;
	sess.lastMessage = previewText(m).slice(0, 60);
	DB.updateSession(sess.id, { lastMessage: sess.lastMessage });
	renderChatList();
}

// ── Rendering ───────────────────────────────────────────────────────────────────────────────────
function quoteHtml(r, sess) {
	const orig = findMsg(sess, r.id);
	const sender = orig ? orig.sender : r.sender;
	const text = orig ? previewText(orig) : (r.text || 'Message');
	return `<div class="msg-quote" data-reply-id="${escH(r.id)}"><div class="mq-name">${escH(sender || '')}</div><div class="mq-text">${escH(str(text, 140))}</div></div>`;
}

// Inner HTML of a text bubble (quote + formatted text + "edited")
export function bubbleHtml(m) {
	const sess = S.sessions.get(m.sessionId);
	const q = m.reply && sess ? quoteHtml(m.reply, sess) : '';
	return q + formatText(m.content) + (m.edited ? ' <span class="msg-edited">edited</span>' : '');
}

function pollBodyHtml(m) {
	const p = m.poll, votes = m.votes || {}, all = Object.values(votes).filter(v => v.sel?.length);
	const mine = votes.me?.sel || [];
	const rows = p.options.map((o, i) => {
		const vs = all.filter(v => v.sel.includes(i));
		const pct = all.length ? Math.round(100 * vs.length / all.length) : 0;
		const picked = mine.includes(i);
		return `<button type="button" class="poll-opt${picked ? ' sel' : ''}" data-poll-opt="${i}"${p.closed ? ' disabled' : ''}>`
			+ `<span class="po-fill" style="width:${pct}%"></span><span class="po-mark">${picked ? iconSvg('check', .9) : ''}</span>`
			+ `<span class="po-text">${escH(o)}</span><span class="po-count">${vs.length}</span></button>`
			+ (vs.length ? `<div class="po-voters">${escH(vs.map(v => v.name).join(', '))}</div>` : '');
	}).join('');
	const sub = `${p.multi ? 'Select all that apply' : 'Select one'} · ${all.length} voted${p.closed ? ' · Closed' : ''}`;
	const close = m.mine && !p.closed ? `<button type="button" class="poll-close" data-poll-close>Close poll</button>` : '';
	return `<div class="poll-head">${iconSvg('poll', 1)}<span class="poll-q">${escH(p.q)}</span></div><div class="poll-sub">${sub}</div>${rows}${close}`;
}

// Polls and deleted messages (any type) are drawn here; returns false for everything else
export function renderFeatureItem(container, m) {
	if (m.type !== 'poll' && !m.deleted) return false;
	if (m.type === 'poll' && !m.poll && !m.deleted) return false;
	const d = document.createElement('div'); d.className = `msg ${m.mine ? 'mine' : 'theirs'}`; d.dataset.msgId = m.id;
	const enc = m.enc && !m.deleted ? `<span class="enc-badge">${iconSvg('lock', .9)} enc</span>` : '';
	const body = m.deleted ? `<span class="msg-deleted">${iconSvg('trash', .95)} This message was deleted</span>` : pollBodyHtml(m);
	d.innerHTML = `<div class="msg-meta">${escH(m.sender)} · ${fmtTime(m.timestamp)}${enc}</div><div class="msg-bubble${m.deleted ? ' deleted' : ' poll-bubble'}">${body}</div>`;
	container.appendChild(d);
	if (!m.deleted) decorate(d, m);
	return true;
}

// Reaction chips under a bubble
export function decorate(d, m) {
	d.querySelector(':scope > .msg-reacts')?.remove();
	const r = m.reactions; if (!r || m.deleted) return;
	const keys = REACTIONS.map(x => x[0]).filter(k => r[k] && Object.keys(r[k]).length);
	if (!keys.length) return;
	const strip = document.createElement('div'); strip.className = 'msg-reacts';
	strip.innerHTML = keys.map(k => {
		const who = r[k];
		return `<button type="button" class="react-chip${who.me !== undefined ? ' me' : ''}" data-react="${k}" title="${escH(Object.values(who).join(', '))}">${iconSvg(k, .95)}<span>${Object.keys(who).length}</span></button>`;
	}).join('');
	(d.querySelector(':scope > .msg-bubble') || d.lastElementChild).after(strip);
}

export function decorateLast(container, m) {
	const e = container.lastElementChild;
	if (e && e.dataset?.msgId === m.id) decorate(e, m);
}

// Redraw one message in place (after an edit, delete, vote …)
export function rerender(sess, m) {
	if (S.activeId !== sess.id) return;
	const c = el('messages'); const old = c?.querySelector(sel(m.id)); if (!old) return;
	const tmp = document.createElement('div'); renderMsgItem(tmp, m);
	const nu = tmp.firstElementChild; if (nu) old.replaceWith(nu);
}

function pushMsg(sess, m, preview) {
	sess.messages.push(m); sess.lastMessage = str(preview, 60); sess.lastActivity = m.timestamp;
	persist(m); DB.updateSession(sess.id, { lastMessage: sess.lastMessage, lastActivity: sess.lastActivity });
	if (!m.mine && S.activeId !== sess.id) sess.unread++;
	if (!m.mine) notifyMessage(sess, m);
	if (S.activeId === sess.id) { const c = el('messages'); if (c) { renderMsgItem(c, m); c.scrollTop = c.scrollHeight; } }
	renderChatList();
}

// ── Authorisation ───────────────────────────────────────────────────────────────────────────────
function authorOk(sess, m, data) {
	if (!m || m.mine) return false;                 // a peer can never touch what I wrote
	if (!sess.isGroup) return true;                 // 1:1: the only other person is the author
	return !!m.aid && m.aid === data.aid;
}
// Key a remote person is stored under in reactions / votes ('me' is always this device's user)
function whoKey(sess, data) {
	if (!sess.isGroup) return 'peer';
	const a = str(data.aid, 80); return a ? 'a:' + a : null;
}

// ── Compose state (reply / edit) ────────────────────────────────────────────────────────────────
export function setCompose(sess, mode, m) {
	S.compose = { mode, sessId: sess.id, id: m.id, sender: m.sender, text: str(previewText(m), 140) };
	const inp = el('msgInput');
	if (mode === 'edit' && inp) { inp.value = m.content; inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'; }
	inp?.focus();
	hooks.composeChanged();
}
export function clearCompose() {
	const wasEdit = S.compose?.mode === 'edit';
	S.compose = null;
	if (wasEdit) { const inp = el('msgInput'); if (inp) { inp.value = ''; inp.style.height = 'auto'; } }
	hooks.composeChanged();
}

// ── Sending text (normal, reply, edit) ──────────────────────────────────────────────────────────
// Returns true when something was sent
export async function sendComposed(sess, text) {
	const c = S.compose && S.compose.sessId === sess.id ? S.compose : null;
	if (c?.mode === 'edit') { const ok = await submitEdit(sess, c.id, text); if (ok) clearCompose(); return ok; }
	let payload = text, enc = false;
	if (S.encEnabled && Crypt.key) { payload = await Crypt.encText(text); enc = true; }
	const id = newId(), aid = getAid();
	const wire = { type: 'chat', id, aid, text: payload, encrypted: enc, displayName: S.displayName };
	let reply;
	if (c?.mode === 'reply') {
		reply = { id: c.id, sender: c.sender, text: c.text };
		wire.reply = { id: c.id, sender: c.sender, text: enc ? '' : c.text };   // encrypted chats don't leak the quoted text
	}
	safeSend(sess, wire);
	addBubble(sess, text, S.displayName, true, enc, { id, aid, reply });
	if (c) clearCompose();
	return true;
}

// ── Edit / delete ───────────────────────────────────────────────────────────────────────────────
async function submitEdit(sess, id, text) {
	const m = findMsg(sess, id);
	if (!m || !m.mine || m.deleted || m.type !== 'text') { toast('That message can no longer be edited'); return false; }
	if (text === m.content) return true;
	if (!sess.connected) { toast('Not connected'); return false; }
	let payload = text, enc = false;
	if (m.enc) {
		if (!Crypt.key) { toast('Set your encryption password in Settings first'); return false; }
		payload = await Crypt.encText(text); enc = true;
	}
	safeSend(sess, { type: 'msg-edit', id, text: payload, encrypted: enc, aid: getAid() });
	m.content = text; m.edited = Date.now(); persist(m); rerender(sess, m); touchLast(sess, m);
	return true;
}

function tombstone(sess, m) {
	if (m.file?.blobUrl) { try { URL.revokeObjectURL(m.file.blobUrl); } catch {} }
	const keep = new Set(['id', 'sessionId', 'type', 'sender', 'mine', 'timestamp', 'enc', 'aid', 'ticks']);
	for (const k of Object.keys(m)) if (!keep.has(k)) delete m[k];
	m.deleted = Date.now(); m.content = '';
	persist(m); rerender(sess, m); touchLast(sess, m);
}

export function deleteForEveryone(sess, m) {
	if (!m.mine || m.deleted) return;
	if (!sess.connected) { toast('Not connected'); return; }
	safeSend(sess, { type: 'msg-delete', id: m.id, aid: getAid() });
	tombstone(sess, m);
}

export function deleteForMe(sess, m) {
	const i = sess.messages.indexOf(m); if (i >= 0) sess.messages.splice(i, 1);
	if (m.file?.blobUrl) { try { URL.revokeObjectURL(m.file.blobUrl); } catch {} }
	DB.deleteMessage(m);
	document.querySelector(sel(m.id))?.remove();
	if (S.compose?.id === m.id) clearCompose();
	const last = [...sess.messages].reverse().find(x => x.type !== 'system');
	sess.lastMessage = last ? str(previewText(last), 60) : null; DB.updateSession(sess.id, { lastMessage: sess.lastMessage });
	renderChatList();
}

// ── Reactions ───────────────────────────────────────────────────────────────────────────────────
function setReaction(m, key, who, name, on) {
	m.reactions = m.reactions || {};
	const r = m.reactions[key] = m.reactions[key] || {};
	if (on) r[who] = name; else delete r[who];
	if (!Object.keys(r).length) delete m.reactions[key];
	if (!Object.keys(m.reactions).length) delete m.reactions;
}

export function toggleReaction(sess, m, key) {
	if (!REACT_KEYS.has(key) || m.deleted) return;
	if (!sess.connected) { toast('Not connected'); return; }
	const on = m.reactions?.[key]?.me === undefined;
	setReaction(m, key, 'me', S.displayName, on);
	persist(m);
	const d = document.querySelector(sel(m.id)); if (d) decorate(d, m);
	safeSend(sess, { type: 'msg-react', id: m.id, key, on, aid: getAid(), name: S.displayName });
}

// ── Polls ───────────────────────────────────────────────────────────────────────────────────────
export async function createPoll(sess, { q, options, multi }) {
	q = str(q, 200).trim(); options = options.map(o => str(o, 80).trim()).filter(Boolean).slice(0, 10);
	if (!q || options.length < 2) return false;
	if (!sess.connected) { toast('Not connected'); return false; }
	const id = newId(), aid = getAid(), enc = !!(S.encEnabled && Crypt.key);
	const wire = { type: 'poll', id, aid, multi: !!multi, displayName: S.displayName };
	if (enc) { wire.enc = true; wire.data = await Crypt.encText(JSON.stringify({ q, o: options })); } else { wire.q = q; wire.o = options; }
	safeSend(sess, wire);
	pushMsg(sess, { id, sessionId: sess.id, type: 'poll', content: 'Poll: ' + q, sender: S.displayName, mine: true, timestamp: Date.now(), enc, aid, poll: { q, options, multi: !!multi, closed: false }, votes: {} }, 'Poll: ' + q);
	return true;
}

function setVote(m, who, name, picks) {
	m.votes = m.votes || {};
	if (picks.length) m.votes[who] = { name, sel: picks }; else delete m.votes[who];
}

export function votePoll(sess, m, idx) {
	if (m.type !== 'poll' || !m.poll || m.deleted) return;
	if (m.poll.closed) { toast('This poll is closed'); return; }
	if (!sess.connected) { toast('Not connected'); return; }
	let picks = (m.votes?.me?.sel || []).slice();
	if (m.poll.multi) picks = picks.includes(idx) ? picks.filter(x => x !== idx) : [...picks, idx].sort((a, b) => a - b);
	else picks = picks.includes(idx) ? [] : [idx];
	setVote(m, 'me', S.displayName, picks); persist(m); rerender(sess, m);
	safeSend(sess, { type: 'poll-vote', id: m.id, sel: picks, aid: getAid(), name: S.displayName });
}

export function closePoll(sess, m) {
	if (m.type !== 'poll' || !m.mine || m.poll?.closed || m.deleted) return;
	if (!sess.connected) { toast('Not connected'); return; }
	m.poll.closed = true; persist(m); rerender(sess, m);
	safeSend(sess, { type: 'poll-close', id: m.id, aid: getAid() });
}

// ── Incoming ────────────────────────────────────────────────────────────────────────────────────
// Sanitised extras of an incoming chat message; null means "already have it" (duplicate id)
export function chatExtra(sess, data) {
	const extra = {}, id = cleanId(data.id);
	if (id) { if (findMsg(sess, id)) return null; extra.id = id; }
	if (data.aid) extra.aid = str(data.aid, 80);
	const r = data.reply;
	if (r && typeof r === 'object' && cleanId(r.id)) extra.reply = { id: r.id, sender: str(r.sender, 40), text: str(r.text, 140) };
	return extra;
}

async function onPoll(sess, data) {
	const id = cleanId(data.id); if (!id || findMsg(sess, id)) return;
	const sender = str(data.displayName, 40) || 'Peer';
	let q = data.q, opts = data.o;
	if (data.enc) {
		let j = null;
		if (Crypt.key) { try { j = JSON.parse(await Crypt.decText(str(data.data, 20000))); } catch {} }
		if (!j) { pushMsg(sess, { id, sessionId: sess.id, type: 'text', content: '[Encrypted poll — set the same password in Settings]', sender, mine: false, timestamp: Date.now(), enc: false, ticks: 0, aid: str(data.aid, 80) }, 'Encrypted poll'); return; }
		q = j.q; opts = j.o;
	}
	q = str(q, 200).trim(); opts = (Array.isArray(opts) ? opts : []).slice(0, 10).map(o => str(o, 80).trim()).filter(Boolean);
	if (!q || opts.length < 2) return;
	pushMsg(sess, { id, sessionId: sess.id, type: 'poll', content: 'Poll: ' + q, sender, mine: false, timestamp: Date.now(), enc: !!data.enc, aid: str(data.aid, 80), poll: { q, options: opts, multi: !!data.multi, closed: false }, votes: {} }, 'Poll: ' + q);
}

export async function handleFeatureMsg(sess, data, peerId) {
	if (sess.isGroup && data.aid && data.aid === getAid()) return;   // our own message coming back
	if (data.type === 'poll') return onPoll(sess, data);
	const m = findMsg(sess, cleanId(data.id)); if (!m) return;
	const name = str(data.name, 40) || sess.peers.get(peerId)?.name || 'Peer';
	switch (data.type) {
		case 'msg-react': {
			const who = whoKey(sess, data); if (!who || !REACT_KEYS.has(data.key) || m.deleted) return;
			setReaction(m, data.key, who, name, !!data.on); persist(m);
			const d = document.querySelector(sel(m.id)); if (d) decorate(d, m);
			break;
		}
		case 'msg-edit': {
			if (!authorOk(sess, m, data) || m.deleted || m.type !== 'text') return;
			let txt = data.text;
			if (data.encrypted) { if (!Crypt.key) return; try { txt = await Crypt.decText(str(txt, 60000)); } catch { return; } }
			if (typeof txt !== 'string') return;
			m.content = txt.slice(0, 20000); m.edited = Date.now(); persist(m); rerender(sess, m); touchLast(sess, m);
			break;
		}
		case 'msg-delete':
			if (!authorOk(sess, m, data) || m.deleted) return;
			tombstone(sess, m);
			break;
		case 'poll-vote': {
			const who = whoKey(sess, data);
			if (!who || m.type !== 'poll' || !m.poll || m.deleted || m.poll.closed) return;
			const n = m.poll.options.length;
			let picks = [...new Set((Array.isArray(data.sel) ? data.sel : []).filter(i => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b);
			if (!m.poll.multi) picks = picks.slice(0, 1);
			setVote(m, who, name, picks); persist(m); rerender(sess, m);
			break;
		}
		case 'poll-close':
			if (m.type !== 'poll' || !m.poll || !authorOk(sess, m, data)) return;
			m.poll.closed = true; persist(m); rerender(sess, m);
			break;
	}
}
