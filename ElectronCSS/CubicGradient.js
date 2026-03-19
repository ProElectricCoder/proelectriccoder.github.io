// CubicGradient.js
// Generates a CSS linear-gradient string with cubic easing

export function cubicGradient({
	direction = "to right",
	start = "#000044",
	end = "#000000",
	steps = 8,
	power = 3
} = {}) {

	function ease(t) {
		return Math.pow(t, power);
	}

	function hexToRgb(hex) {
		hex = hex.replace('#', '');
		return {
			r: parseInt(hex.substring(0, 2), 16),
			g: parseInt(hex.substring(2, 4), 16),
			b: parseInt(hex.substring(4, 6), 16)
		};
	}

	function rgbToHex(r, g, b) {
		return (
			'#' +
			[r, g, b]
				.map(x => x.toString(16).padStart(2, '0'))
				.join('')
		);
	}

	function lerp(a, b, t) {
		return Math.round(a + (b - a) * t);
	}

	function mixColors(c1, c2, t) {
		const a = hexToRgb(c1);
		const b = hexToRgb(c2);

		return rgbToHex(
			lerp(a.r, b.r, t),
			lerp(a.g, b.g, t),
			lerp(a.b, b.b, t)
		);
	}

	const stops = [];

	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const eased = ease(t);

		const color = mixColors(start, end, eased);
		const position = Math.round(t * 100);

		stops.push(`${color} ${position}%`);
	}

	return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

// USAGE:
//
// import { cubicGradient } from './cubic-gradient.js';
//
// const bg = cubicGradient({
//	 direction: 'to left',
//	 start: '#000055',
//	 end: '#000000',
//	 steps: 8,
//	 power: 3
// });
//
// document.body.style.background = bg;
