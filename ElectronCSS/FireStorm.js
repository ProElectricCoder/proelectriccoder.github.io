/*
ElectronCSS - FireStorm v6.1.0
Generates randomized trapezoidal color strips across a container to create a chaotic dynamic flame/energy backdrop.
 • Supports deterministic rendering with optional seeds.
 • Supports Hex (3/4/6/8 digit) and Alpha.
 • Outputs a clean, direct-invocation API.
*/
// “Created with Gemini 3.1 Pro” - ProElectricCoder

// --- Helper Classes & Functions ---

// Simple seeded RNG so `seed` param gives deterministic output
class SeededRandom {
	constructor(seed) {
		this.seed = this._hash(seed);
	}
	_hash(str) {
		let h = 2166136261 >>> 0;
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		return h >>> 0;
	}
	next() {
		// xorshift32
		let t = this.seed += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
}

// Parse #RRGGBBAA, #RRGGBB, #RGBA, or #RGB to [r,g,b,a]
function hexToRgba(hex) {
	let h = hex.replace('#', '');
	if (h.length === 3 || h.length === 4) {
		h = h.split('').map(c => c + c).join('');
	}
	return [
		parseInt(h.substring(0, 2), 16),
		parseInt(h.substring(2, 4), 16),
		parseInt(h.substring(4, 6), 16),
		h.length === 8 ? parseInt(h.substring(6, 8), 16) : 255
	];
}

const toHex = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');

// Linear interpolate between two colors supporting full alpha
function lerpColor(hexA, hexB, t) {
	const [r1, g1, b1, a1] = hexToRgba(hexA);
	const [r2, g2, b2, a2] = hexToRgba(hexB);
	const r = r1 + (r2 - r1) * t;
	const g = g1 + (g2 - g1) * t;
	const b = b1 + (b2 - b1) * t;
	const a = a1 + (a2 - a1) * t;
	return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
}

// --- Main Module Export ---

export function fireStorm({
	from = "#ff0",
	to = "#f00",
	steps = 8,
	chaos = 0.6,
	seed,
	target = 'body'
} = {}) {
	if (!from || !to) throw new Error('FireStorm: `from` and `to` colors required');

	const ID = 'electroncss-firestorm';
	const rng = seed ? new SeededRandom(String(seed)) : Math;
	const random = seed ? () => rng.next() : () => Math.random();

	// 1. Get or create container
	let container;
	if (target === 'body' || target === document.body) {
		container = document.getElementById(ID);
		if (!container) {
			container = document.createElement('div');
			container.id = ID;
			container.style.cssText = `
				position: fixed;
				inset: 0;
				z-index: -1;
				pointer-events: none;
				overflow: hidden;
			`;
			document.body.prepend(container);
		}
	} else {
		container = typeof target === 'string' ? document.querySelector(target) : target;
		if (!container) throw new Error(`FireStorm: target "${target}" not found`);
	}

	// 2. Clear previous run
	container.innerHTML = '';

	// 3. Base gradient so gaps between strips still blend
	container.style.background = `linear-gradient(90deg, ${from}, ${to})`;

	// 4. Generate trapezoid strips
	for (let i = 0; i < steps; i++) {
		const t = i / Math.max(1, steps - 1);
		// If no seed, pick color randomly between from/to. If seed, use position.
		const colorT = seed ? t : random();
		const color = lerpColor(from, to, colorT);

		// Two different angles per strip, but edges won't cross themselves
		const topAngle = 90 + (random() - 0.5) * 20 * chaos;
		const bottomAngle = 90 + (random() - 0.5) * 20 * chaos;
		
		// Convert angle to horizontal offset at top/bottom of 100vh
		const topOffset = Math.tan((topAngle - 90) * Math.PI / 180) * 50;
		const bottomOffset = Math.tan((bottomAngle - 90) * Math.PI / 180) * 50;

		const x = i / steps * 100;
		const width = 100 / steps * (1 + random() * 0.3 * chaos); // overlap for blending

		const strip = document.createElement('div');
		strip.style.cssText = `
			position: absolute;
			inset: 0;
			background: ${color};
			mix-blend-mode: screen;
			opacity: 0.8;
			clip-path: polygon(
				${x + topOffset}% 0%, 
				${x + width + topOffset}% 0%, 
				${x + width + bottomOffset}% 100%, 
				${x + bottomOffset}% 100%
			);
		`;
		container.appendChild(strip);
	}

	// 5. Return destroy function
	return () => container.remove();
}