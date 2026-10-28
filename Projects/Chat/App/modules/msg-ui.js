// ── Message UI: action menu, reply/edit bar, poll dialog, click handling ────────────────────────
// One delegated listener on #messages: tap/click a message (or right-click) to open its menu.
import { S } from './state.js';
import { el, escH, toast } from './utils.js';
import { iconSvg } from './icons.js';
import { getActiveSess } from './sessions.js';
import { seenBy } from './receipts.js';
import { voiceClick } from './voice.js';
import {
	REACTIONS, hooks, findMsg, setCompose, clearCompose, toggleReaction, deleteForEveryone, deleteForMe,
	votePoll, closePoll, createPoll, togglePin, toggleStar,
} from './msg-features.js';

let menuEl = null, menuScrollTop = 0;

export function closeMenu() { menuEl?.remove(); menuEl = null; }

function item(act, icon, label, danger = false) {
	return `<button type="button" class="mm-item${danger ? ' danger' : ''}" data-mm="${act}">${iconSvg(icon, 1)}<span>${label}</span></button>`;
}

function openMenu(msgEl, m, sess) {
	closeMenu();
	const canReact = !m.deleted && (m.type === 'text' || m.type === 'file' || m.type === 'poll');
	let h = '';
	if (canReact) h += `<div class="mm-reacts">${REACTIONS.map(([k, label]) => `<button type="button" class="mm-react${m.reactions?.[k]?.me !== undefined ? ' me' : ''}" data-mm-react="${k}" title="${label}">${iconSvg(k, 1.15)}</button>`).join('')}</div>`;
	if (!m.deleted && (m.type === 'text' || m.type === 'file' || m.type === 'poll')) {
		h += item('reply', 'reply', 'Reply');
		h += item('pin', 'bookmark', m.pinned ? 'Unpin from chat' : 'Pin to chat');
		h += item('star', 'star', m.starred ? 'Remove star' : 'Star (only you)');
	}
	if (!m.deleted && m.type === 'text') h += item('copy', 'copy', 'Copy text');
	if (m.mine && !m.deleted && m.type === 'text') h += item('edit', 'pencil', 'Edit');
	if (m.mine && !m.deleted && m.type === 'text' && sess.isGroup) h += item('seen', 'eye', 'Seen by');
	if (m.mine && !m.deleted && m.type === 'poll' && !m.poll?.closed) h += item('closepoll', 'check', 'Close poll');
	h += item('deleteme', 'trash', 'Delete for me', true);
	if (m.mine && !m.deleted) h += item('deleteall', 'trash', 'Delete for everyone', true);
	menuEl = document.createElement('div'); menuEl.className = 'msg-menu'; menuEl.innerHTML = h;
	document.body.appendChild(menuEl);

	menuEl.addEventListener('click', e => {
		const rb = e.target.closest('[data-mm-react]'), ib = e.target.closest('[data-mm]');
		if (rb) { toggleReaction(sess, m, rb.dataset.mmReact); closeMenu(); return; }
		if (!ib) return;
		const act = ib.dataset.mm; closeMenu();
		if (act === 'reply') setCompose(sess, 'reply', m);
		else if (act === 'edit') setCompose(sess, 'edit', m);
		else if (act === 'copy') navigator.clipboard?.writeText(m.content || '').then(() => toast('Copied'), () => toast('Could not copy'));
		else if (act === 'deleteme') deleteForMe(sess, m);
		else if (act === 'deleteall') { if (confirm('Delete this message for everyone in the chat?')) deleteForEveryone(sess, m); }
		else if (act === 'closepoll') closePoll(sess, m);
		else if (act === 'seen') openSeenDialog(m);
		else if (act === 'pin') togglePin(sess, m);
		else if (act === 'star') toggleStar(sess, m);
	});

	// Place it next to the bubble, on the same side, inside the viewport
	const b = (msgEl.querySelector('.msg-bubble') || msgEl).getBoundingClientRect(), mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
	let left = m.mine ? b.right - mw : b.left;
	left = Math.max(8, Math.min(left, innerWidth - mw - 8));
	let top = b.top - mh - 6; if (top < 8) top = Math.min(b.bottom + 6, innerHeight - mh - 8);
	menuScrollTop = el('messages')?.scrollTop || 0;
	menuEl.style.left = left + 'px'; menuEl.style.top = Math.max(8, top) + 'px';
}

