// ── Online transport: wraps CloudflareWSEngine (Projects/Chat/engine.js) +
// exposes broadcast / targeted-send primitives for the host-authoritative
// protocol used by modules/lobby.js, modules/game.js and modules/guest-client.js.
//
// The engine class is loaded lazily (dynamic import), not at module load
// time — this file lives in a different project than engine.js, and a
// pure Local (vs bots) game should never depend on that cross-project
// file being reachable. Only entering Online mode ever triggers the load.
import * as Auth from './auth.js';
import { CFWS_URL } from './constants.js';

let engine = null;
let handlers = {};
let EngineClass = null;

async function loadEngineClass() {
	if (EngineClass) return EngineClass;
	const mod = await import('../../../Chat/engine.js');
	EngineClass = mod.CloudflareWSEngine;
	return EngineClass;
}

export function isConnected() { return !!engine; }

export function onNet(type, fn) { handlers[type] = fn; }

function emit(type, msg) { handlers[type]?.(msg); }

function newRoomId() {
	return 'getaway-' + Math.random().toString(36).slice(2, 8);
}

// ── Host ──────────────────────────────────────────────────────────────
export async function hostRoom() {
	if (!Auth.isRealUser()) throw new Error('Sign in first to host a room');
	const token = await Auth.getIdToken();
	if (!token) throw new Error('Sign in first');
	const Engine = await loadEngineClass();
	const roomId = newRoomId();
	engine = new Engine({ relay: false, wsUrl: CFWS_URL });
	engine.onPeerConnected(gid => emit('peer-connected', { gid }));
	engine.onPeerDisconnected(gid => emit('peer-disconnected', { gid }));
	engine.onMessage((data, gid) => emit('peer-message', { gid, data }));
	await engine.createRoom(roomId, token);
	return roomId;
}

// Broadcasts to every connected peer.
export function broadcast(msg) {
	if (!engine) return;
	engine.send(msg);
}

// Sends privately to exactly one connected guest. CloudflareWSEngine only
// exposes a broadcast send(), but per-peer RTCDataChannels are public on
// the instance (engine.peers), so this reaches in for a targeted send —
// used only for dealing each player their own private hand.
export function sendTo(gid, msg) {
	if (!engine || !gid) return;
	const peer = engine.peers.get(gid);
	if (peer?.channel?.readyState === 'open') {
		try { peer.channel.send(JSON.stringify(msg)); } catch {}
	}
}

// ── Guest ─────────────────────────────────────────────────────────────
export async function joinRoom(roomId) {
	await Auth.ensureGuestAuth();
	const token = await Auth.getIdToken();
	if (!token) throw new Error('Could not connect — try again');
	const Engine = await loadEngineClass();
	engine = new Engine({ relay: false, wsUrl: CFWS_URL });
	engine.onPeerConnected(() => emit('connected', {}));
	engine.onPeerDisconnected(() => emit('disconnected', {}));
	engine.onMessage((data) => emit('host-message', { data }));
	await engine.joinRoom(roomId, token);
}

// A guest's only peer connection is the host, so a broadcast send() is
// effectively "send to host".
export function sendToHost(msg) {
	if (!engine) return;
	engine.send(msg);
}

export function disconnectNet() {
	try { engine?.disconnect(); } catch {}
	engine = null;
	handlers = {};
}
