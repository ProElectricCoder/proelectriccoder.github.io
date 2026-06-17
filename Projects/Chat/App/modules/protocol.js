import { Crypt } from './crypto.js';
import { S } from './state.js';
import { DB } from './db.js';
import { el, escH, toast } from './utils.js';
import { MY_PEER_ID } from './constants.js';
import { addBubble, addSysMsg, renderChatList, renderTopbar, setStatus, enableCallBtns } from './chat-render.js';
import { updateTicksDOM } from './text-format.js';
import { receiveFile } from './file-transfer.js';
import { peerName, safeSend } from './sessions.js';
import { showIncomingDialog, setCallStatusTxt, closeIncomingDialog, endCallInternal } from './call-1to1.js';
import { createCallCard, updateCallCard } from './call-card.js';
import { _gcCreatePeer, gcRemoveTile, _gcCleanup } from './call-group.js';

// ── Engine binding ───────────────────────────────────────────────────────
export function bindEngine(sess, engine) {
	sess.engine = engine;
	engine.onPeerConnected(peerId => {
		sess.connected = true; sess.peers.set(peerId, { name: 'Peer', avatar: '', myPeerId: '' });
		if (S.activeId === sess.id) { setStatus('connected', 'Connected'); enableCallBtns(true); }
		addSysMsg(sess, 'Connected ✓');
		safeSend(sess, { type: 'handshake', displayName: S.displayName, avatarUrl: S.avatarUrl, myPeerId: MY_PEER_ID, isGroup: sess.isGroup, groupName: sess.groupName || '' });
		if (sess.isGroup && sess.isHost) {
			const members = [...sess.peers.entries()].map(([pid, p]) => ({ pid, name: p.name }));
			safeSend(sess, { type: 'group-members', members });
		}
		renderChatList();
	});
	engine.onPeerDisconnected(peerId => {
		const pname = sess.peers.get(peerId)?.name || 'Peer';
		sess.peers.delete(peerId);
		if (sess.peers.size === 0) {
			sess.connected = false;
			if (S.activeId === sess.id) { setStatus('disconnected', 'Disconnected'); enableCallBtns(false); }
			if (S.callSessId === sess.id) endCallInternal(sess, false);
		}
		addSysMsg(sess, `${pname} left`); renderChatList();
	});
	engine.onMessage((data, peerId) => handleMsg(sess, data, peerId));
}

// ── Typing indicator DOM update ──────────────────────────────────────────
export function updateTypingIndicator(sess) {
	const txtEl = el('statusText'); if (!txtEl || S.activeId !== sess.id) return;
	const typers = [...(sess.typingPeers || [])];
	if (typers.length > 0) {
		txtEl.innerHTML = `<span class="typing-status">${escH(typers.join(', '))} typing<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span></span>`;
	} else {
		txtEl.textContent = sess.connected ? `${sess.peers.size} peer${sess.peers.size !== 1 ? 's' : ''} connected` : 'Disconnected';
	}
}