export function jumpTo(id) {
	const t = document.querySelector(`#messages [data-msg-id="${String(id).replace(/"/g, '')}"]`);
	if (!t) { toast('Original message is not in this chat'); return; }
	t.scrollIntoView({ block: 'center', behavior: 'smooth' });
	t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
}

function onMessagesClick(e, fromMenuKey) {
	closeMenu();
	if (voiceClick(e)) return;
	const sess = getActiveSess(); if (!sess) return;
	const t = e.target, row = t.closest('.msg[data-msg-id]'); if (!row) return;
	const m = findMsg(sess, row.dataset.msgId);
	const chip = t.closest('.react-chip');
	if (chip && m) { toggleReaction(sess, m, chip.dataset.react); return; }
	const opt = t.closest('.poll-opt');
	if (opt && m) { votePoll(sess, m, Number(opt.dataset.pollOpt)); return; }
	if (t.closest('[data-poll-close]') && m) { closePoll(sess, m); return; }
	const q = t.closest('.msg-quote'); if (q) { jumpTo(q.dataset.replyId); return; }
	if (!m || m.type === 'call' || m.type === 'system') return;
	if (!fromMenuKey && t.closest('a, button, audio, video, iframe, img, input, select, textarea')) return;
	if (!fromMenuKey && String(getSelection?.() || '').length) return;      // user is selecting text
	e.preventDefault?.();
	openMenu(row, m, sess);
}

// ── Reply / edit bar above the input ────────────────────────────────────────────────────────────
export function renderCompose() {
	const bar = el('ctxBar'); if (!bar) return;
	const c = S.compose;
	if (c && c.sessId !== S.activeId) { clearCompose(); return; }
	if (!c) { bar.style.display = 'none'; return; }
	el('ctxIco').innerHTML = iconSvg(c.mode === 'edit' ? 'pencil' : 'reply', 1.1);
	el('ctxTitle').textContent = c.mode === 'edit' ? 'Editing message' : 'Replying to ' + c.sender;
	el('ctxText').textContent = c.text;
	bar.style.display = 'flex';
}

// ── "Seen by" list for my group messages ────────────────────────────────────────────────────────
function openSeenDialog(m) {
	const { read, delivered } = seenBy(m);
	const list = (names, empty) => names.length ? names.map(n => `<div class="sp-row" style="padding:6px 0">${escH(n)}</div>`).join('') : `<div style="font-size:.72rem;color:var(--faint)">${empty}</div>`;
	const o = document.createElement('div'); o.className = 'modal-overlay open';
	o.innerHTML = `<div class="modal-box"><div class="modal-head"><span class="modal-title">Seen by</span><button class="panel-close" type="button" data-sd title="Close">${iconSvg('x', 1)}</button></div>
		<div class="modal-body"><div class="f-lbl">Read (${read.length})</div>${list(read, 'Nobody has read it yet')}
		<div class="f-lbl" style="margin-top:14px">Delivered, not read yet (${delivered.length})</div>${list(delivered, 'None')}
		<div style="font-size:.62rem;color:var(--faint);margin-top:14px">People who turned off read receipts only show as delivered.</div></div></div>`;
	o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-sd]')) o.remove(); });
	document.body.appendChild(o);
}

// ── Poll dialog ─────────────────────────────────────────────────────────────────────────────────
let pollOverlay = null;
export function closePollDialog() { pollOverlay?.remove(); pollOverlay = null; }

