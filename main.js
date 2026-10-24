import * as THREE from 'three';
import { characterColor, applyWeightedPalette } from './colors/colorUtils.js';
import { createExportControls } from './exports.js';
import { createPersonalityControls } from './personalities.js';
import { createPaletteControls } from './colors/paletteControls.js';
import { vertexShader, seedShader, velocityShader, divergenceShader, pressureShader,
    projectionShader, advectionShader, dyeShader, displayShader } from './shaders.js';

const container = document.getElementById('canvas-container');
const input = document.getElementById('keyboardInput');
const meltButton = document.getElementById('meltButton');
const typePrompt = document.getElementById('typePrompt');
const textStatus = document.getElementById('textStatus');
let composing = false;
// Timing and quality are independent of the display resolution.
export const settings = {
    duration: 6.5, typingDelay: 0.8, dyeResolution: 768,
    velocityResolution: 192, pressureIterations: 14, grain: 0.028,
};
const STEP = 1 / 60;
const MAX_LETTERS = 12;
const textCanvas = document.createElement('canvas');
const ctx = textCanvas.getContext('2d', { willReadFrequently: true });
const textTexture = new THREE.CanvasTexture(textCanvas);
textTexture.minFilter = textTexture.magFilter = THREE.LinearFilter;
textTexture.generateMipmaps = false;
const paletteControls = createPaletteControls(() => { updateTextTexture(); restartMelting(); });
function updateTextTexture() {
    const palette = paletteControls.update(input.value);
    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    // GPU texture storage must be recreated when the canvas dimensions change.
    const textureHeight = Math.max(1, Math.round(1536 / aspect));
    if (textCanvas.width !== 1536 || textCanvas.height !== textureHeight) textTexture.dispose();
    textCanvas.width = 1536;
    textCanvas.height = textureHeight;
    ctx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    const characters = Array.from(input.value).slice(0, MAX_LETTERS);
    let fontSize = Math.min(textCanvas.height * 0.53, 410);
    ctx.textBaseline = 'alphabetic';
    const measure = () => {
        ctx.font = `900 ${fontSize}px Arial, sans-serif`;
        return characters.reduce((sum, c) => sum + ctx.measureText(c).width, 0);
    };
    let width = measure();
    if (width > textCanvas.width * 0.8) {
        fontSize *= textCanvas.width * 0.8 / width;
        width = measure();
    }
    const metrics = ctx.measureText(characters.join('') || 'M');
    const baseline = (textCanvas.height + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    // Thin glyphs and portrait canvases need a farther advancing front.
    const simWidth = settings.dyeResolution * Math.min(1, aspect);
    const simHeight = settings.dyeResolution * Math.min(1, 1 / aspect);
    const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const reach = Math.hypot((1 - width / textCanvas.width) * simWidth * 0.5,
        (1 - inkHeight / textCanvas.height) * simHeight * 0.5);
    uniforms.uFillRadius.value = Math.max(6, reach / 27);
    let x = (textCanvas.width - width) / 2;
    for (const character of characters) {
        ctx.fillStyle = palette.type === 'character' ? characterColor(character) : '#FFFFFF';
        ctx.fillText(character, x, baseline);
        x += ctx.measureText(character).width;
    }
    if (palette.type !== 'character' && input.value.trim()) {
        const left = Math.max(0, Math.floor((textCanvas.width - width) / 2) - 8);
        const top = Math.max(0, Math.floor(baseline - metrics.actualBoundingBoxAscent) - 8);
        const right = Math.min(textCanvas.width, Math.ceil((textCanvas.width + width) / 2) + 8);
        const bottom = Math.min(textCanvas.height, Math.ceil(baseline + metrics.actualBoundingBoxDescent) + 8);
        applyWeightedPalette(ctx, {x:left,y:top,width:right-left,height:bottom-top}, palette.colors);
    }
    textTexture.needsUpdate = true;
}
const renderer = new THREE.WebGLRenderer({ antialias: false });
if (!renderer.extensions.has('EXT_color_buffer_float') || !renderer.extensions.has('OES_texture_float_linear')) {
    renderer.dispose(); throw new Error('Floating-point render targets and linear filtering are required.');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
container.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Interactive liquid typography. Move or drag to stir the colors.');
container.style.touchAction = 'none';
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;
const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
scene.add(mesh);
const uniforms = {
    uText: { value: textTexture }, uVelocity: { value: null }, uDye: { value: null },
    uForward: { value: null }, uBackward: { value: null },
    uPressure: { value: null }, uDivergence: { value: null },
    uCanvasSize: { value: new THREE.Vector2() }, uTime: { value: 0 }, uProgress: { value: 0 }, uDt: { value: STEP }, uAspect: { value: 1 },
    uVelocityTexel: { value: new THREE.Vector2() }, uDyeTexel: { value: new THREE.Vector2() },
    uMouse: { value: new THREE.Vector2(-10, -10) }, uMouseFrom: { value: new THREE.Vector2(-10, -10) },
    uMouseVelocity: { value: new THREE.Vector2() }, uDragging: { value: 0 },
    uFillRadius: { value: 6 }, uExpansion: { value: 0 }, uSpread: { value: 0 }, uGrain: { value: settings.grain },
};
Object.assign(uniforms, {
    uFlow: { value: new THREE.Vector4() }, uSubstance: { value: new THREE.Vector4() },
    uMaterial: { value: 0 }, uTransparent: { value: 0 }, uViewScale: { value: new THREE.Vector2(1, 1) },
});
const personalityControls = createPersonalityControls(preset => { applyPersonality(preset); restartMelting(); });
function applyPersonality(preset) {
    uniforms.uFlow.value.fromArray(preset.flow); uniforms.uSubstance.value.fromArray(preset.substance);
    uniforms.uMaterial.value = ['ink', 'silk', 'smoke', 'lava', 'chrome'].indexOf(preset.id);
    settings.grain = preset.grain;
}
applyPersonality(personalityControls.preset);
const material = (fragmentShader) => new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false,
});
const materials = {
    seed: material(seedShader), velocity: material(velocityShader), divergence: material(divergenceShader),
    pressure: material(pressureShader), projection: material(projectionShader),
    advection: material(advectionShader), dye: material(dyeShader), display: material(displayShader),
};
function renderPass(pass, target) {
    mesh.material = pass;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
}
function createTarget(width, height, type = THREE.HalfFloatType) {
    return new THREE.WebGLRenderTarget(width, height, {
        type, format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: false, stencilBuffer: false,
    });
}
let targets;
let dyeIndex = 0;
let elapsed = 0;
let hold = settings.typingDelay;
let accumulator = 0;
let lastTime = performance.now();
let dragging = false;
let pointerInside = false;
let hasInk = input.value.trim().length > 0;
const pointer = new THREE.Vector2(-10, -10);
const lastPointer = new THREE.Vector2(-10, -10);
function clearTarget(target) { renderer.setRenderTarget(target); renderer.clear(); }
function restartMelting(delay = settings.typingDelay) {
    if (!targets) return;
    elapsed = 0; hold = delay; accumulator = 0; dyeIndex = 0;
    hasInk = input.value.trim().length > 0;
    uniforms.uTime.value = 0; uniforms.uProgress.value = 0;
    uniforms.uSpread.value = 0; uniforms.uExpansion.value = 0;
    uniforms.uMouseVelocity.value.set(0, 0);
    lastPointer.copy(pointer);
    for (const target of [...targets.velocity, ...targets.pressure, targets.divergence]) clearTarget(target);
    // The only color entering the simulation is this one-time text seed.
    for (const target of targets.dye) renderPass(materials.seed, target);
    renderDisplay();
}
let resizePending = false;
function resize() {
    if (exporting) { resizePending = true; return; }
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    uniforms.uCanvasSize.value.set(width, height);
    const aspect = width / height;
    const dimensions = (resolution) => [
        Math.max(1, Math.round(resolution * Math.min(1, aspect))),
        Math.max(1, Math.round(resolution * Math.min(1, 1 / aspect))),
    ];
    const [dw, dh] = dimensions(settings.dyeResolution), [vw, vh] = dimensions(settings.velocityResolution);
    if (targets && targets.dye[0].width === dw && targets.dye[0].height === dh) {
        renderDisplay();
        return;
    }
    const previous = targets;
    targets = {
        // Full precision prevents repeated half-float rounding from darkening persistent dye.
        dye: [createTarget(dw, dh, THREE.FloatType), createTarget(dw, dh, THREE.FloatType)],
        velocity: [createTarget(vw, vh), createTarget(vw, vh)],
        pressure: [createTarget(vw, vh), createTarget(vw, vh)],
        divergence: createTarget(vw, vh), forward: createTarget(dw, dh, THREE.FloatType), backward: createTarget(dw, dh, THREE.FloatType),
    };
    uniforms.uAspect.value = aspect;
    uniforms.uDyeTexel.value.set(1 / dw, 1 / dh);
    uniforms.uVelocityTexel.value.set(1 / vw, 1 / vh);
    updateTextTexture();
    // Resize a living composition without discarding the user's fluid state.
    if (previous && elapsed > 0) {
        uniforms.uDye.value = previous.dye[dyeIndex].texture;
        uniforms.uVelocity.value = previous.velocity[0].texture;
        uniforms.uDt.value = 0;
        for (const target of targets.dye) renderPass(materials.advection, target);
        dyeIndex = 0;
        for (const target of [...targets.velocity, ...targets.pressure, targets.divergence]) clearTarget(target);
    } else restartMelting();
    if (previous) for (const target of Object.values(previous).flat()) target.dispose();
    renderDisplay();
}
function updatePointer(event) {
    if (exporting) return;
    const rect = container.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height);
    if (!pointerInside) lastPointer.copy(pointer);
    pointerInside = true;
}
container.addEventListener('pointermove', updatePointer);
container.addEventListener('pointerdown', (event) => {
    if (exporting) return;
    if (document.activeElement.closest('#palettePanel, #exportPanel')) document.activeElement.blur();
    updatePointer(event); dragging = true; container.setPointerCapture(event.pointerId);
});
function releasePointer() { dragging = false; }
container.addEventListener('pointerup', releasePointer);
container.addEventListener('pointercancel', releasePointer);
container.addEventListener('lostpointercapture', releasePointer);
container.addEventListener('pointerleave', () => { if (!dragging) pointerInside = false; });
const smooth = THREE.MathUtils.smoothstep;
function step(dt) {
    if (!hasInk) return;
    if (hold > 0) { hold -= dt; lastPointer.copy(pointer); return; }
    elapsed += dt;
    const duration = Math.max(3, settings.duration);
    const p = Math.min(elapsed / duration, 1);
    // Keep the same material evolution when the transition duration is tuned.
    const simulationDt = dt * (p < 1 ? 6.5 / duration : 1);
    uniforms.uTime.value += simulationDt; uniforms.uProgress.value = p;
    // Temporary expansion resamples the evolving dye, never a palette or original text.
    uniforms.uExpansion.value = 1.05 * smooth(p, 0.38, 0.65) * (1 - smooth(p, 0.82, 1));
    uniforms.uSpread.value = smooth(p, 0.4, 0.7) * (1 - smooth(p, 0.9, 1));
    uniforms.uDt.value = simulationDt;
    uniforms.uMouseFrom.value.copy(lastPointer);
    if (pointerInside) uniforms.uMouse.value.copy(pointer);
    else uniforms.uMouse.value.set(-10, -10);
    uniforms.uMouseVelocity.value.copy(pointer).sub(lastPointer).multiplyScalar(1 / dt).clampLength(0, 2.5);
    if (!pointerInside) uniforms.uMouseVelocity.value.set(0, 0);
    uniforms.uDragging.value = dragging ? 1 : 0;
    lastPointer.copy(pointer);
    uniforms.uVelocity.value = targets.velocity[0].texture;
    uniforms.uDye.value = targets.dye[dyeIndex].texture;
    renderPass(materials.velocity, targets.velocity[1]);
    uniforms.uVelocity.value = targets.velocity[1].texture;
    renderPass(materials.divergence, targets.divergence);
    uniforms.uDivergence.value = targets.divergence.texture;
    // Warm-starting pressure saves iterations; both buffers start at zero on reset.
    for (let i = 0; i < settings.pressureIterations; i++) {
        uniforms.uPressure.value = targets.pressure[i % 2].texture;
        renderPass(materials.pressure, targets.pressure[1 - i % 2]);
    }
    uniforms.uPressure.value = targets.pressure[settings.pressureIterations % 2].texture;
    renderPass(materials.projection, targets.velocity[0]);
    uniforms.uVelocity.value = targets.velocity[0].texture;
    uniforms.uDye.value = targets.dye[dyeIndex].texture;
    renderPass(materials.advection, targets.forward);
    uniforms.uDye.value = targets.forward.texture;
    uniforms.uDt.value = -simulationDt;
    renderPass(materials.advection, targets.backward);
    uniforms.uDt.value = simulationDt;
    uniforms.uDye.value = targets.dye[dyeIndex].texture;
    uniforms.uForward.value = targets.forward.texture;
    uniforms.uBackward.value = targets.backward.texture;
    renderPass(materials.dye, targets.dye[1 - dyeIndex]);
    dyeIndex = 1 - dyeIndex;
}
function renderDisplay() {
    uniforms.uDye.value = targets.dye[dyeIndex].texture;
    uniforms.uGrain.value = settings.grain;
    renderPass(materials.display, null);
}
let debugPaused = false;
let userPaused = false;
let exporting = false;
const pauseButton = document.getElementById('pauseButton');
pauseButton.addEventListener('click', () => {
    userPaused = !userPaused;
    pauseButton.setAttribute('aria-pressed', String(userPaused));
    pauseButton.setAttribute('aria-label', userPaused ? 'Resume animation' : 'Pause animation');
    pauseButton.title = userPaused ? 'Resume animation' : 'Pause animation';
    pauseButton.querySelector('path').setAttribute('d', userPaused ? 'M9 5l10 7-10 7Z' : 'M9 6v12M15 6v12');
});
function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (document.hidden || debugPaused || userPaused || exporting) return;
    accumulator += dt;
    // Fixed steps keep input, diffusion, and timing consistent at 30/60/120 Hz.
    while (accumulator >= STEP) { step(STEP); accumulator -= STEP; }
    renderDisplay();
}
function commitText() {
    const cleaned = Array.from(input.value.replace(/[\r\n]/g, '')).slice(0, MAX_LETTERS).join('');
    if (!composing && input.value !== cleaned) input.value = cleaned;
    updateTextTexture();
    restartMelting(composing ? Infinity : settings.typingDelay);
    textStatus.textContent = cleaned ? `Text: ${cleaned}` : 'Ready to type';
}
function focusKeyboard() { input.focus({ preventScroll: true }); }
input.addEventListener('input', commitText);
input.addEventListener('compositionstart', () => {
    if (elapsed >= settings.duration) input.value = '';
    composing = true; hold = Infinity;
});
input.addEventListener('compositionend', () => { composing = false; commitText(); });
input.addEventListener('beforeinput', (event) => {
    // Once a composition has melted, a new printable character starts a new word.
    if (!composing && elapsed >= settings.duration && event.inputType === 'insertText' && event.data) {
        event.preventDefault();
        input.value = event.data;
        commitText();
    }
});
typePrompt.addEventListener('click', focusKeyboard);
document.addEventListener('keydown', (event) => {
    if (exporting) return;
    if (event.key === 'Escape' && !document.getElementById('exportPanel').hidden) return;
    if (event.target !== input && (event.target.matches('input, select, textarea') || event.target.isContentEditable)) return;
    if (event.isComposing || composing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {
        event.preventDefault(); input.value = ''; commitText(); input.blur(); return;
    }
    if (event.key === 'Enter') {
        // Keep native activation of focused buttons.
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault(); restartMelting(0); input.blur(); return;
    }
    if (event.target === input) return;
    if (event.key === ' ' && event.target instanceof HTMLButtonElement) return;
    if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        if (event.key === 'Backspace' || event.key === 'Delete') input.value = Array.from(input.value).slice(0, -1).join('');
        else input.value = (elapsed >= settings.duration ? '' : input.value) + event.key;
        focusKeyboard();
        input.setSelectionRange(input.value.length, input.value.length);
        commitText();
    } else if (event.key === 'Process') focusKeyboard();
});
document.addEventListener('paste', (event) => {
    if (exporting) return;
    if (event.target !== input && (event.target.matches('input, select, textarea') || event.target.isContentEditable)) return;
    if (event.target === input) {
        if (elapsed >= settings.duration) input.select();
        return; // Native selection-aware paste in the keyboard bridge.
    }
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault(); input.value = text; focusKeyboard(); commitText();
});
// An event must not be passed as the numeric delay.
meltButton.addEventListener('click', () => restartMelting(0.25));
document.addEventListener('visibilitychange', () => { lastTime = performance.now(); accumulator = 0; });
new ResizeObserver(resize).observe(container);
resize();
requestAnimationFrame(animate);

