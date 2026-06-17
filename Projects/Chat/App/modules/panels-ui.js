import { S } from './state.js';
import { THEMES } from './constants.js';
import { el, escH } from './utils.js';
import { getActiveSess } from './sessions.js';
import { computeGrad, makeDirGrid } from './theme.js';

export function openSettings() {
	const o = el('settingsOverlay'); if (!o) return;
	const ni = el('spName'); if (ni) ni.value = S.displayName;
	const wt = el('spWakeToggle'); if (wt) wt.checked = S.wakeLockEnabled;
	const aw = el('spAvatarWrap');
	if (aw) {
		const letter = (S.displayName[0] || '?').toUpperCase();
		aw.innerHTML = S.avatarUrl
			? `<img src="${S.avatarUrl}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--tbh)" onerror="this.style.display='none'">`
			: `<div style="width:44px;height:44px;border-radius:50%;background:rgba(0,255,255,.08);border:1px solid var(--tbh);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800;color:var(--tp)">${letter}</div>`;
	}
	const uid_el = el('spUserId');
	if (uid_el) uid_el.textContent = S.user ? S.user.uid : 'Sign in to get your Chat ID';
	syncAuthSection('spAuthArea'); o.classList.add('open');
}

export function syncAuthSection(cid) {
	const a = el(cid); if (!a) return;
	if (S.user) {
		a.innerHTML = `<div class="auth-card" style="margin-bottom:8px"><img class="auth-av" src="${S.user.photoURL || ''}" onerror="this.style.display='none'"><span class="auth-name">${escH(S.user.displayName || S.displayName)}</span></div>
		<button class="btn btn-d btn-full" onclick="App.signOut()">Sign Out</button>`;
	} else {
		a.innerHTML = `<div class="col">
			<button class="sign-in-btn" onclick="App.signInGoogle()"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%23F44336' d='M15.5 8.15c0-.5-.04-1.01-.13-1.5H8v2.84h4.21a3.6 3.6 0 0 1-1.56 2.37v1.97h2.53C14.7 12.35 15.5 10.4 15.5 8.15z'/%3E%3Cpath fill='%234CAF50' d='M8 16c2.14 0 3.94-.71 5.25-1.92l-2.53-1.96c-.71.48-1.62.76-2.72.76-2.09 0-3.86-1.41-4.49-3.3H.9v2.03A7.99 7.99 0 0 0 8 16z'/%3E%3Cpath fill='%23FFC107' d='M3.51 9.58A4.8 4.8 0 0 1 3.26 8c0-.55.09-1.08.25-1.58V4.39H.9A8 8 0 0 0 0 8c0 1.29.31 2.51.9 3.61l2.61-2.03z'/%3E%3Cpath fill='%231565C0' d='M8 3.18c1.17 0 2.23.4 3.06 1.2L13.6 1.8C12.09.4 10.19-.4 8 0a8 8 0 0 0-7.1 4.39l2.62 2.03C4.14 4.6 5.91 3.18 8 3.18z'/%3E%3C/svg%3E" alt="">Sign in with Google</button>
			<button class="sign-in-btn" onclick="App.signInGitHub()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>Sign in with GitHub</button>
		</div>`;
	}
}

export const NC = { tab: 'direct', directSub: 'caller', pendingEngine: null, pendingSessId: null };

export function openNewChat(tab = 'direct') {
	NC.tab = tab; el('newChatModal').classList.add('open'); ncSwitchTab(tab);
	if (tab === 'room' || tab === 'group') syncAuthSection(tab === 'room' ? 'ncRoomAuth' : 'ncGroupAuth');
}

export function ncSwitchTab(tab) {
	NC.tab = tab;
	['direct', 'room', 'group'].forEach(t => {
		el('ncTab' + t.charAt(0).toUpperCase() + t.slice(1))?.classList.toggle('active', t === tab);
		el('nc' + t.charAt(0).toUpperCase() + t.slice(1))?.classList.toggle('hidden', t !== tab);
	});
	el('ncTitle').textContent = tab === 'direct' ? 'Direct Chat' : tab === 'room' ? 'Join / Create Room' : 'Group Chat';
}

export function ncDirectSub(sub) {
	NC.directSub = sub;
	el('ncSubCaller')?.classList.toggle('active', sub === 'caller'); el('ncSubCallee')?.classList.toggle('active', sub === 'callee');
	el('ncCallerFlow')?.classList.toggle('hidden', sub !== 'caller'); el('ncCalleeFlow')?.classList.toggle('hidden', sub !== 'callee');
}

