// ── Delivery and read receipts (1:1 and groups) ─────────────────────────────────────────────────
// Receivers tell the author a message was delivered and, when the chat is open and visible, read.
// In a group each receipt names who it came from, so the author can see exactly who has read it:
//   m.delivered = { who: name }   m.readBy = { who: name }      (who = 'peer' in 1:1, 'a:<author id>' in groups)
// Ticks on my message: 1 sent · 2 delivered to someone · 3 read by everyone currently connected.
// "Send read receipts" in Settings switches the read part off (messages are still marked read locally).
import { S, getAid } from './state.js';
import { DB } from './db.js';
import { safeSend } from './sessions.js';
import { updateTicksDOM } from './text-format.js';

const str = (v, max) => String(v ?? '').slice(0, max);

export function whoKey(sess, data) {
	if (!sess.isGroup) return 'peer';
	const a = str(data.aid, 80); return a ? 'a:' + a : null;
}

export function sendDelivered(sess, id) {
	safeSend(sess, { type: 'msg-delivered', msgId: id, aid: getAid(), name: S.displayName });
}

// Marks the open chat's unread incoming messages as read (and tells the senders when allowed)
export function markActiveRead(sess) {
	if (!sess || S.activeId !== sess.id || document.hidden) return;
	const unread = sess.messages.filter(m => !m.mine && m.type === 'text' && !m.deleted && m.ticks === 0);
	if (!unread.length) return;
	for (const m of unread) { m.ticks = 3; DB.saveMessage(m); }
	if (S.readReceipts && sess.connected) safeSend(sess, { type: 'msg-read', msgIds: unread.map(m => m.id), aid: getAid(), name: S.displayName });
}

function recompute(sess, m) {
	const delivered = Object.keys(m.delivered || {}).length, read = Object.keys(m.readBy || {}).length;
	const need = Math.max(1, sess.isGroup ? sess.peers.size : 1);
	let t = 1;
	if (read >= need) t = 3; else if (delivered || read) t = 2;
	if (t > (m.ticks || 1)) { m.ticks = t; updateTicksDOM(m.id, t); }
}

export function onReceipt(sess, data, peerId, kind) {
	if (sess.isGroup && data.aid && data.aid === getAid()) return;
	const who = whoKey(sess, data); if (!who) return;
	const name = str(data.name, 40) || sess.peers.get(peerId)?.name || 'Peer';
	const ids = kind === 'read' ? (Array.isArray(data.msgIds) ? data.msgIds.slice(0, 200) : []) : [data.msgId];
	for (const id of ids) {
		const m = typeof id === 'string' ? sess.messages.find(x => x.id === id && x.mine) : null; if (!m) continue;
		m.delivered = m.delivered || {}; m.delivered[who] = name;
		if (kind === 'read') { m.readBy = m.readBy || {}; m.readBy[who] = name; }
		recompute(sess, m); DB.saveMessage(m);
	}
}

// Names for the "Seen by" list
export function seenBy(m) {
	const read = Object.values(m.readBy || {}), readKeys = new Set(Object.keys(m.readBy || {}));
	const delivered = Object.entries(m.delivered || {}).filter(([k]) => !readKeys.has(k)).map(([, n]) => n);
	return { read, delivered };
}
