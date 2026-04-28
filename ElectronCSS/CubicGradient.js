/*
Generates an optimized, eased CSS linear-gradient string.
 • Supports Hex (6/8 digit) and Alpha.
 • Logic: Identifies exact color change points but limits density via "steps".
 • Result: High visual fidelity with a controlled CSS length.
*/
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

	/*
	 • Finds the 't' value (0-1) for a specific eased value.
	 • Inverse of Math.pow(t, power)
	*/
	const getTFromEased = (eased) => Math.pow(eased, 1 / power);

	const transitionPoints = new Set([0, 1]); 
	const channels = ['r', 'g', 'b', 'a'];

	channels.forEach(ch => {
		const startVal = c1[ch];
		const endVal = c2[ch];
		const diff = Math.abs(endVal - startVal);

		if (diff > 0) {
			// We find how many color steps we actually want to show.
			// If the color delta is 255 but steps is 10, we only sample 10 points.
			const colorSteps = Math.min(diff > 1 ? diff : 255, steps);
			
			for (let i = 1; i < colorSteps; i++) {
				const eased = i / colorSteps;
				transitionPoints.add(getTFromEased(eased));
			}
		}
	});

	// Sort the points and generate the CSS stops
	const sortedPoints = Array.from(transitionPoints).sort((a, b) => a - b);

	const stops = [];
	const seenColors = new Set();

	sortedPoints.forEach(t => {
		const eased = Math.pow(t, power);
		
		const r = Math.round(c1.r + (c2.r - c1.r) * eased);
		const g = Math.round(c1.g + (c2.g - c1.g) * eased);
		const b = Math.round(c1.b + (c2.b - c1.b) * eased);
		const a = (c1.a + (c2.a - c1.a) * eased);

		// Round alpha for string comparison to prevent tiny float jitter
		const aFixed = parseFloat(a.toFixed(3));
		const colorKey = `${r},${g},${b},${aFixed}`;
		
		if (!seenColors.has(colorKey)) {
			const colorStr = `rgba(${r}, ${g}, ${b}, ${aFixed})`;
			const position = (t * 100).toFixed(2);
			stops.push(`${colorStr} ${position}%`);
			seenColors.add(colorKey);
		}
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
