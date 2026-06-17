// ── Firebase config ────────────────────────────────────────────────────────
export const FB_CFG = {
	apiKey:            'AIzaSyC_v49m7e5xt-FCWs0DSq7aGU7gD1aiTh4',
	authDomain:        'proelectriccoder.firebaseapp.com',
	projectId:         'proelectriccoder',
	storageBucket:     'proelectriccoder.firebasestorage.app',
	messagingSenderId: '629115974151',
	appId:             '1:629115974151:web:636737d123e4e8685c70a2',
};

// File transfer
export const CHUNK_SIZE = 32 * 1024;

// Media capture: mutable shared object kept here so any module can mutate it
export const MC = { stream: null, recorder: null, chunks: [], type: null };

// Stable per-page peer ID for group call mesh routing
export const MY_PEER_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

// ── Colour themes ──────────────────────────────────────────────────────────
export const THEMES = {
	void:     { name: 'Void',     primary: '#00ffff', secondary: '#3d6eff', accent: '#00ff99', gradEnd: '#002233' },
	amethyst: { name: 'Amethyst', primary: '#a855f7', secondary: '#7c3aed', accent: '#e879f9', gradEnd: '#1a0033' },
	emerald:  { name: 'Emerald',  primary: '#10b981', secondary: '#059669', accent: '#34d399', gradEnd: '#001a0f' },
	amber:    { name: 'Amber',    primary: '#f59e0b', secondary: '#d97706', accent: '#fbbf24', gradEnd: '#1a0f00' },
	crimson:  { name: 'Crimson',  primary: '#f43f5e', secondary: '#e11d48', accent: '#fb7185', gradEnd: '#1a0010' },
	sapphire: { name: 'Sapphire', primary: '#3b82f6', secondary: '#1d4ed8', accent: '#60a5fa', gradEnd: '#001133' },
};
