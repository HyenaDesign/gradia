// Matching is exact after normalization: no substring or edit-distance guesses.
export function normalizeName(value) {
    return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
        .toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
export function normalizeHex(value) {
    const hex = String(value ?? '').trim();
    if (/^#[\da-f]{3}$/i.test(hex)) return '#' + [...hex.slice(1)].map(c => c + c).join('').toUpperCase();
    return /^#[\da-f]{6}$/i.test(hex) ? hex.toUpperCase() : null;
}
export function characterColor(character = 'a') {
    // Original Chromelt mapping, converted to HEX for the preview and texture alike.
    const hue = ((character.toLowerCase().charCodeAt(0) * 137.508) % 360) / 60;
    const chroma = (1 - Math.abs(2 * 0.62 - 1)) * 0.85;
    const x = chroma * (1 - Math.abs(hue % 2 - 1));
    const m = 0.62 - chroma / 2;
    const rgb = hue < 1 ? [chroma,x,0] : hue < 2 ? [x,chroma,0] : hue < 3 ? [0,chroma,x]
        : hue < 4 ? [0,x,chroma] : hue < 5 ? [x,0,chroma] : [chroma,0,x];
    return '#' + rgb.map(v => Math.round((v + m) * 255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
export function normalizeColors(colors, fallback = ['#69A7FF', '#BA9CFF', '#FFD6B0']) {
    const merged = new Map();
    for (const entry of Array.isArray(colors) ? colors : []) {
        const color = typeof entry === 'string' ? {hex:entry} : entry || {};
        const hex = normalizeHex(color.hex);
        const weight = color.weight === undefined ? 1 : Number(color.weight);
        if (!hex || !Number.isFinite(weight) || weight <= 0) continue;
        const previous = merged.get(hex);
        merged.set(hex, {...color, hex, weight:(previous?.weight || 0) + weight});
    }
    if (!merged.size) return normalizeColors(fallback);
    const result = [...merged.values()];
    const total = result.reduce((sum,c) => sum + c.weight,0);
    return result.map(c => ({...c,weight:c.weight/total}));
}
export function colorEntries(hexes, weights) {
    return normalizeColors(hexes.map((hex,i) => ({hex,weight:weights?.[i] ?? 1,role:i===0?'primary':'secondary'})));
}
// Partition actual ink mass, rather than counting glyphs (a W holds more dye than an I).
// Boundaries may cross a glyph, making every color available even for a one-letter input.
export function weightedColumnIndices(columnMass, colors) {
    const total = columnMass.reduce((sum,v) => sum + v,0);
    const palette = normalizeColors(colors);
    const thresholds = [];
    palette.reduce((sum,c) => { thresholds.push(sum+c.weight); return sum+c.weight; },0);
    let consumed = 0, index = 0;
    return Array.from(columnMass, mass => {
        const midpoint = total > 0 ? (consumed + mass/2)/total : 0;
        while (index < palette.length-1 && midpoint >= thresholds[index]) index++;
        consumed += mass;
        return index;
    });
}
export function applyWeightedPalette(ctx, bounds, colors) {
    const palette = normalizeColors(colors);
    const {x,y,width,height} = bounds;
    if (width < 1 || height < 1) return;
    const pixels = ctx.getImageData(x,y,width,height);
    const columns = new Float64Array(width);
    for(let row=0;row<height;row++) for(let col=0;col<width;col++) columns[col] += pixels.data[(row*width+col)*4+3];
    const indices = weightedColumnIndices(columns,palette);
    const rgb = palette.map(c => [1,3,5].map(offset => parseInt(c.hex.slice(offset,offset+2),16)));
    for(let row=0;row<height;row++) for(let col=0;col<width;col++) {
        const offset=(row*width+col)*4;
        const color=rgb[indices[col]];
        pixels.data[offset]=color[0];pixels.data[offset+1]=color[1];pixels.data[offset+2]=color[2];
        // Alpha stays the original glyph mask. Empty canvas receives no dye.
    }
    ctx.putImageData(pixels,x,y);
}
