// ── DOM rendering & lightweight animation for the Getaway table ─────────
// Reused as-is by Local, Host, and Guest modes: whoever owns S.localSeatIdx
// on this particular browser gets the interactive hand row; everyone else
// is just rendered from whatever's currently in S.
import { S } from './state.js';
import { SUIT_META, RANK_LABEL, sortHand } from './deck.js';

function $(id) { return document.getElementById(id); }

export function escapeHtml(s) {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Seat geometry: the local seat sits fixed at the bottom, the rest
// sweep clockwise around an ellipse. ────────────────────────────────────
function seatPos(i, n) {
	const thetaDeg = 90 - i * (360 / n);
	const theta = thetaDeg * Math.PI / 180;
	const rx = 44, ry = 39;
	return { x: 50 + rx * Math.cos(theta), y: 50 + ry * Math.sin(theta) };
}

function seatAvatarFallback(p, i) {
	if (i === S.localSeatIdx) return '★';
	if (p.kind === 'bot') return '🤖';
	return '👤';
}

// Shared avatar markup for any circular frame (.seat-av, .lobby-seat-av,
// .mini-avatar — each just needs position:relative + overflow:hidden in
// CSS). The fallback (letter/emoji) sits in normal flow; a photo, if
// present, layers on top via .av-img and just removes itself on a load
// error, letting the fallback show through underneath — no inline-string
// escaping tricks needed either way.
export function avatarHtml(url, fallback) {
	if (!url) return fallback;
	const img = `<img src="${escapeHtml(url)}" alt="" class="av-img" referrerpolicy="no-referrer" onerror="this.remove()">`;
	return fallback + img;
}

function seatCardCount(p) {
	return p.handKnown ? p.hand.length : (p.count || 0);
}

// ── Full table build (called once per game start) ───────────────────────
export function renderTable() {
	const seatsLayer = $('seats'); if (!seatsLayer) return;
	seatsLayer.innerHTML = '';
	const n = S.numPlayers;
	S.players.forEach((p, i) => {
		const { x, y } = seatPos(i, n);
		const seat = document.createElement('div');
		seat.className = `seat seat-${p.kind}` + (i === S.localSeatIdx ? ' seat-local' : '');
		seat.id = 'seat-' + i;
		seat.style.left = x + '%';
		seat.style.top = y + '%';
		seat.innerHTML = `
			<div class="seat-av">${avatarHtml(p.avatarUrl, seatAvatarFallback(p, i))}</div>
			<div class="seat-name">${escapeHtml(p.name)}</div>
			<div class="seat-count">${seatCardCount(p)} 🂠</div>
		`;
		seatsLayer.appendChild(seat);
	});
	const pile = $('trickPile'); if (pile) pile.innerHTML = '';
	renderDiscardCounter();
	renderHumanHand([]);
}

export function setActiveSeat(idx) {
	document.querySelectorAll('.seat').forEach(s => s.classList.remove('seat-active'));
	if (idx >= 0) $('seat-' + idx)?.classList.add('seat-active');
}

export function setHeaderStatus(text) {
	const e = $('hdrStatus'); if (e) e.textContent = text;
}

export function setPrompt(text) {
	const e = $('prompt'); if (e) e.textContent = text;
}

// ── Board refresh: seat counts + human hand + discard badge (cheap,
// used constantly instead of a full renderTable rebuild). ──────────────
export function refreshBoard() {
	S.players.forEach((p, i) => {
		const seat = $('seat-' + i); if (!seat) return;
		const countEl = seat.querySelector('.seat-count');
		const finish = S.finishOrder.find(f => f.idx === i);
		const n = seatCardCount(p);
		if (countEl) countEl.textContent = n > 0 ? `${n} 🂠` : (finish ? `#${finish.place} 🎉` : '…');
		seat.classList.toggle('seat-out', n === 0);
	});
	renderHumanHand([]);
	renderDiscardCounter();
}

function renderDiscardCounter() {
	const e = $('discardCount'); if (e) e.textContent = S.discardCount;
}

// ── Card markup ─────────────────────────────────────────────────────
// Traditional pip layout per rank: [xPercent, yPercent, rotationDeg].
// Bottom-half pips get rot:180 so the card reads correctly either way up,
// exactly like a real deck.
const PIP_LAYOUTS = {
	2:  [[50, 16, 0], [50, 84, 180]],
	3:  [[50, 16, 0], [50, 50, 0], [50, 84, 180]],
	4:  [[25, 16, 0], [75, 16, 0], [25, 84, 180], [75, 84, 180]],
	5:  [[25, 16, 0], [75, 16, 0], [50, 50, 0], [25, 84, 180], [75, 84, 180]],
	6:  [[25, 16, 0], [75, 16, 0], [25, 50, 0], [75, 50, 0], [25, 84, 180], [75, 84, 180]],
	7:  [[25, 16, 0], [75, 16, 0], [50, 32, 0], [25, 50, 0], [75, 50, 0], [25, 84, 180], [75, 84, 180]],
	8:  [[25, 16, 0], [75, 16, 0], [50, 32, 0], [25, 50, 0], [75, 50, 0], [50, 68, 180], [25, 84, 180], [75, 84, 180]],
	9:  [[25, 13, 0], [75, 13, 0], [25, 37, 0], [75, 37, 0], [50, 50, 0], [25, 63, 180], [75, 63, 180], [25, 87, 180], [75, 87, 180]],
	10: [[25, 13, 0], [75, 13, 0], [50, 26, 0], [25, 39, 0], [75, 39, 0], [25, 61, 180], [75, 61, 180], [50, 74, 180], [25, 87, 180], [75, 87, 180]],
};

export function renderCard(card, variant) {
	const meta = SUIT_META[card.suit];
	const rank = card.rank;
	const rankLabel = RANK_LABEL[rank];

	let center;
	if (rank === 14) {
		center = `<span class="pip ace-pip" style="color:${meta.color}">${meta.symbol}</span>`;
	} else if (rank >= 11) {
		center = `<div class="face-frame" style="border-color:${meta.color}">
			<span class="face-suit-corner tl" style="color:${meta.color}">${meta.symbol}</span>
			<span class="face-letter" style="color:${meta.color}">${rankLabel}</span>
			<span class="face-suit-corner br" style="color:${meta.color}">${meta.symbol}</span>
		</div>`;
	} else {
		center = (PIP_LAYOUTS[rank] || []).map(([x, y, rot]) =>
			`<span class="pip" style="left:${x}%;top:${y}%;color:${meta.color};transform:translate(-50%,-50%) rotate(${rot}deg)">${meta.symbol}</span>`,
		).join('');
	}

	const idx = `<span class="idx-rank">${rankLabel}</span><span class="idx-suit">${meta.symbol}</span>`;
	const cls = ['card'];
	if (variant === 'pile') cls.push('card-sm');
	if (variant === 'hand-playable') cls.push('card-playable');
	if (variant === 'hand-disabled') cls.push('card-disabled');
	const click = variant === 'hand-playable' ? ` onclick="CardsApp.humanPlay('${card.id}')"` : '';
	return `<div class="${cls.join(' ')}" data-card-id="${card.id}"${click}>
		<div class="card-idx tl" style="color:${meta.color}">${idx}</div>
		<div class="card-center">${center}</div>
		<div class="card-idx br" style="color:${meta.color}">${idx}</div>
	</div>`;
}

export function renderHumanHand(legalCards) {
	const wrap = $('humanHand'); if (!wrap) return;
	const legalIds = new Set(legalCards.map(c => c.id));
	const me = S.players[S.localSeatIdx];
	const hand = sortHand(me?.hand || []);
	if (!hand.length) {
		wrap.innerHTML = S.phase === 'gameOver' || !me
			? ''
			: '<div class="hand-empty">You&rsquo;re out — nothing left to play. 🎉</div>';
		return;
	}
	wrap.innerHTML = hand.map(c => renderCard(c, legalIds.has(c.id) ? 'hand-playable' : 'hand-disabled')).join('');
}

// ── Trick pile: play-in / fly-out animation ─────────────────────────
export function animatePlay(playerIdx, card) {
	const pile = $('trickPile'); if (!pile) return;
	const i = S.trick.plays.length - 1;
	const wrap = document.createElement('div');
	wrap.className = 'pile-card-wrap';
	wrap.style.setProperty('--i', i >= 0 ? i : 0);
	const anim = document.createElement('div');
	anim.className = 'pile-card-anim pile-card-in';
	anim.innerHTML = renderCard(card, 'pile') + `<div class="pile-card-name">${escapeHtml(S.players[playerIdx]?.name || '')}</div>`;
	wrap.appendChild(anim);
	pile.appendChild(wrap);
	refreshBoard();
}

function flyPileTo(targetEl) {
	const pile = $('trickPile'); if (!pile) return;
	let dir = { dx: 0, dy: 60 };
	if (targetEl) {
		const a = pile.getBoundingClientRect(), b = targetEl.getBoundingClientRect();
		const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
		const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
		const dist = Math.hypot(dx, dy) || 1;
		const scale = Math.min(1, 160 / dist);
		dir = { dx: dx * scale, dy: dy * scale };
	}
	pile.querySelectorAll('.pile-card-anim').forEach(el => {
		el.style.setProperty('--dx', dir.dx + 'px');
		el.style.setProperty('--dy', dir.dy + 'px');
		el.classList.add('pile-card-out');
	});
	setTimeout(() => { pile.innerHTML = ''; }, 420);
}

export function animatePickup(playerIdx) { flyPileTo($('seat-' + playerIdx)); }
export function animateDiscard() { flyPileTo($('discardPileIndicator')); setTimeout(renderDiscardCounter, 420); }

// ── Log ───────────────────────────────────────────────────────────
export function renderLog() {
	const log = $('logFeed'); if (!log) return;
	log.innerHTML = S.log.slice(-60).map(m => `<div class="log-line">${escapeHtml(m)}</div>`).join('');
	log.scrollTop = log.scrollHeight;
}

// ── Game over ─────────────────────────────────────────────────────
export function showGameOver(loser) {
	const modal = $('gameOverModal'); if (!modal) return;
	const rows = [...S.finishOrder].sort((a, b) => a.place - b.place)
		.map(f => `<li>#${f.place} — ${escapeHtml(S.players[f.idx]?.name || '?')}${f.idx === S.localSeatIdx ? ' (you)' : ''}</li>`).join('');
	const loserRow = loser
		? `<li class="loser-line">🫳 Stuck with the pile — ${escapeHtml(loser.name)}${loser.idx === S.localSeatIdx ? ' (you)' : ''}</li>`
		: '';
	$('standingsList').innerHTML = rows + loserRow;
	$('gameOverTitle').textContent = loser && loser.idx === S.localSeatIdx
		? 'You got stuck! 🫳'
		: (loser ? `${loser.name} got stuck!` : 'Everyone made it out!');
	modal.classList.add('open');
}

// ── Lobby (online mode) ──────────────────────────────────────────────
export function renderLobby({ roomId, maxSeats, seats, isHost, started }) {
	const eyebrow = $('lobbyEyebrow'), title = $('lobbyRoomId'), list = $('lobbySeats');
	if (eyebrow) eyebrow.textContent = isHost ? 'Hosting' : 'Joined';
	if (title) title.textContent = roomId || '—';
	if (list) {
		const rows = [];
		for (let i = 0; i < maxSeats; i++) {
			const seat = seats.find(s => s.idx === i);
			if (!seat) { rows.push('<div class="lobby-seat empty">Open — bot will fill in</div>'); continue; }
			const label = escapeHtml(seat.name) + (seat.kind === 'local' && isHost && i === 0 ? ' (host)' : '');
			const cls = seat.kind === 'local' ? 'lobby-seat filled me' : 'lobby-seat filled';
			const av = avatarHtml(seat.avatarUrl, seat.kind === 'local' ? '★' : '👤');
			rows.push(`<div class="${cls}"><span class="lobby-seat-av">${av}</span>${label}</div>`);
		}
		list.innerHTML = rows.join('');
	}
	$('lobbyStartBtn')?.classList.toggle('hidden', !isHost || started);
	$('lobbyWaitMsg')?.classList.toggle('hidden', isHost);
}