// Export from the live GPU field, without resizing the visible canvas or reseeding it.
// Snapshot every simulation target so a cancelled or completed loop restores exactly.
uniforms.uSource = { value: null };
const copyMaterial = material('varying vec2 vUv; uniform sampler2D uSource; void main() { gl_FragColor = texture2D(uSource, vUv); }');
function beginExport(width, height, transparent) {
    exporting = true;
    const saved = { elapsed, hold, accumulator, dyeIndex, pointerInside, dragging, lastPointer: lastPointer.clone() };
    const savedUniforms = Object.fromEntries(Object.entries(uniforms).map(([key, entry]) => [key,
        entry.value?.isVector2 || entry.value?.isVector4 ? entry.value.clone() : entry.value]));
    const snapshots = [];
    let output, canvas, restored = false;
    const restore = () => {
        if (restored) return; restored = true;
        for (const [original, snapshot] of snapshots) {
            uniforms.uSource.value = snapshot.texture; renderPass(copyMaterial, original); snapshot.dispose();
        }
        for (const [key, value] of Object.entries(savedUniforms)) {
            if (value?.isVector2 || value?.isVector4) uniforms[key].value.copy(value);
            else uniforms[key].value = value;
        }
        ({ elapsed, hold, accumulator, dyeIndex, pointerInside, dragging } = saved);
        lastPointer.copy(saved.lastPointer);
        output?.dispose(); if (canvas) canvas.width = canvas.height = 1;
        lastTime = performance.now(); renderDisplay();
    };
    try {
        for (const target of Object.values(targets).flat()) {
            const snapshot = createTarget(target.width, target.height, target.texture.type);
            snapshots.push([target, snapshot]); uniforms.uSource.value = target.texture; renderPass(copyMaterial, snapshot);
        }
        output = createTarget(width, height, THREE.UnsignedByteType);
        canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas allocation failed. Try smaller dimensions.');
        const pixels = new Uint8Array(width * height * 4), image = context.createImageData(width, height);
        const aspect = width / height, originalAspect = uniforms.uAspect.value;
        const scale = new THREE.Vector2(Math.min(1, aspect / originalAspect), Math.min(1, originalAspect / aspect));
        hold = 0; pointerInside = false; dragging = false;
        return {
            canvas,
            advance(seconds) { for (let i = 0; i < Math.round(seconds / STEP); i++) step(STEP); },
            draw() {
                uniforms.uDye.value = targets.dye[dyeIndex].texture;
                uniforms.uVelocity.value = targets.velocity[0].texture;
                uniforms.uTransparent.value = transparent ? 1 : 0;
                uniforms.uViewScale.value.copy(scale); uniforms.uCanvasSize.value.set(width, height);
                renderPass(materials.display, output);
                renderer.readRenderTargetPixels(output, 0, 0, width, height, pixels);
                const stride = width * 4;
                for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - y - 1) * stride, (height - y) * stride), y * stride);
                context.putImageData(image, 0, 0);
            },
            restore,
        };
    } catch (error) { restore(); throw error; }
}
createExportControls({
    aspect: () => uniforms.uAspect.value,
    maxSize: () => Math.min(renderer.capabilities.maxTextureSize, renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE)),
    hasInk: () => hasInk,
    personality: () => personalityControls.preset.id,
    lock: () => { exporting = true; },
    begin: beginExport,
    finish() {
        exporting = false; lastTime = performance.now(); accumulator = 0;
        if (resizePending) { resizePending = false; resize(); }
    },
});

