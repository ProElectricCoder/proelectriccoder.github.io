/*
Generates an optimized, eased CSS linear-gradient string and exposes raw SVG/canvas data.
 • Supports Hex (6/8 digit) and Alpha.
 • Logic: Single-pass generation that only commits stops when the curve deviates.
 • Output: A "smart object" that automatically acts as a CSS string, but contains raw data properties.
*/
// “Created by Gemini 3.1 Pro and ChatGPT 5.3 Instant” - ProElectricCoder
export function cubicGradient({
	direction = "to right",
	start = "#000044",
	end = "#00000000",
	steps = 32,
	power = 3
} = {}) {

	// --- Helpers ---
	function parseHex(hex) {
		const h = hex.replace('#', '');
		return {
			r: parseInt(h.substring(0, 2), 16),
			g: parseInt(h.substring(2, 4), 16),
			b: parseInt(h.substring(4, 6), 16),
			a: h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1
		};
	}

	const c1 = parseHex(start);
	const c2 = parseHex(end);

	const getTFromEased = (eased) => Math.pow(eased, 1 / power);

	const transitionPoints = new Set([0, 1]); 
	const channels = ['r', 'g', 'b', 'a'];

	// 1. Generate all theoretical candidate points based on color delta
	channels.forEach(ch => {
		const startVal = c1[ch];
		const endVal = c2[ch];
		const diff = Math.abs(endVal - startVal);

		if (diff > 0) {
			const colorSteps = Math.min(diff > 1 ? diff : 255, steps);
			for (let i = 1; i < colorSteps; i++) {
				transitionPoints.add(getTFromEased(i / colorSteps));
			}
		}
	});

	const sortedT = Array.from(transitionPoints).sort((a, b) => a - b);
	const totalCandidates = sortedT.length; // Store the initial evaluation count

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

	// --- 2. Optimized Single-Pass Generation ---
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

	// --- 3. Final Object Formatting ---
	
	// Map to the exact raw object format requested
	const formattedStops = optimized.map(s => ({
		t: Number(s.t.toFixed(4)),
		r: Math.round(s.r),
		g: Math.round(s.g),
		b: Math.round(s.b),
		a: Number(s.a.toFixed(3))
	}));

	// Build the CSS string
	const cssStops = formattedStops.map(s => {
		const colorStr = `rgba(${s.r}, ${s.g}, ${s.b}, ${s.a})`;
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
