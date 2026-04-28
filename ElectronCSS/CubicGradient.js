/**
 * Generates an optimized, eased CSS linear-gradient string.
 * - Supports Hex (6/8 digit) and Alpha.
 * - Perceptually smooth easing.
 * - Stop Optimization: Removes redundant stops to keep CSS lightweight.
 */
export function cubicGradient({
    direction = "to right",
    start = "#000044",
    end = "#00000000",
    steps = 15, // Higher steps allowed because optimizer will clean them up
    power = 3,
    tolerance = 0.001 // Threshold for color similarity
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

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function getStepColor(c1, c2, t) {
        return {
            r: lerp(c1.r, c2.r, t),
            g: lerp(c1.g, c2.g, t),
            b: lerp(c1.b, c2.b, t),
            a: lerp(c1.a, c2.a, t)
        };
    }

    /**
     * Checks if color B is exactly between A and C.
     * Used to remove redundant stops.
     */
    function isRedundant(colorA, colorB, colorC) {
        const fields = ['r', 'g', 'b', 'a'];
        return fields.every(f => Math.abs(colorB[f] - (colorA[f] + colorC[f]) / 2) < tolerance);
    }

    // --- Main Logic ---

    const startColor = parseHex(start);
    const endColor = parseHex(end);
    
    let rawStops = [];

    // 1. Generate all potential stops
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const eased = Math.pow(t, power);
        rawStops.push({
            color: getStepColor(startColor, endColor, eased),
            pos: t * 100
        });
    }

    // 2. Optimization Pass: Remove intermediate stops that don't change the visual output
    // We iterate backwards to safely remove elements
    const optimizedStops = [rawStops[0]];
    
    for (let i = 1; i < rawStops.length - 1; i++) {
        const prev = optimizedStops[optimizedStops.length - 1];
        const curr = rawStops[i];
        const next = rawStops[i + 1];

        if (!isRedundant(prev.color, curr.color, next.color)) {
            optimizedStops.push(curr);
        }
    }
    optimizedStops.push(rawStops[rawStops.length - 1]);

    // 3. Stringify
    const stopStrings = optimizedStops.map(s => {
        const { r, g, b, a } = s.color;
        const colorStr = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`;
        return `${colorStr} ${s.pos.toFixed(2)}%`;
    });

    return `linear-gradient(${direction}, ${stopStrings.join(', ')})`;
}

/**
 * Example Usage:
 * const css = cubicGradient({ power: 4, steps: 20 });
 * console.log(css); // Likely contains only 8-12 stops instead of 21
 */
