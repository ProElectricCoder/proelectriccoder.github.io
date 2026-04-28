/**
 * Generates an optimized, eased CSS linear-gradient string.
 * - Supports Hex (6/8 digit) and Alpha.
 * - Logic: Only adds stops when a color channel actually changes value.
 * - Result: Maximum visual fidelity with the minimum possible CSS length.
 */
export function cubicGradient({
    direction = "to right",
    start = "#000044",
    end = "#00000000",
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

    /**
     * Finds the 't' value (0-1) for a specific eased value.
     * Inverse of Math.pow(t, power)
     */
    const getTFromEased = (eased) => Math.pow(eased, 1 / power);

    const stops = [];
    const seenColors = new Set();

    // We want to find every 't' where any RGBA channel hits a new integer value.
    // Instead of looping through 'steps', we loop through the possible color range (0-255).
    const channels = ['r', 'g', 'b', 'a'];
    const transitionPoints = new Set([0, 1]); // Always include start and end

    channels.forEach(ch => {
        const startVal = c1[ch];
        const endVal = c2[ch];
        const diff = endVal - startVal;

        if (Math.abs(diff) > 0) {
            // For RGBA 0-255 (or 0-1 for alpha)
            const range = ch === 'a' ? 255 : Math.abs(diff);
            for (let i = 0; i <= range; i++) {
                const eased = i / range;
                transitionPoints.add(getTFromEased(eased));
            }
        }
    });

    // Sort the points and generate the CSS stops
    const sortedPoints = Array.from(transitionPoints).sort((a, b) => a - b);

    sortedPoints.forEach(t => {
        const eased = Math.pow(t, power);
        
        const r = Math.round(c1.r + (c2.r - c1.r) * eased);
        const g = Math.round(c1.g + (c2.g - c1.g) * eased);
        const b = Math.round(c1.b + (c2.b - c1.b) * eased);
        const a = (c1.a + (c2.a - c1.a) * eased);

        // Create a unique key for this color to skip duplicates
        const colorKey = `${r},${g},${b},${a.toFixed(3)}`;
        
        if (!seenColors.has(colorKey)) {
            const colorStr = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
            const position = (t * 100).toFixed(2);
            stops.push(`${colorStr} ${position}%`);
            seenColors.add(colorKey);
        }
    });

    return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

/**
 * This approach is "Perfect Sampling":
 * It ignores the 'steps' parameter entirely because it mathematically
 * determines exactly when a stop is needed based on the color delta.
 */
