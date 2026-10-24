// Local-only export. No artwork or frames leave the browser.
const FPS = 30, FRAME_COUNT = 180, HALF = FRAME_COUNT / 2;
const codecCandidates = {
  mp4: ['video/mp4;codecs=avc1.42001E', 'video/mp4'],
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
};
export function supportedCodecs() {
  return Object.fromEntries(Object.entries(codecCandidates).map(([format, types]) => [format,
    typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream ? null : types.find(type => MediaRecorder.isTypeSupported(type)) || null]));
}
function checkAbort(signal) { if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError'); }
function wait(ms, signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Export cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export function canvasBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not create this image. Try smaller dimensions.')), type, quality));
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
// ZIP's store method preserves already-compressed PNGs without recompression.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zipHeader(size) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }
export async function sequenceZip(frames, width, height, signal, progress) {
  const entries = [];
  for (let i = 0; i < frames.length; i++) {
    checkAbort(signal);
    entries.push({ blob: frames[i], crc: crc32(new Uint8Array(await frames[i].arrayBuffer())) });
    if (i % 4 === 0) { progress(.65 + .25 * i / frames.length, 'Packing transparent frames…'); await wait(0, signal); }
  }
  const info = new Blob([`Gradia transparent loop\n${width} x ${height} px\n30 fps, 180 frames, 6 seconds\nImport frame-0000.png through frame-0179.png as a PNG image sequence at 30 fps.\nPlayback is eased forward and reverse for a seamless loop.\nStraight alpha; no white background is baked in.\n`]);
  const infoEntry = { blob: info, crc: crc32(new Uint8Array(await info.arrayBuffer())) };
  const body = [], directory = []; let offset = 0, directorySize = 0;
  function add(name, entry) {
    const filename = new TextEncoder().encode(name), size = entry.blob.size;
    const local = zipHeader(30 + filename.length), l = local.view;
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(12, 33, true);
    l.setUint32(14, entry.crc, true); l.setUint32(18, size, true); l.setUint32(22, size, true); l.setUint16(26, filename.length, true);
    local.bytes.set(filename, 30); body.push(local.bytes, entry.blob);
    const central = zipHeader(46 + filename.length), c = central.view;
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 33, true);
    c.setUint32(16, entry.crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, filename.length, true); c.setUint32(42, offset, true);
    central.bytes.set(filename, 46); directory.push(central.bytes); directorySize += central.bytes.length; offset += local.bytes.length + size;
  }
  for (let i = 0; i < FRAME_COUNT; i++) add(`frame-${String(i).padStart(4, '0')}.png`, entries[i <= HALF ? i : FRAME_COUNT - i]);
  add('README.txt', infoEntry);
  const end = zipHeader(22), e = end.view;
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, FRAME_COUNT + 1, true); e.setUint16(10, FRAME_COUNT + 1, true);
  e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  checkAbort(signal);
  return new Blob([...body, ...directory, end.bytes], { type: 'application/zip' });
}
async function recordLoop(frames, width, height, mimeType, signal, progress) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
  if (!track?.requestFrame) { stream.getTracks().forEach(t => t.stop()); throw new Error('This browser cannot capture video frames. Try the PNG sequence export.'); }
  let recorder, frame, chunks = [], recordingError;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: Math.min(24000000, Math.max(8000000, width * height * 10)) });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = event => { recordingError = event.error || new Error('Video encoding failed. Try smaller dimensions or another format.'); };
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    // Decode before starting the clock; the first frame is never blank.
    frame = await createImageBitmap(frames[0]); ctx.drawImage(frame, 0, 0); frame.close(); frame = null;
    recorder.start();
    const start = performance.now();
    for (let i = 0; i < FRAME_COUNT; i++) {
      checkAbort(signal); if (recordingError) throw recordingError;
      frame = await createImageBitmap(frames[i <= HALF ? i : FRAME_COUNT - i]);
      await wait(Math.max(0, start + i * 1000 / FPS - performance.now()), signal);
      ctx.drawImage(frame, 0, 0); frame.close(); frame = null; track.requestFrame();
      if (i % 6 === 0) progress(.6 + .38 * i / FRAME_COUNT, 'Encoding seamless loop…');
    }
    await wait(Math.max(0, start + FRAME_COUNT * 1000 / FPS - performance.now()), signal);
    recorder.stop(); await stopped;
    if (recordingError) throw recordingError;
    const blob = new Blob(chunks, { type: recorder.mimeType });
    if (blob.size < 1000) throw new Error('Video encoder returned an empty file. Try another format.');
    return blob;
  } finally {
    frame?.close();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach(t => t.stop()); canvas.width = canvas.height = 1;
  }
}
export function createExportControls(engine) {
  const panel = document.getElementById('exportPanel'), toggle = document.getElementById('exportToggle');
  const codecs = supportedCodecs();
  panel.innerHTML = `<h2>Take the fluid with you.</h2>
    <label for="exportFormat">Format</label><select id="exportFormat">
      <option value="png">Still image · PNG</option><option value="mp4">Seamless video · MP4</option>
      <option value="webm">Seamless video · WebM</option><option value="sequence">Transparent loop · PNG sequence</option></select>
    <label for="exportSize">Resolution</label><select id="exportSize"></select>
    <div class="dimensions" id="customDimensions" hidden><label for="exportWidth">Width<input id="exportWidth" type="number" min="64" max="8192" step="1" value="2400"></label><label for="exportHeight">Height<input id="exportHeight" type="number" min="64" max="8192" step="1" value="3200"></label></div>
    <label class="check-label"><input type="checkbox" id="exportAlpha"> Transparent background</label>
    <p id="exportHint"></p><button id="exportStart" class="primary-button">Export PNG</button>
    <progress id="exportProgress" value="0" max="1" hidden></progress>
    <button id="exportCancel" class="cancel-button" hidden>Cancel export</button>
    <p id="exportStatus" role="status" aria-live="polite"></p>`;
  const $ = id => document.getElementById(id);
  const format = $('exportFormat'), size = $('exportSize'), alpha = $('exportAlpha');
  let controller = null, pngAlpha = false;
  for (const type of ['mp4', 'webm']) if (!codecs[type]) {
    const option = format.querySelector(`[value="${type}"]`); option.disabled = true; option.textContent += ' · unavailable';
  }
  function dimensions() {
    if (size.value === 'custom') return [Number($('exportWidth').value), Number($('exportHeight').value)];
    const edge = Number(size.value), aspect = engine.aspect();
    return [Math.round(edge * Math.min(1, aspect) / 2) * 2, Math.round(edge * Math.min(1, 1 / aspect) / 2) * 2];
  }
  function update() {
    const still = format.value === 'png', sequence = format.value === 'sequence';
    $('customDimensions').hidden = size.value !== 'custom';
    alpha.disabled = !still; alpha.checked = still ? pngAlpha : sequence;
    const [w, h] = dimensions();
    $('exportHint').textContent = still
      ? `${w} × ${h} px. Captures the current frame. Pause to choose your moment.${size.value === 'custom' ? ' Other aspect ratios crop from the center.' : ''}${alpha.checked ? ' Empty areas stay transparent; a fully melted field fills the frame.' : ''}`
      : `${w} × ${h} px · 6 seconds · 30 fps. Eased forward and reverse from this moment for a seamless loop. ${sequence ? 'ZIP of 180 transparent PNGs for your video editor.' : 'Opaque video. Use PNG sequence for transparency. Keep this tab visible while encoding.'}`;
    $('exportStart').textContent = still ? 'Export PNG' : sequence ? 'Export transparent sequence' : `Export ${format.value.toUpperCase()} loop`;
  }
  function changeFormat() {
    size.innerHTML = format.value === 'png'
      ? '<option value="2048">2K · 2048 px</option><option value="3840">4K · 3840 px</option><option value="custom">Custom dimensions</option>'
      : '<option value="1280">1280 px · Light</option><option value="1920">1920 px · HD</option>';
    update();
  }
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); document.body.classList.toggle('export-open', !panel.hidden); update();
  });
  new ResizeObserver(() => { if (!controller) update(); }).observe(document.getElementById('canvas-container'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden && !controller) {
      event.preventDefault(); panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('export-open'); toggle.focus();
    }
  });
  format.addEventListener('change', changeFormat); size.addEventListener('change', update);
  alpha.addEventListener('change', () => { pngAlpha = alpha.checked; update(); });
  $('exportWidth').addEventListener('input', update); $('exportHeight').addEventListener('input', update);
  $('exportCancel').addEventListener('click', () => controller?.abort());
  document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.abort(); });
  $('exportStart').addEventListener('click', async () => {
    if (controller) return;
    const type = format.value, [width, height] = dimensions(), transparent = alpha.checked;
    const status = $('exportStatus');
    const max = Math.min(8192, engine.maxSize());
    if (![width, height].every(n => Number.isInteger(n) && n >= 64 && n <= max) || width * height > 24000000) {
      status.textContent = `Choose whole dimensions from 64 to ${max} px, up to 24 megapixels.`; return;
    }
    if (!engine.hasInk()) { status.textContent = 'Type something before exporting.'; return; }
    if (codecs[type] === null) { status.textContent = 'This format is unavailable in your browser.'; return; }
    controller = new AbortController(); const { signal } = controller;
    let session, disabled = [], frames = [];
    const progress = (amount, message) => { $('exportProgress').value = amount; status.textContent = message; };
    try {
      engine.lock();
      for (const control of document.querySelectorAll('button, input, select, textarea')) {
        if (control.id === 'exportCancel') continue;
        disabled.push([control, control.disabled]); control.disabled = true;
      }
      document.body.classList.add('exporting'); $('exportCancel').hidden = false; $('exportProgress').hidden = false;
      progress(0, 'Preparing artwork…'); await wait(20, signal);
      session = engine.begin(width, height, transparent);
      let blob;
      if (type === 'png') {
        session.draw(); blob = await canvasBlob(session.canvas); checkAbort(signal);
      } else {
        let stepped = 0, bytes = 0;
        // The cosine trajectory has zero speed at both turnarounds, including the loop seam.
        // Only one half is simulated; reverse playback reuses exactly the same frames.
        for (let i = 0; i <= HALF; i++) {
          checkAbort(signal);
          const time = 1.5 * (1 - Math.cos(2 * Math.PI * i / FRAME_COUNT));
          const steps = Math.floor(time * 60 + 1e-7);
          session.advance((steps - stepped) / 60); stepped = steps; session.draw();
          const frame = await canvasBlob(session.canvas, type === 'sequence' ? 'image/png' : 'image/webp', .95);
          frames.push(frame); bytes += frame.size;
          if (bytes > 240000000) throw new Error('This sequence needs too much memory. Select the 1280 px size.');
          progress(.6 * i / HALF, `Rendering fluid · ${i + 1} / ${HALF + 1}`);
          await wait(0, signal);
        }
        // Release all GPU snapshots before video encoding / archive assembly.
        session.restore(); session = null;
        blob = type === 'sequence' ? await sequenceZip(frames, width, height, signal, progress)
          : await recordLoop(frames, width, height, codecs[type], signal, progress);
      }
      checkAbort(signal);
      const extension = type === 'sequence' ? 'zip' : type;
      download(blob, `gradia-${engine.personality()}-${width}x${height}${transparent ? '-transparent' : ''}.${extension}`);
      progress(1, `Saved · ${(blob.size / 1048576).toFixed(1)} MB`);
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? 'Export cancelled. Your artwork is unchanged.' : `Export failed: ${error.message}`;
    } finally {
      session?.restore(); frames.length = 0; engine.finish(); controller = null;
      for (const [control, wasDisabled] of disabled) control.disabled = wasDisabled;
      document.body.classList.remove('exporting'); $('exportCancel').hidden = true; $('exportProgress').hidden = true; update();
    }
  });
  changeFormat();
}
