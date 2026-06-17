// ── Global state ──────────────────────────────────────────────────────────
export const S = {
	sessions:      new Map(),
	activeId:      null,
	user:          null,
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
		},
	};
}

export function uid() {
	return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
