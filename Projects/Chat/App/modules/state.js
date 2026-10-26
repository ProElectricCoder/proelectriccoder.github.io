import { MY_PEER_ID } from './constants.js';

// ── Global state ──────────────────────────────────────────────────────────
export const S = {
	sessions:      new Map(),
	activeId:      null,
	user:          null,
	linkPreviews:  localStorage.getItem('pec_link_previews') !== 'false',   // Open Graph link previews (Settings)
	chatId:        null,   // readable Chat ID (google-… / github-… / email-…), null until resolved
	pendingVerify: null,   // email/password user who has not verified their address yet
	displayName:   localStorage.getItem('pec_name')    || 'Anonymous',
	avatarUrl:     localStorage.getItem('pec_avatar')  || '',
	encEnabled:    false,
	cubicGradFn:   null,
	gradActive:    1,
	callSessId:    null,
	callTimer:     null,
	callStarted:   null,
	filterQ:       '',
	wakeLockEnabled: localStorage.getItem('pec_wakelock') === 'true',
	wakeLockObj:   null,
	gcSessId:      null,   // active group-call session
	_pendingInvite: null,
	compose:       null,   // { mode:'reply'|'edit', sessId, id, sender, text } — what the input bar is doing
};

// ── Session factory ────────────────────────────────────────────────────────
export function makeSess(opts) {
	return {
		id:            opts.id            || 'sess_' + Date.now() + '_' + uid(),
		name:          opts.name          || 'New Chat',
		type:          opts.type          || 'firebase',
		isGroup:       opts.isGroup       || false,
		theme:         opts.theme         || 'void',
		createdAt:     opts.createdAt     || Date.now(),
		lastActivity:  opts.lastActivity  || Date.now(),
		lastMessage:   opts.lastMessage   || null,
		roomId:        opts.roomId        || null,
		wsUrl:         opts.wsUrl         || null,
		groupName:     opts.groupName     || null,
		peerName:      opts.peerName      || null,
		peerAvatar:    opts.peerAvatar    || null,
		bg:            opts.bg            || null,
		myRole:        opts.myRole        || 'member',
		groupIcon:     opts.groupIcon     || null,
		groupOwner:    opts.groupOwner    || null,
		groupManagers: opts.groupManagers || [],
		membersData:   opts.membersData   || {},
		// runtime-only
		isHost:    false,
		engine:    null,
		connected: false,
		peers:     new Map(),
		routes:    new Map(),   // peerId -> 'direct' | 'relay' (TURN)
		messages:  [],
		unread:    0,
		inFiles:   new Map(),
		_metaUnsub: null,
		typingPeers:   new Set(),
		_typingTimers: {},
		gc: {
			state: 'idle', callId: null, type: null, localStream: null,
			pcs: new Map(), streams: new Map(), names: new Map(),
		},
		call: {
			mediaPc: null, localStream: null, remoteStream: null,
			type: null, sourceType: null, state: 'idle',
			muted: false, camOff: false, incoming: null, iceQueue: [],
			audioCtx: null, audioAnalyser: null, audioSource: null, audioDrawTimer: null,
			cardMsgId: null, callStartedAt: null,
			callId: null, sigOpen: false, outIce: [],
		},
	};
}

export function uid() {
	return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Stable author id for message ownership checks in groups: the readable Chat ID once signed in, else this page's peer id
export function getAid() { return S.chatId || MY_PEER_ID; }

// Message ids travel between peers, so only accept plain ones
export function cleanId(x) { return typeof x === 'string' && /^[\w-]{6,80}$/.test(x) ? x : null; }
