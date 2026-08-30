// ── DOM rendering & lightweight animation for the Getaway table ─────────
// Reused as-is by Local, Host, and Guest modes: whoever owns S.localSeatIdx
// on this particular browser gets the interactive hand row; everyone else
// is just rendered from whatever's currently in S.
import { S } from './state.js';
import { cardLabel, SUIT_META, sortHand } from './deck.js';

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

function seatAvatar(p, i) {
	if (i === S.localSeatIdx) return '★';
	if (p.kind === 'bot') return '🤖';
	return '👤';
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
			<div class="seat-av">${seatAvatar(p, i)}</div>
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
function cardHtml(card, variant) {
	const meta = SUIT_META[card.suit];
	const cls = ['card'];
	if (variant === 'pile') cls.push('card-sm');
	if (variant === 'hand-playable') cls.push('card-playable');
	if (variant === 'hand-disabled') cls.push('card-disabled');
	const click = variant === 'hand-playable' ? ` onclick="CardsApp.humanPlay('${card.id}')"` : '';
	return `<div class="${cls.join(' ')}" data-card-id="${card.id}"${click} style="--suit-color:${meta.color}">
		<span class="card-rank">${cardLabel(card).slice(0, -1)}</span><span class="card-suit">${meta.symbol}</span>
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
	wrap.innerHTML = hand.map(c => cardHtml(c, legalIds.has(c.id) ? 'hand-playable' : 'hand-disabled')).join('');
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
	anim.innerHTML = cardHtml(card, 'pile') + `<div class="pile-card-name">${escapeHtml(S.players[playerIdx]?.name || '')}</div>`;
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
			const label = seat ? escapeHtml(seat.name) + (seat.kind === 'local' && isHost && i === 0 ? ' (host)' : '') : 'Open — bot will fill in';
			const cls = seat ? (seat.kind === 'local' ? 'lobby-seat filled me' : 'lobby-seat filled') : 'lobby-seat empty';
			rows.push(`<div class="${cls}">${label}</div>`);
		}
		list.innerHTML = rows.join('');
	}
	$('lobbyStartBtn')?.classList.toggle('hidden', !isHost || started);
	$('lobbyWaitMsg')?.classList.toggle('hidden', isHost);
}