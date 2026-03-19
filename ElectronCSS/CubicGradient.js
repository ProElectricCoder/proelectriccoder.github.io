// CubicGradient.js
// Generates a CSS linear-gradient string with cubic easing

export function cubicGradient({
  direction = "to right",
  start = "#000044",
  end = "#000000",
  steps = 6,
  power = 3 // cubic by default
} = {}) {

  function ease(t) {
    return Math.pow(t, power);
  }

  const stops = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const eased = ease(t);

    // keep start color longer, then drop quickly
    const position = Math.round(eased * 100);

    stops.push(`${start} ${position}%`);
  }

  // final stop (end color)
  stops.push(`${end} 100%`);

  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}


/*
USAGE:

import { cubicGradient } from './cubic-gradient.js';

const bg = cubicGradient({
  direction: 'to left',
  start: '#000055',
  end: '#000000',
  steps: 8,
  power: 3
});

document.body.style.background = bg;
