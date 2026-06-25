/*
ElectronCSS - CubicGradient v6.0.0
Generates an optimized, eased CSS linear-gradient string and exposes raw SVG/canvas data.
 • Supports Hex (3/4/6/8 digit) and Alpha.
 • Logic: Single-pass generation that only commits stops when the curve deviates.
 • Output: A "smart object" that automatically acts as a CSS string, but contains raw data properties.
*/
// “Created with Gemini 3.1 Pro” - ProElectricCoder
export function cubicGradient({
	direction = "to right",
	start = "#000044",
	end = "#00000000",
	steps = 32,
	power = 3
} = {}) {

	// --- Helpers ---
	function parseHex(hex) {
		let h = hex.replace('#', '');
		// Support 3-digit (#rgb) and 4-digit (#rgba) hex
		if (h.length === 3 || h.length === 4) {
			h = h.split('').map(c => c + c).join('');
		}
		return {
			r: parseInt(h.substring(0, 2), 16),
			g: parseInt(h.substring(2, 4), 16),
			b: parseInt(h.substring(4, 6), 16),
			// Switch alpha to 0-255 scale for easier formatting and threshold checks
			a: h.length === 8 ? parseInt(h.substring(6, 8), 16) : 255
		};
	}

	const c1 = parseHex(start);
	const c2 = parseHex(end);

	// Helper to calculate exact high-precision state at a specific T
	const getStop = (t) => {
		const eased = Math.pow(t, power);
		return {
			t,
			r: c1.r + (c2.r - c1.r) * eased,
			g: c1.g + (c2.g - c1.g) * eased,
			b: c1.b + (c2.b - c1.b) * eased,
			a: c1.a + (c2.a - c1.a) * eased
		};
	};

	// 1. Generate initial points by dividing 1020
	const maxTheoretical = 1020;
	const increment = Math.round(maxTheoretical / steps) || 1;
	const sortedT = [];
	for (let i = 0; i <= maxTheoretical; i += increment) {
		sortedT.push(i / maxTheoretical);
	}
	if (sortedT[sortedT.length - 1] !== 1) sortedT.push(1);

	const totalCandidates = sortedT.length; // Store the initial evaluation count

	// --- 2. Optimized Single-Pass Generation & Simplification ---
	const optimized = [getStop(sortedT[0])];

	for (let i = 1; i < sortedT.length - 1; i++) {
		const prev = optimized[optimized.length - 1];
		const curr = getStop(sortedT[i]);
		const next = getStop(sortedT[i + 1]);

		const segmentT = (curr.t - prev.t) / (next.t - prev.t);
		
		const isLinear = ['r', 'g', 'b', 'a'].every(ch => {
			const interp = prev[ch] + (next[ch] - prev[ch]) * segmentT;
			// Strict threshold check using floating point accuracy
			return Math.abs(curr[ch] - interp) < 0.5; 
		});

		if (!isLinear) {
			optimized.push(curr);
		}
	}
	
	optimized.push(getStop(sortedT[sortedT.length - 1]));

	// --- 2.5 Dynamic Subdivision (Add stops until total = steps) ---
	const getMidpointError = (stopA, stopB) => {
		const midT = (stopA.t + stopB.t) / 2;
		const actualMid = getStop(midT);
		let maxError = 0;
		['r', 'g', 'b', 'a'].forEach(ch => {
			const linearMid = (stopA[ch] + stopB[ch]) / 2;
			const err = Math.abs(actualMid[ch] - linearMid);
			if (err > maxError) maxError = err;
		});
		return { actualMid, maxError };
	};

	while (optimized.length < steps) {
		let highestError = -1;
		let insertIndex = -1;
		let bestMidpoint = null;

		for (let i = 0; i < optimized.length - 1; i++) {
			const { actualMid, maxError } = getMidpointError(optimized[i], optimized[i + 1]);
			if (maxError > highestError) {
				highestError = maxError;
				insertIndex = i + 1;
				bestMidpoint = actualMid;
			}
		}

		if (insertIndex !== -1 && bestMidpoint) {
			optimized.splice(insertIndex, 0, bestMidpoint);
		} else {
			break; // Failsafe
		}
	}

	// --- 3. Final Object Formatting ---
	
	// Map to the exact raw object format requested
	const formattedStops = optimized.map(s => ({
		t: Number(s.t.toFixed(4)),
		r: Math.round(s.r),
		g: Math.round(s.g),
		b: Math.round(s.b),
		a: Math.round(s.a)
	}));

	// Build the CSS string
	const toHex = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
	
	const cssStops = formattedStops.map(s => {
		const colorStr = `#${toHex(s.r)}${toHex(s.g)}${toHex(s.b)}${toHex(s.a)}`;
		return `${colorStr} ${(s.t * 100).toFixed(2)}%`;
	});
	
	const cssString = `linear-gradient(${direction}, ${cssStops.join(', ')})`;

	// Return a Smart Object
	return {
		stops: formattedStops,
		totalCandidates: totalCandidates,
		css: cssString,
		
		// The magic method: When JavaScript expects a string, it calls this.
		toString() {
			return this.css;
		}
	};
}
