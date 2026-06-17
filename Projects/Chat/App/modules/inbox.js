import { S, makeSess } from './state.js';
import { MY_PEER_ID } from './constants.js';
import { DB } from './db.js';
import { setStatus, enableCallBtns, addSysMsg, renderChatList } from './chat-render.js';
import { safeSend } from './sessions.js';
import { ChatEngine } from '../../engine.js';
import { handleMsg } from './protocol.js';

export const Inbox = {
	engine: null,
	_gidMap: new Map(), // gid -> sessId

	start() {
		if (!S.user || this.engine) return;
		const roomId = S.user.uid;
		this.engine = new ChatEngine();
		this.engine.init(firebase.firestore());
		this.engine.onPeerConnected(gid => this._onConnect(gid, roomId));
		this.engine.onPeerDisconnected(gid => this._onDisconnect(gid));
		this.engine.onMessage((data, gid) => this._onMsg(data, gid));
		this.engine.createRoom(roomId).catch(e => console.warn('[Inbox]', e));
	},

	stop() {
		this.engine?.disconnect(); this.engine = null; this._gidMap.clear();
	},

	_onConnect(gid, roomId) {
		// Find existing unconnected inbox session or create new one
		let sess = S.sessions.get(this._gidMap.get(gid));
		if (!sess) {
			sess = [...S.sessions.values()].find(s => s.roomId === roomId && !s.isGroup && !s.connected);
			if (!sess) {
				sess = makeSess({ name: 'New DM', type: 'firebase', roomId });
				sess.isHost = true;
				S.sessions.set(sess.id, sess);
				DB.saveSession(sess);
			}
		}
		this._gidMap.set(gid, sess.id);
		sess.connected = true;
		sess.peers.set(gid, { name: 'Peer', avatar: '', myPeerId: '' });
		sess.engine = this._mkEngine(gid);
		if (S.activeId === sess.id) { setStatus('connected', 'Connected'); enableCallBtns(sess.connected); }
		addSysMsg(sess, 'Connected ✓');
		safeSend(sess, { type: 'handshake', displayName: S.displayName, avatarUrl: S.avatarUrl, myPeerId: MY_PEER_ID, isGroup: false, groupName: '' });
		renderChatList();
	},

	_onDisconnect(gid) {
		const sess = S.sessions.get(this._gidMap.get(gid)); if (!sess) return;
		sess.peers.delete(gid);
		if (sess.peers.size === 0) {
			sess.connected = false;
			if (S.activeId === sess.id) { setStatus('disconnected', 'Disconnected'); enableCallBtns(false); }
		}
		addSysMsg(sess, 'Peer left'); renderChatList();
	},

	_onMsg(data, gid) {
		const sess = S.sessions.get(this._gidMap.get(gid));
		if (sess) handleMsg(sess, data, gid);
	},

	_mkEngine(gid) {
		const self = this;
		return {
			send(data) {
				if (!self.engine) return;
				const peer = self.engine.peers.get(gid);
				if (peer?.channel?.readyState === 'open') try { peer.channel.send(self.engine._ser(data)); } catch {}
			},
			disconnect() {},
		};
	},
};
