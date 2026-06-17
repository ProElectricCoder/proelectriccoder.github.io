import { S, uid } from './state.js';
import { DB } from './db.js';
import { el, escH, fmtTime } from './utils.js';
import { renderChatList } from './chat-render.js';
import { peerName } from './sessions.js';

export function buildCallCard(cd) {
	if (!cd) return '';
	const { callType = 'audio', status = 'calling', duration = 0 } = cd;
	const isVid = callType === 'video';
	const icons  = { calling: '📞', active: '📞', completed: isVid ? '📹' : '📞', declined: '📵', missed: '📵', cancelled: '📞' };
	const titles = { audio: 'Voice Call', video: 'Video Call', screen: 'Screen Share' };
	const dur = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
	const metas = { calling: 'Calling…', active: 'In call…', completed: dur || 'Call ended', declined: 'Declined', missed: 'Missed call', cancelled: 'Cancelled' };
	return `<div class="call-card ${status}"><div class="call-card-icon">${icons[status] || '📞'}</div><div class="call-card-body"><div class="call-card-title">${titles[callType] || 'Voice Call'}</div><div class="call-card-meta">${metas[status] || status}</div></div></div>`;
}

export function createCallCard(sess, mine, callType, status, duration = 0) {
	const msgId = 'call_' + Date.now() + '_' + uid();
	const sender = mine ? S.displayName : (sess.peerName || peerName(sess, 'remote'));
	const callData = { callType, status, duration };
	const m = { id: msgId, sessionId: sess.id, type: 'call', content: (callType === 'video' ? '📹' : '📞') + ' ' + status, sender, mine, timestamp: Date.now(), enc: false, callData };
	sess.messages.push(m);
	sess.lastMessage = (callType === 'video' ? '📹 Video Call' : '📞 Voice Call');
	sess.lastActivity = m.timestamp;
	DB.saveMessage(m);
	DB.updateSession(sess.id, { lastMessage: sess.lastMessage, lastActivity: sess.lastActivity });
	if (S.activeId === sess.id) {
		const c = el('messages');
		if (c) { renderCallCardFromMsg(c, m); c.scrollTop = c.scrollHeight; }
	}
	renderChatList();
	return msgId;
}

export function updateCallCard(sess, msgId, status, duration = 0) {
	const m = sess.messages.find(x => x.id === msgId);
	if (m && m.callData) { m.callData.status = status; m.callData.duration = duration; DB.saveMessage(m); }
	const wrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
	if (wrapper) {
		const bubble = wrapper.querySelector('.msg-bubble');
		if (bubble) bubble.innerHTML = buildCallCard(m?.callData || { callType: 'audio', status, duration });
	}
}

export function renderCallCardFromMsg(container, m) {
	const side = m.mine ? 'mine' : 'theirs';
	const d = document.createElement('div'); d.className = `msg ${side}`; d.dataset.msgId = m.id;
	d.innerHTML = `<div class="msg-meta">${escH(m.sender)} · ${fmtTime(m.timestamp)}</div><div class="msg-bubble" style="padding:0;background:none!important;border:none!important">${buildCallCard(m.callData)}</div>`;
	container.appendChild(d);
}
