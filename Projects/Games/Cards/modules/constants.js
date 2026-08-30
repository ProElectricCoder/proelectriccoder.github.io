// ── Site-wide config this page needs ──────────────────────────────────
// Same Firebase project as the Chat app (Projects/Chat/App/modules/constants.js).
// Duplicated here rather than imported cross-project, since it's just public
// client config — keeps this game loadable even if the Chat project isn't.
export const FB_CFG = {
	apiKey:            'AIzaSyC_v49m7e5xt-FCWs0DSq7aGU7gD1aiTh4',
	authDomain:        'proelectriccoder.firebaseapp.com',
	projectId:         'proelectriccoder',
	storageBucket:     'proelectriccoder.firebasestorage.app',
	messagingSenderId: '629115974151',
	appId:             '1:629115974151:web:636737d123e4e8685c70a2',
};

// Same Cloudflare Durable Object relay the Chat app uses for CloudflareWSEngine.
// CloudflareWSEngine is a generic WebRTC signaling relay (it only ever carries
// offer/answer/candidate JSON — actual game data travels peer-to-peer over the
// resulting RTCDataChannel), so the same endpoint works unchanged for this game.
// VERIFY this matches the real CFWS_URL in Projects/Chat/App/modules/constants.js —
// it isn't in the files this was built from, so this is inferred from your domain
// plus the engine's own example URL, not confirmed.
export const CFWS_URL = 'wss://proelectriccoder.pages.dev/api/ChatRooms';
