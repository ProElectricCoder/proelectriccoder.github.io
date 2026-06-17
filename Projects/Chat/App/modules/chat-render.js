import { S, uid } from './state.js';
import { THEMES } from './constants.js';
import { el, escH, relTime, fmtTime } from './utils.js';
import { DB } from './db.js';
import { ticksHtml, formatText } from './text-format.js';
import { renderFileBubbleFromMsg } from './file-transfer.js';
import { renderCallCardFromMsg } from './call-card.js';

export function renderChatList() {
	const container = el('chatList'); if (!container) return;
	const q = S.filterQ.toLowerCase();
	const items = [...S.sessions.values()].filter(s => !q || s.name.toLowerCase().includes(q)).sort((a, b) => b.lastActivity - a.lastActivity);
	if (!items.length) {
		container.innerHTML = `<div style="padding:24px 14px;text-align:center;font-size:.75rem;color:var(--faint)">No chats yet.<br>Use the + button to start one.</div>`;
		return;
	}
	container.innerHTML = items.map(s => {
		const th = THEMES[s.theme] || THEMES.void;
		const initials = s.name.slice(0, 2).toUpperCase();
		const isActive = s.id === S.activeId;
		const inCall = (S.callSessId === s.id || S.gcSessId === s.id);
		const dotClass = s.connected ? (inCall ? 'ci-dot call' : 'ci-dot on') : 'ci-dot';
		const unreadBadge = s.unread > 0 ? `<div class="ci-badge">${s.unread > 99 ? '99+' : s.unread}</div>` : '';
		const time = s.lastActivity ? relTime(s.lastActivity) : '';
		const type = s.isGroup ? '👥' : (s.type === 'direct' ? '⚡' : '🔗');
		let avHtml = `${initials}<div class="${dotClass}"></div>`;
		if (s.isGroup && s.groupIcon) {
			avHtml = `<img src="${escH(s.groupIcon)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'"><div class="${dotClass}"></div>`;
		} else if (!s.isGroup && s.peerAvatar) {
			avHtml = `<img src="${escH(s.peerAvatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'"><div class="${dotClass}"></div>`;
		}
		const displayName = (!s.isGroup && s.peerName && s.peerName !== s.name) ? s.peerName : s.name;
		return `<div class="chat-item${isActive ? ' active' : ''}" onclick="App.selectChat('${s.id}')">
			<div class="ci-av" style="color:${th.primary};border-color:${isActive ? th.primary : 'rgba(255,255,255,.1)'}">
				${avHtml}
			</div>
			<div class="ci-info">
				<div class="ci-name">${escH(displayName)} <span style="opacity:.4;font-size:.7em">${type}</span></div>
				<div class="ci-prev">${escH(s.lastMessage || (s.connected ? 'Connected' : 'Not connected'))}</div>
			</div>
			<div class="ci-meta"><div class="ci-time">${time}</div>${unreadBadge}</div>
		</div>`;
	}).join('');
}

export function renderTopbar(sess) {
	const avEl = el('topbarAv'), nameEl = el('topbarName'), dotEl = el('statusDot'), txtEl = el('statusText');
	if (!avEl) return;
	const th = THEMES[sess.theme] || THEMES.void;
	if (sess.isGroup && sess.groupIcon) {
		avEl.innerHTML = `<img src="${escH(sess.groupIcon)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`; avEl.style.border = 'none';
	} else if (!sess.isGroup && sess.peerAvatar) {
		avEl.innerHTML = `<img src="${escH(sess.peerAvatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`; avEl.style.border = 'none';
	} else {
		avEl.innerHTML = sess.name.slice(0, 2).toUpperCase(); avEl.style.color = th.primary; avEl.style.border = '';
	}
	const displayName = (!sess.isGroup && sess.peerName) ? sess.peerName : sess.name;
	nameEl.textContent = displayName;
	dotEl.className = 'status-dot ' + (sess.connected ? 'connected' : '');
	txtEl.textContent = sess.connected ? `${sess.peers.size} peer${sess.peers.size !== 1 ? 's' : ''} connected` : 'Disconnected';
	enableCallBtns(sess.connected);
}

export function setStatus(state, text) {
	const d = el('statusDot'); if (d) d.className = 'status-dot ' + state;
	const t = el('statusText'); if (t) t.textContent = text;
}

export function enableCallBtns(on) {
	['btnVoice', 'btnVideo'].forEach(id => { const b = el(id); if (b) b.disabled = !on; });
}

export async function renderMessages(sess) {
	const container = el('messages'); if (!container) return;
	container.innerHTML = '';
	if (!sess.messages.length) sess.messages = await DB.getMessages(sess.id);
	for (const m of sess.messages) renderMsgItem(container, m);
	container.scrollTop = container.scrollHeight;
}

export function renderMsgItem(container, m) {
	if (m.type === 'system') {
		const d = document.createElement('div'); d.className = 'sys-msg'; d.textContent = m.content;
		container.appendChild(d); return;
	}
	if (m.type === 'file') { renderFileBubbleFromMsg(container, m); return; }
	if (m.type === 'call') { renderCallCardFromMsg(container, m); return; }
	const side = m.mine ? 'mine' : 'theirs';
	const enc = m.enc ? '<span class="enc-badge">🔒 enc</span>' : '';
	const ticks = m.mine ? ticksHtml(m.ticks || 1) : '';
	const d = document.createElement('div'); d.className = `msg ${side}`; d.dataset.msgId = m.id;
	d.innerHTML = `<div class="msg-meta">${escH(m.sender)} · ${fmtTime(m.timestamp)}${enc}${ticks}</div>
		<div class="msg-bubble">${formatText(m.content)}</div>`;
	container.appendChild(d);
}

// addBubble returns msgId for delivered receipt
export function addBubble(sess, text, sender, mine, enc = false) {
	const m = { id: 'msg_' + Date.now() + '_' + uid(), sessionId: sess.id, type: 'text', content: text, sender, mine, timestamp: Date.now(), enc, ticks: mine ? 1 : 0 };
	sess.messages.push(m); sess.lastMessage = text.slice(0, 60); sess.lastActivity = m.timestamp;
	DB.saveMessage(m); DB.updateSession(sess.id, { lastMessage: sess.lastMessage, lastActivity: sess.lastActivity });
	if (!mine && S.activeId !== sess.id) { sess.unread++; renderChatList(); }
	if (S.activeId === sess.id) {
		const c = el('messages');
		if (c) { renderMsgItem(c, m); c.scrollTop = c.scrollHeight; }
		renderChatList();
	} else renderChatList();
	return m.id;
}

export function addSysMsg(sess, text) {
	const m = { id: 'sys_' + Date.now() + '_' + uid(), sessionId: sess.id, type: 'system', content: text, sender: '', mine: false, timestamp: Date.now(), enc: false };
	sess.messages.push(m); DB.saveMessage(m);
	if (S.activeId === sess.id) {
		const c = el('messages');
		if (c) { renderMsgItem(c, m); c.scrollTop = c.scrollHeight; }
	}
}
