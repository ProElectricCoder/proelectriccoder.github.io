/*
ElectronCSS - FireStorm v6.3.0
Generates randomized trapezoidal color strips across a container to create a chaotic dynamic flame/energy backdrop.
 • Supports deterministic rendering with optional seeds.
 • Supports Hex (3/4/6/8 digit) and Alpha.
 • Symmetrical color progression starting from both sides and meeting in the middle.
 • Outputs a clean, direct-invocation API with automatic element containment.
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
	direction = "to right",
	from,
	to,
	start,
	end,
	steps = 8,
	chaos = 0.6,
	seed,
	target = 'body',
	smoothing = 12
} = {}) {
	// Handle robust parameter alias fallbacks (from/to vs start/end)
	const finalFrom = from || start || "#ff0";
	const finalTo = to || end || "#f00";
	if (!finalFrom || !finalTo) throw new Error('FireStorm: `from` and `to` colors required');

	// Parse direction to orient the strips correctly
	let isVerticalProgression = false;
	let isReverse = false;

	const dirStr = String(direction).toLowerCase().trim();
	if (dirStr.includes('bottom')) {
		isVerticalProgression = true;
	} else if (dirStr.includes('top')) {
		isVerticalProgression = true;
		isReverse = true;
	} else if (dirStr.includes('left')) {
		isReverse = true;
	} else if (dirStr.includes('deg')) {
		const deg = parseFloat(dirStr);
		const norm = ((deg % 360) + 360) % 360;
		if (norm > 135 && norm <= 225) { // ~180deg (to bottom)
			isVerticalProgression = true;
		} else if (norm > 225 && norm <= 315) { // ~270deg (to left)
			isReverse = true;
		} else if (norm > 315 || norm <= 45) { // ~0deg (to top)
			isVerticalProgression = true;
			isReverse = true;
		}
	}

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
		
		// Contain absolutely positioned child elements and hide overflow spills
		container.style.position = 'relative';
		container.style.overflow = 'hidden';
	}

	// 2. Clear previous run
	container.innerHTML = '';

	// 3. Base gradient starts from sides (from) and meets in the middle (to)
	container.style.background = `linear-gradient(${direction}, ${finalFrom}, ${finalTo} 50%, ${finalFrom})`;

	// 4. Generate trapezoid strips
	const mid = (steps - 1) / 2;

	for (let i = 0; i < steps; i++) {
		// Calculate symmetrical position-based color T (0 at sides, 1 in middle)
		const symT = mid === 0 ? 0 : 1 - Math.abs(i - mid) / mid;
		const colorT = seed ? symT : random();
		const color = lerpColor(finalFrom, finalTo, colorT);

		// Two different angles per strip, but edges won't cross themselves
		const angleA = 90 + (random() - 0.5) * 20 * chaos;
		const angleB = 90 + (random() - 0.5) * 20 * chaos;
		
		// Convert angle to offset
		const offsetA = Math.tan((angleA - 90) * Math.PI / 180) * 50;
		const offsetB = Math.tan((angleB - 90) * Math.PI / 180) * 50;

		// Calculate logical progression placement considering reversed axes
		const x = (isReverse ? (steps - 1 - i) : i) / steps * 100;
		const thickness = 100 / steps * (1 + random() * 0.3 * chaos); // overlap for blending

		// Swap coordinates depending on whether the gradient is vertical or horizontal
		const clipPath = isVerticalProgression 
			? `polygon(
				0% ${x + offsetA}%, 
				100% ${x + offsetB}%, 
				100% ${x + thickness + offsetB}%, 
				0% ${x + thickness + offsetA}%
			)`
			: `polygon(
				${x + offsetA}% 0%, 
				${x + thickness + offsetA}% 0%, 
				${x + thickness + offsetB}% 100%, 
				${x + offsetB}% 100%
			)`;

		const strip = document.createElement('div');
		strip.style.cssText = `
			position: absolute;
			inset: 0;
			background: ${color};
			mix-blend-mode: screen;
			opacity: 0.8;
			clip-path: ${clipPath};
		`;
		container.appendChild(strip);
	}

	// 4.5 Add full smoothing blur overlay
	if (smoothing > 0) {
		const blurOverlay = document.createElement('div');
		blurOverlay.style.cssText = `
			position: absolute;
			inset: 0;
			pointer-events: none;
			backdrop-filter: blur(${smoothing}px);
			-webkit-backdrop-filter: blur(${smoothing}px);
		`;
		container.appendChild(blurOverlay);
	}

	// 5. Return destroy function
	return () => container.remove();
}
