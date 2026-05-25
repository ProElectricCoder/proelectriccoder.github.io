/*
Generates an optimized, eased CSS linear-gradient string.
 • Supports Hex (6/8 digit) and Alpha.
 • Logic: Single-pass generation that only commits stops when the curve deviates from a linear path.
 • Result: Clean, minimal CSS payload with maximum performance.
*/
// “Created by Gemini 3.1 Flash and ChatGPT GPT-5.3 Instant” - ProElectricCoder
export function cubicGradient({
	direction = "to right",
	start = "#000044",
	end = "#00000000",
	steps = 10,
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

	// Helper to calculate state at a specific T
	const getStop = (t) => {
		const eased = Math.pow(t, power);
		return {
			t,
			r: Math.round(c1.r + (c2.r - c1.r) * eased),
			g: Math.round(c1.g + (c2.g - c1.g) * eased),
			b: Math.round(c1.b + (c2.b - c1.b) * eased),
			a: parseFloat((c1.a + (c2.a - c1.a) * eased).toFixed(3))
		};
	};

	// --- Optimized Single-Pass Generation ---
	const optimized = [getStop(sortedT[0])];

	for (let i = 1; i < sortedT.length - 1; i++) {
		const prev = optimized[optimized.length - 1];
		const curr = getStop(sortedT[i]);
		const next = getStop(sortedT[i + 1]);

		// Calculate the linear intersection for current point relative to prev and next
		const segmentT = (curr.t - prev.t) / (next.t - prev.t);
		
		const isLinear = ['r', 'g', 'b', 'a'].every(ch => {
			const interp = prev[ch] + (next[ch] - prev[ch]) * segmentT;
			return Math.abs(curr[ch] - interp) < 0.5; // Threshold for color change
		});

		// Only push if the current point isn't just a straight line between the points we're actually keeping
		if (!isLinear) {
			optimized.push(curr);
		}
	}
	
	// Always add the final stop
	optimized.push(getStop(sortedT[sortedT.length - 1]));

	// Final string construction
	const stops = optimized.map(s => {
		const colorStr = `rgba(${s.r}, ${s.g}, ${s.b}, ${s.a})`;
		return `${colorStr} ${(s.t * 100).toFixed(2)}%`;
	});

	return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

/*
USAGE EXAMPLE:

import { cubicGradient } from 'https://proelectriccoder.github.io/ElectronCSS/CubicGradient.js';

const smoothBackground = cubicGradient({
    direction: 'to bottom',
    start: '#1a2a6c',
    end: '#00000000',
    steps: 12,
    power: 3
});

document.body.style.background = smoothBackground;
*/
