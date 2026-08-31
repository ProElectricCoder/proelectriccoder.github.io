// ── Host-side lobby: room roster + game-start orchestration ─────────────
import { S, pushLog } from './state.js';
import * as Net from './net.js';
import { startHostGame, handleRemoteMove, convertSeatToBot } from './game.js';
import * as Render from './render.js';
import * as Chat from './chat.js';

const roster = new Map(); // gid -> { name, seatIdx }
let hostName = 'You';
let started = false;

export async function createHostedRoom(numSeats, name) {
	hostName = (name || '').trim() || 'You';
	roster.clear();
	started = false;
	S.mode = 'host';
	Chat.clearMessages();

	Net.onNet('peer-connected', () => {}); // seat assignment waits for their 'hello' (need a name first)
	Net.onNet('peer-disconnected', ({ gid }) => onPeerLeft(gid));
	Net.onNet('peer-message', ({ gid, data }) => onPeerMessage(gid, data));

	const roomId = await Net.hostRoom();
	S.roomId = roomId;
	S.maxSeats = numSeats;
	broadcastRoster();
	return roomId;
}

function systemNotice(text) {
	Net.broadcast({ type: 'CHAT_BROADCAST', sender: 'System', text, system: true });
	Chat.addMessage('System', text, true);
}

function onPeerMessage(gid, data) {
	if (!data || typeof data !== 'object') return;
	if (data.type === 'hello') {
		if (started) return; // room already underway — no late joins for now
		if (roster.size >= S.maxSeats - 1) { Net.sendTo(gid, { type: 'full' }); return; }
		const seatIdx = roster.size + 1; // seat 0 is always the host
		const name = (data.name || '').trim() || `Player ${seatIdx}`;
		roster.set(gid, { name, seatIdx });
		Net.sendTo(gid, { type: 'seat', seatIdx });
		pushLog(`${name} joined the room.`);
		Render.renderLog();
		systemNotice(`${name} joined the room.`);
		broadcastRoster();
	} else if (data.type === 'move' && started) {
		handleRemoteMove(gid, data.cardId);
	} else if (data.type === 'CHAT_MESSAGE') {
		const senderName = roster.get(gid)?.name || 'Player';
		const text = String(data.text || '').trim().slice(0, 500);
		if (!text) return;
		Net.broadcast({ type: 'CHAT_BROADCAST', sender: senderName, text, system: false });
		Chat.addMessage(senderName, text);
	}
}

function onPeerLeft(gid) {
	const entry = roster.get(gid);
	if (!entry) return;
	if (started) {
		convertSeatToBot(gid);
		systemNotice(`${entry.name} left — a bot is taking over their hand.`);
	} else {
		roster.delete(gid);
		systemNotice(`${entry.name} left the room.`);
		broadcastRoster();
	}
}

function rosterSeats() {
	const seats = [{ idx: 0, name: hostName, kind: 'local' }];
	for (const [, entry] of roster) seats.push({ idx: entry.seatIdx, name: entry.name, kind: 'remote' });
	return seats.sort((a, b) => a.idx - b.idx);
}

function broadcastRoster() {
	Render.renderLobby({ roomId: S.roomId, maxSeats: S.maxSeats, seats: rosterSeats(), isHost: true, started });
	Net.broadcast({ type: 'lobby', roomId: S.roomId, maxSeats: S.maxSeats, seats: rosterSeats() });
}

export function startHostedGame() {
	if (started) return;
	started = true;
	const seatToGid = new Map();
	for (const [gid, entry] of roster) seatToGid.set(entry.seatIdx, gid);

	const specs = [];
	for (let i = 0; i < S.maxSeats; i++) {
		if (i === 0) { specs.push({ name: hostName, kind: 'local' }); continue; }
		if (seatToGid.has(i)) {
			const gid = seatToGid.get(i);
			specs.push({ name: roster.get(gid).name, kind: 'remote', gid });
		} else {
			specs.push({ name: `Bot ${i}`, kind: 'bot' });
		}
	}
	startHostGame(specs);
}

export function leaveHostedRoom() {
	Net.disconnectNet();
	roster.clear();
	started = false;
	S.roomId = null;
}
