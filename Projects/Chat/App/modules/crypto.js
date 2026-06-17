export const Crypt = {
	key: null,

	async derive(pw) {
		const enc = new TextEncoder();
		const raw = await crypto.subtle.importKey('raw', enc.encode(pw), { name: 'PBKDF2' }, false, ['deriveKey']);
		this.key = await crypto.subtle.deriveKey(
			{ name: 'PBKDF2', salt: enc.encode('pec-chat-v3'), iterations: 100000, hash: 'SHA-256' },
			raw,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt'],
		);
	},

	clear() { this.key = null; },

	async encText(plain) {
		if (!this.key) return null;
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, new TextEncoder().encode(plain));
		const out = new Uint8Array(12 + ct.byteLength);
		out.set(iv); out.set(new Uint8Array(ct), 12);
		return btoa(String.fromCharCode(...out));
	},

	async decText(b64) {
		if (!this.key) return null;
		const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
		const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: arr.slice(0, 12) }, this.key, arr.slice(12));
		return new TextDecoder().decode(pt);
	},

	async encBuf(ab) {
		if (!this.key) return ab;
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, ab);
		const out = new Uint8Array(12 + ct.byteLength);
		out.set(iv); out.set(new Uint8Array(ct), 12);
		return out.buffer;
	},

	async decBuf(ab) {
		if (!this.key) return ab;
		const arr = new Uint8Array(ab);
		return crypto.subtle.decrypt({ name: 'AES-GCM', iv: arr.slice(0, 12) }, this.key, arr.slice(12));
	},
};