// ── Message protocol ─────────────────────────────────────────────────────
export async function handleMsg(sess, data, peerId) {
	if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
	if (!(data && typeof data === 'object' && data.type)) return;
	switch (data.type) {
		case 'handshake':
			sess.peers.set(peerId, { name: data.displayName || 'Peer', avatar: data.avatarUrl || '', myPeerId: data.myPeerId || peerId });
			sess.peerName = data.displayName || 'Peer';
			sess.peerAvatar = data.avatarUrl || '';
			// rename non-group rooms to peer's display name if still using roomId as name
			if (!sess.isGroup && sess.name === sess.roomId && data.displayName) {
				sess.name = data.displayName;
			}
			DB.saveSession(sess);
			addSysMsg(sess, `${data.displayName || 'Peer'} joined`);
			if (S.activeId === sess.id) renderTopbar(sess); renderChatList(); break;
		case 'group-members':
			for (const m of (data.members || [])) if (!sess.peers.has(m.pid)) sess.peers.set(m.pid, { name: m.name, avatar: '', myPeerId: '' });
			if (S.activeId === sess.id) renderTopbar(sess); break;
		case 'chat': {
			let txt = data.text, enc = !!data.encrypted;
			if (enc) {
				if (!Crypt.key) { addBubble(sess, '[🔒 Encrypted — set same password in Settings]', data.displayName || 'Peer', false, false); return; }
				try { txt = await Crypt.decText(txt); } catch { addBubble(sess, '[⚠ Decryption failed]', data.displayName || 'Peer', false, false); return; }
			}
			const msgId = addBubble(sess, txt, data.displayName || peerName(sess, peerId), false, enc);
			// Send delivered receipt
			if (msgId && sess.connected) safeSend(sess, { type: 'msg-delivered', msgId });
			break;
		}
		case 'msg-delivered': {
			const dm = sess.messages.find(m => m.id === data.msgId && m.mine && m.ticks === 1);
			if (dm) { dm.ticks = 2; DB.saveMessage(dm); updateTicksDOM(dm.id, 2); }
			break;
		}
		case 'msg-read': {
			for (const msgId of (data.msgIds || [])) {
				const rm = sess.messages.find(m => m.id === msgId && m.mine);
				if (rm && (rm.ticks || 0) < 3) { rm.ticks = 3; DB.saveMessage(rm); updateTicksDOM(rm.id, 3); }
			}
			break;
		}
		case 'typing': {
			if (!sess.typingPeers) sess.typingPeers = new Set();
			sess.typingPeers.add(data.displayName || peerName(sess, peerId));
			if (S.activeId === sess.id) updateTypingIndicator(sess);
			clearTimeout(sess._typingTimers?.[data.displayName]);
			if (!sess._typingTimers) sess._typingTimers = {};
			sess._typingTimers[data.displayName] = setTimeout(() => {
				sess.typingPeers?.delete(data.displayName);
				if (S.activeId === sess.id) updateTypingIndicator(sess);
			}, 3000);
			break;
		}
		case 'typing-stop': {
			sess.typingPeers?.delete(data.displayName);
			if (S.activeId === sess.id) updateTypingIndicator(sess);
			break;
		}
		case 'file-meta': sess.inFiles.set(data.id, { meta: data, chunks: [] }); break;
		case 'file-chunk': { const f = sess.inFiles.get(data.id); if (f) f.chunks.push(data.data); break; }
		case 'file-done': await receiveFile(sess, data.id, peerId); break;
		case 'call-offer':
			if (sess.call.state !== 'idle') { safeSend(sess, { type: 'call-reject', reason: 'busy' }); return; }
			if (S.callSessId !== null && S.callSessId !== sess.id) { safeSend(sess, { type: 'call-reject', reason: 'busy' }); return; }
			sess.call.incoming = data; sess.call.state = 'ringing'; S.callSessId = sess.id;
			showIncomingDialog(sess, data, false); break;
		case 'call-answer':
			if (sess.call.mediaPc && sess.call.state === 'calling') {
				await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp })).catch(e => console.error('[WebRTC] Answer SDP error:', e));
				if (sess.call.iceQueue?.length) { for (const cand of sess.call.iceQueue) await sess.call.mediaPc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {}); sess.call.iceQueue = []; }
				setCallStatusTxt('In call · ' + (sess.call.type || ''));
			} break;
		case 'call-ice':
			if (data.candidate) {
				if (sess.call.mediaPc && sess.call.mediaPc.remoteDescription) { sess.call.mediaPc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {}); }
				else { if (!sess.call.iceQueue) sess.call.iceQueue = []; sess.call.iceQueue.push(data.candidate); }
			} break;
		case 'call-renego':
			if (sess.call.mediaPc && (sess.call.state === 'active' || sess.call.state === 'calling')) {
				try {
					await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
					const ans = await sess.call.mediaPc.createAnswer();
					await sess.call.mediaPc.setLocalDescription(ans);
					safeSend(sess, { type: 'call-renego-ok', sdp: ans.sdp });
				} catch (e) { console.error('[WebRTC] Renego error', e); }
			} break;
		case 'call-renego-ok':
			if (sess.call.mediaPc && (sess.call.state === 'active' || sess.call.state === 'calling')) {
				try { await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp })); } catch (e) { console.error('[WebRTC] Renego-ok error', e); }
			} break;
		case 'call-end': {
			const wasActive = sess.call.state === 'active';
			const dur = wasActive && S.callStarted ? Math.floor((Date.now() - S.callStarted) / 1000) : 0;
			if (sess.call.state === 'ringing' && !sess.call.cardMsgId) { createCallCard(sess, false, sess.call.incoming?.callType || 'audio', 'missed', 0); }
			else if (sess.call.cardMsgId) { updateCallCard(sess, sess.call.cardMsgId, wasActive ? 'completed' : 'cancelled', dur); }
			endCallInternal(sess, false, null, true); break;
		}
		case 'call-reject': {
			if (sess.call.cardMsgId) updateCallCard(sess, sess.call.cardMsgId, 'declined', 0);
			endCallInternal(sess, false, null, true); break;
		}
		case 'display-name': {
			const old = sess.peers.get(peerId)?.name || 'Peer';
			if (sess.peers.has(peerId)) sess.peers.get(peerId).name = data.displayName;
			sess.peerName = data.displayName; DB.saveSession(sess);
			if (S.activeId === sess.id) renderTopbar(sess);
			addSysMsg(sess, `${old} → ${data.displayName}`); break;
		}
		// ── Group call signaling ──
		case 'gc-invite':
			if (data.from === MY_PEER_ID) break;
			if (S.gcSessId) break; // Already in a group call
			sess.gc.callId = data.callId; sess.gc.type = data.callType;
			sess.gc.names.set(data.from, data.displayName || 'Peer');
			S.callSessId = sess.id;
			showIncomingDialog(sess, { callType: data.callType, displayName: data.displayName || 'Group' }, true, data.callId, data.from);
			break;
		case 'gc-accept':
			if (data.from === MY_PEER_ID) break;
			if (sess.gc.callId !== data.callId) break;
			sess.gc.names.set(data.from, data.displayName || 'Peer');
			if (sess.gc.state === 'calling' || sess.gc.state === 'active') {
				sess.gc.state = 'active';
				// Polite peer: higher ID creates offer
				if (MY_PEER_ID > data.from) { _gcCreatePeer(sess, data.from, true); }
				// else wait for their offer
				// Send peer list to new joiner so they know who else is in the call
				const peerList = [...sess.gc.pcs.keys()].map(pid => ({ myPeerId: pid, name: sess.gc.names.get(pid) || 'Peer' }));
				peerList.push({ myPeerId: MY_PEER_ID, name: S.displayName });
				safeSend(sess, { type: 'gc-peer-list', callId: data.callId, peers: peerList, to: data.from, from: MY_PEER_ID });
			}
			break;
		case 'gc-peer-list':
			if (data.to !== MY_PEER_ID) break;
			if (sess.gc.callId !== data.callId) break;
			for (const peer of (data.peers || [])) {
				if (peer.myPeerId === MY_PEER_ID) continue;
				sess.gc.names.set(peer.myPeerId, peer.name);
				if (!sess.gc.pcs.has(peer.myPeerId) && MY_PEER_ID > peer.myPeerId) { _gcCreatePeer(sess, peer.myPeerId, true); }
			}
			break;
		case 'gc-decline':
			if (data.callId === sess.gc.callId && sess.gc.state === 'idle') {
				// Clean up our waiting state if needed
				S.callSessId = null;
				closeIncomingDialog();
			}
			break;
		case 'gc-offer':
			if (data.to !== MY_PEER_ID) break;
			if (sess.gc.callId !== data.callId) break;
			(async () => {
				const pc = sess.gc.pcs.get(data.from) || await _gcCreatePeer(sess, data.from, false);
				if (!pc) return;
				try {
					await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
					const ans = await pc.createAnswer();
					await pc.setLocalDescription(ans);
					safeSend(sess, { type: 'gc-answer', callId: data.callId, sdp: ans.sdp, from: MY_PEER_ID, to: data.from });
				} catch (e) { console.error('[GC offer]', e); }
			})();
			break;
		case 'gc-answer':
			if (data.to !== MY_PEER_ID) break;
			if (sess.gc.callId !== data.callId) break;
			{ const pc = sess.gc.pcs.get(data.from); if (pc) pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp })).catch(e => console.error('[GC answer]', e)); }
			break;
		case 'gc-ice':
			if (data.to !== MY_PEER_ID) break;
			if (sess.gc.callId !== data.callId) break;
			{ const pc = sess.gc.pcs.get(data.from); if (pc?.remoteDescription) pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {}); }
			break;
		case 'gc-end':
			if (sess.gc.callId !== data.callId) break;
			{
				const pc = sess.gc.pcs.get(data.from);
				if (pc) { pc.close(); sess.gc.pcs.delete(data.from); sess.gc.streams.delete(data.from); }
				gcRemoveTile(data.from);
				if (sess.gc.pcs.size === 0 && sess.gc.state === 'active') {
					_gcCleanup(sess);
					toast('Group call ended');
				}
			}
			break;
	}
}
