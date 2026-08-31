// ── In-room chat (Online mode only) ──────────────────────────────────
// Transport protocol: a guest sends {type:'CHAT_MESSAGE', text} to the
// host; the host attaches the sender's name and broadcasts
// {type:'CHAT_BROADCAST', sender, text, system} to everyone, including
// itself locally (a host has no peer connection to itself to loop
// through). modules/lobby.js and modules/guest-client.js wire the actual
// message routing into addMessage() below.
import { S } from './state.js';
import * as Net from './net.js';
import { escapeHtml } from './render.js';

const MAX_LEN = 500;
let unread = 0;
let isOpen = false;

export function addMessage(sender, text, isSystem = false) {
	const box = document.getElementById('chatMessages'); if (!box) return;
	const row = document.createElement('div');
	row.className = isSystem ? 'chat-msg system' : 'chat-msg';
	row.innerHTML = isSystem
		? `<span class="chat-system-text">${escapeHtml(text)}</span>`
		: `<span class="chat-sender">${escapeHtml(sender)}</span><span class="chat-text">${escapeHtml(text)}</span>`;
	box.appendChild(row);
	box.scrollTop = box.scrollHeight;
	if (!isOpen) { unread++; updateBadge(); }
}

function updateBadge() {
	const b = document.getElementById('chatBadge'); if (!b) return;
	b.textContent = unread > 9 ? '9+' : String(unread);
	b.classList.toggle('hidden', unread === 0);
}

export function setVisible(visible) {
	document.getElementById('chatWidget')?.classList.toggle('hidden', !visible);
	if (!visible) { isOpen = false; document.getElementById('chatPanel')?.classList.remove('open'); }
}

export function toggleChat() {
	isOpen = !isOpen;
	document.getElementById('chatPanel')?.classList.toggle('open', isOpen);
	if (isOpen) { unread = 0; updateBadge(); document.getElementById('chatInput')?.focus(); }
}

export function clearMessages() {
	const box = document.getElementById('chatMessages'); if (box) box.innerHTML = '';
	unread = 0; updateBadge();
}

// Called when the LOCAL user (host or guest) submits the chat input.
export function sendChatMessage(rawText) {
	const text = (rawText || '').trim().slice(0, MAX_LEN);
	if (!text) return;
	if (S.mode === 'host') {
		const name = S.players[S.localSeatIdx]?.name || 'Host';
		Net.broadcast({ type: 'CHAT_BROADCAST', sender: name, text, system: false });
		addMessage(name, text);
	} else if (S.mode === 'guest') {
		Net.sendToHost({ type: 'CHAT_MESSAGE', text });
	}
	const input = document.getElementById('chatInput');
	if (input) input.value = '';
}