export function openThemePicker() {
	const tp = el('themePicker'); if (!tp) return;
	const sw = el('themeSwatches'); if (!sw) return;
	const sess = getActiveSess();
	sw.innerHTML = Object.entries(THEMES).map(([id, th]) => `<div class="t-sw${sess?.theme === id ? ' active' : ''}" title="${th.name}" style="background:${th.primary}" onclick="App.pickTheme('${id}')"></div>`).join('');
	const btn = el('btnTheme'); const rect = btn?.getBoundingClientRect() || { bottom: 60, right: window.innerWidth };
	tp.style.top = (rect.bottom + 8) + 'px'; tp.style.right = (window.innerWidth - rect.right) + 'px';
	tp.classList.add('open');
}

export function openChatInfo() {
	const sess = getActiveSess(); if (!sess) return;
	const canEdit = sess.myRole === 'owner' || sess.myRole === 'manager';
	const roleLabel = sess.myRole === 'owner' ? '👑 Owner' : sess.myRole === 'manager' ? '⭐ Manager' : '👤 Member';
	const d = el('ciDetails');
	if (d) {
		d.innerHTML = `
		${sess.isGroup ? `<div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--dim);margin-bottom:10px">Role: <span style="color:var(--tp)">${roleLabel}</span></div>` : ''}
		<div class="panel-section-lbl">Chat Name</div>
		<div class="row" style="margin-bottom:12px">
			<input class="f-in" id="ciChatName" value="${escH(sess.name)}" placeholder="Name this chat...">
			<button class="btn btn-s" onclick="App.renameChat()">Save</button>
		</div>
		${sess.isGroup && canEdit ? `
		<div class="panel-section-lbl">Group Icon URL</div>
		<div class="row" style="margin-bottom:12px;align-items:center;gap:8px">
			${sess.groupIcon ? `<img src="${escH(sess.groupIcon)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid var(--tbh)" onerror="this.style.display='none'">` : ''}
			<input class="f-in" id="ciGroupIconUrl" value="${escH(sess.groupIcon || '')}" placeholder="https://… icon URL" style="flex:1">
			<button class="btn btn-s" onclick="App.saveGroupIcon()">Set</button>
		</div>` : ''}
		<div class="panel-section-lbl">Details</div>
		<div class="col" style="gap:6px;font-size:.82rem;color:var(--dim)">
			<div><span style="color:var(--faint)">Type:</span> ${sess.isGroup ? 'Group' : sess.type === 'direct' ? 'Direct' : 'Firebase Room'}</div>
			${sess.roomId ? `<div><span style="color:var(--faint)">Room ID:</span> <code style="font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--tp)">${escH(sess.roomId)}</code></div>` : ''}
			<div><span style="color:var(--faint)">Status:</span> ${sess.connected ? '<span style="color:var(--ta)">Connected</span>' : 'Disconnected'}</div>
		</div>
		${sess.roomId ? `<div class="row" style="margin-top:10px;gap:7px">
			<button class="btn btn-s" style="flex:1" onclick="App.copyInviteLink()">🔗 Copy Invite Link</button>
			${S.user && !sess.isGroup ? `<button class="btn btn-s" style="flex:1" onclick="App.copyUserId()">🪪 My ID</button>` : ''}
		</div>` : ''}`;
	}
	const bgEnd = sess.bg?.endColor || THEMES[sess.theme]?.gradEnd || '#002233';
	const bgStart = sess.bg?.startColor || '#000000', bgPow = sess.bg?.power ?? 2.5, bgSteps = sess.bg?.steps ?? 20, bgDir = sess.bg?.direction || 'to bottom right';
	const prevGrad = computeGrad(bgEnd, bgPow, bgSteps, bgDir, bgStart);
	const bgConf = el('ciBgConf');
	if (bgConf) {
		bgConf.innerHTML = `
		<div class="panel-section-lbl">Background</div>
		<div class="bg-preview" id="ciBgPreview" style="background:${prevGrad}"></div>
		<div class="col" style="gap:14px">
			<div><div class="f-lbl" style="margin-bottom:6px">Direction</div><div class="bg-dir-grid">${makeDirGrid(bgDir)}</div></div>
			<div class="row" style="gap:10px">
				<div style="flex:1;min-width:0"><div class="f-lbl">Start</div><div class="bg-color-row" style="margin-top:5px"><div class="bg-color-swatch" id="ciBgStartSwatch" style="background:${bgStart}"></div><input type="color" id="ciBgStart" value="${bgStart}" oninput="document.getElementById('ciBgStartSwatch').style.background=this.value;App.livePreviewBg()" style="flex:1;height:28px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(0,0,0,.4);cursor:pointer;padding:0 3px"></div></div>
				<div style="flex:1;min-width:0"><div class="f-lbl">End</div><div class="bg-color-row" style="margin-top:5px"><div class="bg-color-swatch" id="ciBgEndSwatch" style="background:${bgEnd}"></div><input type="color" id="ciBgColor" value="${bgEnd}" oninput="document.getElementById('ciBgEndSwatch').style.background=this.value;App.livePreviewBg()" style="flex:1;height:28px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(0,0,0,.4);cursor:pointer;padding:0 3px"></div></div>
			</div>
			<div>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div class="f-lbl" style="margin:0">Curve power</div><code id="ciPowVal" style="font-size:.7rem;color:var(--tp);font-family:'JetBrains Mono',monospace">${bgPow.toFixed(1)}</code></div>
				<input type="range" class="bg-slider" id="ciBgPower" min="0.3" max="6" step="0.1" value="${bgPow}" oninput="document.getElementById('ciPowVal').textContent=parseFloat(this.value).toFixed(1);App.livePreviewBg()">
				<div style="display:flex;justify-content:space-between;font-size:.57rem;color:var(--faint);margin-top:3px"><span>Linear</span><span>Smooth</span><span>Sharp</span></div>
			</div>
			<div>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div class="f-lbl" style="margin:0">Color steps</div><code id="ciStepVal" style="font-size:.7rem;color:var(--tp);font-family:'JetBrains Mono',monospace">${bgSteps}</code></div>
				<input type="range" class="bg-slider" id="ciBgSteps" min="2" max="64" step="1" value="${bgSteps}" oninput="document.getElementById('ciStepVal').textContent=this.value;App.livePreviewBg()">
				<div style="display:flex;justify-content:space-between;font-size:.57rem;color:var(--faint);margin-top:3px"><span>2</span><span>32</span><span>64</span></div>
			</div>
			<div class="row" style="gap:7px"><button class="btn btn-p" style="flex:1" onclick="App.updateBg()">Apply</button><button class="btn btn-s" onclick="App.resetBg()">↺ Reset</button></div>
		</div>`;
	}
	const cs = el('ciThemeSwatches');
	if (cs) cs.innerHTML = Object.entries(THEMES).map(([id, th]) => `<div class="t-sw${sess.theme === id ? ' active' : ''}" title="${th.name}" style="background:${th.primary}" onclick="App.pickTheme('${id}');App.closeChatInfo()"></div>`).join('');
	const cm = el('ciMembers');
	if (cm) {
		const hasMeta = sess.isGroup && Object.keys(sess.membersData || {}).length > 0;
		if (hasMeta) {
			const myUid = S.user?.uid, owner = sess.groupOwner, managers = sess.groupManagers || [];
			cm.innerHTML = Object.entries(sess.membersData).map(([uid, m]) => {
				const isOwner = uid === owner, isManager = managers.includes(uid), isMe = uid === myUid;
				const badge = isOwner ? `<span style="color:#fbbf24;font-size:.64rem">👑 Owner</span>` : isManager ? `<span style="color:var(--tp);font-size:.64rem">⭐ Manager</span>` : `<span style="color:var(--faint);font-size:.64rem">👤 Member</span>`;
				const action = sess.myRole === 'owner' && !isOwner && !isMe ? `<button class="btn btn-s" style="padding:2px 8px;font-size:.6rem" onclick="App.${isManager ? 'demoteManager' : 'promoteManager'}('${uid}')">${isManager ? 'Demote' : 'Promote'}</button>` : '';
				const avHtml = m.avatar ? `<img src="${escH(m.avatar)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : (m.name || '?')[0].toUpperCase();
				return `<div class="member-row"><div class="member-av">${avHtml}</div><div style="flex:1;min-width:0"><div style="font-size:.82rem;font-weight:500">${escH(m.name || 'Member')}${isMe ? ' <span style="opacity:.45">(you)</span>' : ''}</div>${badge}</div>${action}</div>`;
			}).join('');
		} else {
			const members = [...sess.peers.entries()];
			cm.innerHTML = `<div style="font-size:.82rem;color:var(--dim);line-height:1.8">` + (members.length ? members.map(([, p]) => `<div>👤 ${escH(p.name)}</div>`).join('') + `<div>👤 ${escH(S.displayName)} (you)</div>` : `<div>👤 ${escH(S.displayName)} (you)</div>`) + `</div>`;
		}
	}
	const db = el('ciDisconnectBtn'); if (db) db.textContent = sess.connected ? 'Disconnect' : 'Reconnect';
	el('chatInfoOverlay')?.classList.add('open');
}
