import { S, uid } from './state.js';
import { DB } from './db.js';
import { el, escH, fmtTime } from './utils.js';
import { renderChatList } from './chat-render.js';
import { peerName } from './sessions.js';
import { iconSvg } from './icons.js';

const TERMINAL = new Set(['completed', 'declined', 'missed', 'cancelled']);

export function buildCallCard(cd) {
	if (!cd) return '';
	const { callType = 'audio', status = 'calling', duration = 0, route = null } = cd;
	const isVid = callType === 'video';
	const icon = status === 'declined' || status === 'missed' ? 'phoneX' : (isVid ? 'video' : callType === 'screen' ? 'screen' : 'phone');
	const titles = { audio: 'Voice Call', video: 'Video Call', screen: 'Screen Share' };
	const dur = duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '';
	const metas = { calling: 'Calling…', ringing: 'Incoming call…', active: 'In call…', completed: dur || 'Call ended', declined: 'Declined', missed: 'Missed call', cancelled: 'Cancelled' };
	const via = route === 'relay' ? ` · ${iconSvg('relay', 0.9)} TURN relay` : '';
	return `<div class="call-card ${status === 'ringing' ? 'calling' : status}"><div class="call-card-icon">${iconSvg(icon, 1.25)}</div><div class="call-card-body"><div class="call-card-title">${titles[callType] || 'Voice Call'}</div><div class="call-card-meta">${metas[status] || status}${via}</div></div></div>`;
}

// The call log message is also the carrier for call signaling: its `meta` holds the callId, the SDP
// offer/answer being exchanged and the connection route. opts: { id, meta }.
export function createCallCard(sess, mine, callType, status, duration = 0, opts = {}) {
	const msgId = opts.id || ('call_' + Date.now() + '_' + uid());
	const sender = mine ? S.displayName : (sess.peerName || peerName(sess, 'remote'));
	const callData = { callType, status, duration };
	const label = callType === 'video' ? 'Video Call' : callType === 'screen' ? 'Screen Share' : 'Voice Call';
	const m = { id: msgId, sessionId: sess.id, type: 'call', content: `${label} · ${status}`, sender, mine, timestamp: Date.now(), enc: false, callData, meta: { ...(opts.meta || {}) } };
	sess.messages.push(m);
	sess.lastMessage = label;
	sess.lastActivity = m.timestamp;
	DB.saveMessage(stripSignaling(m));
	DB.updateSession(sess.id, { lastMessage: sess.lastMessage, lastActivity: sess.lastActivity });
	if (S.activeId === sess.id) {
		const c = el('messages');
		if (c) { renderCallCardFromMsg(c, m); c.scrollTop = c.scrollHeight; }
	}
	renderChatList();
	return msgId;
}

// Merge signaling data into a call log message's meta (in memory only — SDP is never persisted)
export function patchCallMeta(sess, msgId, patch) {
	const m = msgId && sess.messages.find(x => x.id === msgId); if (!m) return null;
	m.meta = { ...(m.meta || {}), ...patch };
	if (patch.route && m.callData) {
		m.callData.route = patch.route;
		const bubble = document.querySelector(`[data-msg-id="${msgId}"] .msg-bubble`);
		if (bubble) bubble.innerHTML = buildCallCard(m.callData);
		DB.saveMessage(stripSignaling(m));
	}
	return m;
}

// SDP/ICE belong to one live call only: drop them before a log message is stored
function stripSignaling(m) {
	const { offer, answer, ...keep } = m.meta || {};
	return { ...m, meta: keep };
}

export function updateCallCard(sess, msgId, status, duration = 0) {
	const m = sess.messages.find(x => x.id === msgId);
	if (m && m.callData) {
		m.callData.status = status; m.callData.duration = duration;
		if (TERMINAL.has(status) && m.meta) { delete m.meta.offer; delete m.meta.answer; }
		DB.saveMessage(stripSignaling(m));
	}
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
