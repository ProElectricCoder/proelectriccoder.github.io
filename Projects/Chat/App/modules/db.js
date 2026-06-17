export const DB = {
	_db: null,

	async _open() {
		if (this._db) return this._db;
		this._db = await new Promise((res, rej) => {
			const r = indexedDB.open('PECChatDB', 3);
			r.onupgradeneeded = e => {
				const d = e.target.result;
				if (!d.objectStoreNames.contains('sessions'))
					d.createObjectStore('sessions', { keyPath: 'id' });
				if (!d.objectStoreNames.contains('messages')) {
					const ms = d.createObjectStore('messages', { keyPath: 'id' });
					ms.createIndex('sessionId', 'sessionId');
				}
			};
			r.onsuccess = e => res(e.target.result);
			r.onerror   = e => rej(e.target.error);
		});
		return this._db;
	},

	_p(r) {
		return new Promise((res, rej) => {
			r.onsuccess = e => res(e.target.result);
			r.onerror   = e => rej(e.target.error);
		});
	},

	async saveSession(s) {
		const db = await this._open();
		return this._p(db.transaction('sessions', 'readwrite').objectStore('sessions').put({
			id: s.id, name: s.name, type: s.type, isGroup: s.isGroup, theme: s.theme,
			createdAt: s.createdAt, lastActivity: s.lastActivity, lastMessage: s.lastMessage,
			roomId: s.roomId || null, groupName: s.groupName || null,
			peerName: s.peerName || null, peerAvatar: s.peerAvatar || null, bg: s.bg || null,
			myRole: s.myRole || 'member', groupIcon: s.groupIcon || null,
			groupOwner: s.groupOwner || null, groupManagers: s.groupManagers || [],
			membersData: s.membersData || {},
		}));
	},

	async saveMessage(m) {
		const db = await this._open();
		const toSave = { ...m };
		if (toSave.file) {
			toSave.file = { ...toSave.file };
			delete toSave.file.blobUrl;
			if (toSave.file.dataUrl && (toSave.file.size > 512 * 1024 || !toSave.file.mime?.startsWith('image/')))
				delete toSave.file.dataUrl;
		}
		return this._p(db.transaction('messages', 'readwrite').objectStore('messages').put(toSave));
	},

	async getSessions() {
		const db  = await this._open();
		const all = await this._p(db.transaction('sessions', 'readonly').objectStore('sessions').getAll());
		return all.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
	},

	async getMessages(sid) {
		const db  = await this._open();
		const idx = db.transaction('messages', 'readonly').objectStore('messages').index('sessionId');
		const all = await this._p(idx.getAll(sid));
		return all.sort((a, b) => a.timestamp - b.timestamp);
	},

	async updateSession(id, partial) {
		const db = await this._open();
		const st = db.transaction('sessions', 'readwrite').objectStore('sessions');
		const ex = await this._p(st.get(id));
		if (ex) return this._p(st.put({ ...ex, ...partial }));
	},

	async deleteSession(id) {
		const db = await this._open();
		const t  = db.transaction(['sessions', 'messages'], 'readwrite');
		t.objectStore('sessions').delete(id);
		const idx  = t.objectStore('messages').index('sessionId');
		const keys = await this._p(idx.getAllKeys(id));
		keys.forEach(k => t.objectStore('messages').delete(k));
	},
};
