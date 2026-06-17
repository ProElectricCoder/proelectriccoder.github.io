import { CHUNK_SIZE } from './constants.js';
import { S, uid } from './state.js';
import { DB } from './db.js';
import { el, escH, fmtTime, toast, sleep, bufB64, b64Buf } from './utils.js';
import { gzip, gunzip } from './compress.js';
import { Crypt } from './crypto.js';
import { buildFileCard, loadLazy, getBatchSiblings } from './file-preview.js';
import { getActiveSess, peerName, safeSend } from './sessions.js';
import { renderChatList, addSysMsg } from './chat-render.js';

export async function sendFile(file, sess, batchId) {
	if (!sess) sess = getActiveSess();
	if (!sess?.connected) { toast('Not connected'); return; }
	if (file.size > 500 * 1024 * 1024) { toast('Max 500 MB per file'); return; }
	const xferId = 'ft_' + Date.now() + '_' + uid(), isEnc = S.encEnabled && !!Crypt.key;
	const localUrl = URL.createObjectURL(file);
	const meta = { name: file.name, size: file.size, mime: file.type || 'application/octet-stream' };
	const msgId = addSendingFileBubble(sess, meta, localUrl, xferId, batchId);
	try {
		let buf = await file.arrayBuffer(); buf = await gzip(buf);
		if (isEnc) buf = await Crypt.encBuf(buf);
		const b64 = bufB64(buf), nChunks = Math.ceil(b64.length / CHUNK_SIZE);
		safeSend(sess, { type: 'file-meta', id: xferId, name: file.name, origSize: file.size, compressedSize: buf.byteLength, mime: file.type || 'application/octet-stream', chunks: nChunks, encrypted: isEnc, compressed: true, batchId: batchId || null, displayName: S.displayName });
		for (let i = 0; i < nChunks; i++) {
			safeSend(sess, { type: 'file-chunk', id: xferId, index: i, data: b64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
			if (i % 4 === 0) { await sleep(0); updateXferProgress(msgId, (i + 1) / nChunks); }
		}
		safeSend(sess, { type: 'file-done', id: xferId });
		finalizeFileBubble(msgId, meta, localUrl, isEnc, sess, batchId);
	} catch (e) {
		toast('Send failed: ' + e.message);
		URL.revokeObjectURL(localUrl);
		removeFileBubble(msgId);
	}
}

export async function receiveFile(sess, id, peerId) {
	const entry = sess.inFiles.get(id); if (!entry) return;
	sess.inFiles.delete(id);
	const { meta, chunks } = entry;
	let buf = b64Buf(chunks.join(''));
	if (meta.encrypted) {
		if (!Crypt.key) { addSysMsg(sess, `⚠ Cannot decrypt ${meta.name}`); return; }
		try { buf = await Crypt.decBuf(buf); } catch { addSysMsg(sess, `⚠ Decrypt failed: ${meta.name}`); return; }
	}
	if (meta.compressed) {
		try { buf = await gunzip(buf); } catch { addSysMsg(sess, `⚠ Decompress failed: ${meta.name}`); return; }
	}
	const blob = new Blob([buf], { type: meta.mime });
	const url = URL.createObjectURL(blob);
	addFileBubble(sess, { name: meta.name, size: meta.origSize || meta.size, mime: meta.mime }, url, false, meta.encrypted, meta.batchId || null, peerId);
}

function addSendingFileBubble(sess, meta, url, xferId, batchId) {
	const msgId = 'msg_' + Date.now() + '_' + uid();
	if (S.activeId === sess.id) {
		const c = el('messages'); if (!c) return msgId;
		const d = document.createElement('div'); d.className = 'msg mine'; d.dataset.msgId = msgId;
		d.innerHTML = `<div class="msg-meta">${escH(S.displayName)} · ${fmtTime(Date.now())}</div><div class="msg-bubble fp-bubble">${buildFileCard(meta, url, true, 0)}</div>`;
		c.appendChild(d); c.scrollTop = c.scrollHeight; loadLazy(d);
	}
	return msgId;
}

function updateXferProgress(msgId, pct) {
	const d = document.querySelector(`[data-msg-id="${msgId}"]`); if (!d) return;
	const bar = d.querySelector('.fp-bar-fill'); if (bar) bar.style.width = (pct * 100).toFixed(0) + '%';
	const pctEl = d.querySelector('.fp-pct'); if (pctEl) pctEl.textContent = Math.round(pct * 100) + '%';
}

function finalizeFileBubble(msgId, meta, url, enc, sess, batchId) {
	const d = document.querySelector(`[data-msg-id="${msgId}"]`);
	if (d) {
		const bub = d.querySelector('.msg-bubble');
		if (bub) { bub.innerHTML = buildFileCard(meta, url, false, 0, getBatchSiblings(sess, batchId, msgId)); loadLazy(bub); }
	}
	const m = { id: msgId, sessionId: sess.id, type: 'file', content: meta.name, sender: S.displayName, mine: true, timestamp: Date.now(), enc, file: { name: meta.name, size: meta.size, mime: meta.mime, blobUrl: url, batchId: batchId || null } };
	sess.messages.push(m); sess.lastMessage = '📎 ' + meta.name; sess.lastActivity = m.timestamp;
	DB.saveMessage(m); DB.updateSession(sess.id, { lastMessage: sess.lastMessage, lastActivity: sess.lastActivity });
	renderChatList();
}

function removeFileBubble(msgId) { document.querySelector(`[data-msg-id="${msgId}"]`)?.remove(); }

function addFileBubble(sess, meta, url, mine, enc, batchId, peerId) {
	const sender = mine ? S.displayName : peerName(sess, peerId || 'remote');
	const m = { id: 'file_' + Date.now() + '_' + uid(), sessionId: sess.id, type: 'file', content: meta.name, sender, mine, timestamp: Date.now(), enc, file: { name: meta.name, size: meta.size, mime: meta.mime, blobUrl: url, batchId: batchId || null } };
	sess.messages.push(m); sess.lastMessage = '📎 ' + meta.name; sess.lastActivity = m.timestamp;
	DB.saveMessage(m); DB.updateSession(sess.id, { lastMessage: sess.lastMessage, lastActivity: sess.lastActivity });
	if (!mine && S.activeId !== sess.id) sess.unread++;
	if (S.activeId === sess.id) {
		const c = el('messages'); if (!c) { renderChatList(); return; }
		const batchSiblings = getBatchSiblings(sess, batchId, m.id);
		const d = document.createElement('div'); d.className = `msg ${mine ? 'mine' : 'theirs'}`; d.dataset.msgId = m.id;
		d.innerHTML = `<div class="msg-meta">${escH(sender)} · ${fmtTime(m.timestamp)}${enc ? '<span class="enc-badge">🔒 enc</span>' : ''}</div><div class="msg-bubble fp-bubble">${buildFileCard(meta, url, false, 0, batchSiblings)}</div>`;
		c.appendChild(d); c.scrollTop = c.scrollHeight; loadLazy(d);
	}
	renderChatList();
}

export function renderFileBubbleFromMsg(container, m) {
	const side = m.mine ? 'mine' : 'theirs';
	const enc = m.enc ? '<span class="enc-badge">🔒 enc</span>' : '';
	const meta = m.file || { name: m.content, size: 0, mime: 'application/octet-stream' };
	const url = meta.blobUrl || meta.dataUrl || null;
	const batchFiles = [];
	if (meta.batchId && m.sessionId) {
		const sess = S.sessions.get(m.sessionId);
		if (sess) batchFiles.push(...getBatchSiblings(sess, meta.batchId, m.id));
	}
	const d = document.createElement('div'); d.className = `msg ${side}`; d.dataset.msgId = m.id;
	d.innerHTML = `<div class="msg-meta">${escH(m.sender)} · ${fmtTime(m.timestamp)}${enc}</div><div class="msg-bubble fp-bubble">${buildFileCard(meta, url, false, 0, batchFiles)}</div>`;
	container.appendChild(d); loadLazy(d);
}
