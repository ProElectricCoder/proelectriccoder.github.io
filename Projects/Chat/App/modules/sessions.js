import { S } from './state.js';
import { DB } from './db.js';
import { applyTheme } from './theme.js';
import { el, isMobile, closeSidebarUI } from './utils.js';
import { renderTopbar, renderMessages, renderChatList } from './chat-render.js';

export function getActiveSess() { return S.sessions.get(S.activeId) || null; }

export async function selectSess(id, closeSidebar = true) {
	const sess = S.sessions.get(id); if (!sess) return;
	if (S.activeId === id) { if (closeSidebar && isMobile()) closeSidebarUI(); return; }
	const prev = getActiveSess(); if (prev) { prev.unread = 0; renderChatList(); }
	S.activeId = id; sess.unread = 0;
	applyTheme(sess.theme, sess); renderTopbar(sess);
	await renderMessages(sess);
	el('welcomePanel').style.display = 'none';
	const cv = el('chatView'); cv.classList.remove('hidden'); cv.style.display = 'flex';
	// Send read receipts for pending messages
	if (sess.connected) {
		const unreadIds = sess.messages.filter(m => !m.mine && m.type === 'text' && m.ticks === 0).map(m => m.id);
		if (unreadIds.length) safeSend(sess, { type: 'msg-read', msgIds: unreadIds });
	}
	renderChatList();
	if (closeSidebar && isMobile()) closeSidebarUI();
}

export async function deleteSess(id) {
	const sess = S.sessions.get(id); if (!sess) return;
	sess._metaUnsub?.(); sess.engine?.disconnect();
	S.sessions.delete(id); await DB.deleteSession(id);
	if (S.activeId === id) {
		S.activeId = null;
		el('chatView').classList.add('hidden');
		el('welcomePanel').style.display = '';
		applyTheme('void', null, false);
	}
	renderChatList();
}

export function setThemeForSess(sessId, themeId) {
	const sess = S.sessions.get(sessId); if (!sess) return;
	sess.theme = themeId; DB.saveSession(sess); DB.updateSession(sessId, { theme: themeId });
	if (S.activeId === sessId) applyTheme(themeId, sess);
	renderChatList();
}

// Find or create firebase session for a given roomId (dedup)
export function findSessByRoomId(rid, isGroup = false) {
	return [...S.sessions.values()].find(s => s.roomId === rid && s.isGroup === isGroup) || null;
}

export function peerName(sess, peerId) { return sess.peers.get(peerId)?.name || 'Peer'; }

export function safeSend(sess, data) {
	if (!sess?.engine || !sess.connected) return;
	try { sess.engine.send(data); } catch (e) { console.error('[send]', e); }
}