// Opt-in deterministic QA; no debug controls in normal use.
if (new URLSearchParams(location.search).has('debug')) {
    window.chromelt = {
        settings,

        pause: () => { debugPaused = true; },
        resume: () => { debugPaused = false; lastTime = performance.now(); },
        reset: (text = input.value) => {
            input.value = text; updateTextTexture(); restartMelting(0); debugPaused = true;
        },
        advance: (seconds) => { for (let i = 0; i < Math.round(seconds / STEP); i++) step(STEP); renderDisplay(); },
        fingerprint: () => {
            const target = targets.dye[dyeIndex], pixels = new Float32Array(target.width * target.height * 4);
            renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
            const words = new Uint32Array(pixels.buffer); let hash = 2166136261;
            for (let i = 0; i < words.length; i++) hash = Math.imul(hash ^ words[i], 16777619);
            return hash >>> 0;
        },
        measureDensity: () => {
            const target = targets.dye[dyeIndex];
            const pixels = new Float32Array(target.width * target.height * 4);
            renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
            let covered = 0;
            for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 0.85) covered++;
            return covered / (target.width * target.height);
        },
        get state() { return { elapsed, progress: uniforms.uProgress.value, hasInk, text: input.value,
            personality: personalityControls.preset.id, paused: userPaused, mode: paletteControls.mode, palette: paletteControls.palette, dyeSize: [targets.dye[0].width, targets.dye[0].height], calls: renderer.info.render.calls }; },
    };
}