export function openPollDialog() {
	const sess = getActiveSess(); if (!sess?.connected) { toast('Not connected'); return; }
	closePollDialog();
	pollOverlay = document.createElement('div'); pollOverlay.className = 'modal-overlay open';
	pollOverlay.innerHTML = `<div class="modal-box"><div class="modal-head"><span class="modal-title">Create poll</span><button class="panel-close" type="button" data-pd="close" title="Close">${iconSvg('x', 1)}</button></div>
		<div class="modal-body"><div class="col" style="gap:12px">
			<div class="f-grp"><div class="f-lbl">Question</div><input class="f-in" id="pdQ" maxlength="200" placeholder="Ask something…"></div>
			<div class="f-grp"><div class="f-lbl">Options</div><div class="col" id="pdOpts" style="gap:6px"></div>
				<button class="btn btn-s" type="button" data-pd="add" id="pdAdd">${iconSvg('plus', 1)} Add option</button></div>
			<div class="sp-row"><span class="sp-label">Allow multiple answers</span><label class="toggle"><input type="checkbox" id="pdMulti"><div class="toggle-track"></div><div class="toggle-thumb"></div></label></div>
			<div style="font-size:.65rem;color:var(--faint)">Votes are visible to everyone and can be changed until the poll is closed.</div>
			<button class="btn btn-p btn-full" type="button" data-pd="create">Create poll</button>
		</div></div></div>`;
	document.body.appendChild(pollOverlay);
	const opts = pollOverlay.querySelector('#pdOpts');
	const addOpt = () => {
		if (opts.children.length >= 10) return;
		const r = document.createElement('div'); r.className = 'row';
		r.innerHTML = `<input class="f-in" maxlength="80" placeholder="Option ${opts.children.length + 1}"><button class="panel-close" type="button" data-pd="rm" title="Remove">${iconSvg('x', .9)}</button>`;
		opts.appendChild(r);
		pollOverlay.querySelector('#pdAdd').style.display = opts.children.length >= 10 ? 'none' : '';
	};
	addOpt(); addOpt();
	pollOverlay.addEventListener('click', async e => {
		if (e.target === pollOverlay) { closePollDialog(); return; }
		const b = e.target.closest('[data-pd]'); if (!b) return;
		const a = b.dataset.pd;
		if (a === 'close') closePollDialog();
		else if (a === 'add') { addOpt(); opts.lastElementChild.querySelector('input').focus(); }
		else if (a === 'rm') { if (opts.children.length > 2) { b.parentElement.remove(); pollOverlay.querySelector('#pdAdd').style.display = ''; } else b.parentElement.querySelector('input').value = ''; }
		else if (a === 'create') {
			const q = pollOverlay.querySelector('#pdQ').value.trim();
			const options = [...new Set([...opts.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean))];
			if (!q) { toast('Add a question'); return; }
			if (options.length < 2) { toast('Add at least two different options'); return; }
			if (await createPoll(sess, { q, options, multi: pollOverlay.querySelector('#pdMulti').checked })) closePollDialog();
		}
	});
	pollOverlay.querySelector('#pdQ').focus();
}

// ── Wiring ──────────────────────────────────────────────────────────────────────────────────────
export function initMsgUI() {
	hooks.composeChanged = renderCompose;
	const c = el('messages'); if (!c) return;
	c.addEventListener('click', e => onMessagesClick(e, false));
	c.addEventListener('contextmenu', e => { if (e.target.closest('.msg[data-msg-id]')) { e.preventDefault(); onMessagesClick(e, true); } });
	// close when the list really scrolls (a stray scroll event from an earlier auto-scroll must not close a fresh menu)
	c.addEventListener('scroll', () => { if (menuEl && Math.abs(c.scrollTop - menuScrollTop) > 8) closeMenu(); }, { passive: true });
	document.addEventListener('click', e => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('#messages')) closeMenu(); });
	document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closePollDialog(); } });
	addEventListener('resize', closeMenu);
}
