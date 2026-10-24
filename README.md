# Gradia

A local, interactive fluid-typography studio. Type anywhere, watch white letters reveal their colors and melt, then stir the living composition with your pointer.

## Run

- `npm install` if dependencies are missing.
- `npm run dev` serves the local preview.
- `npm run build` creates the production bundle in `dist/`.

Tap the bottom prompt for the native keyboard. Typing pauses for 800 ms before melting, with a twelve-character limit. Enter or the replay button restarts; Escape clears. Backspace, selection, paste, and IME input are supported. Typing after a completed melt starts a fresh word. Use Pause to hold a frame for export. Hover stirs gently; dragging pulls more strongly.

## Fluid personalities

The material selector changes the simulation and rendering independently of the palette. Selecting a personality replays the current word. The choice is remembered locally.

| Material | Motion and surface |
| --- | --- |
| Ink | Low viscosity, lively small eddies, feathered pigment and fine grain |
| Silk | Smoothed momentum, directional shear, long folds and satin highlights |
| Smoke | Strong multiscale turbulence, buoyancy, greater diffusion and soft reconstruction |
| Lava | High viscosity, slow currents, restrained pigment diffusion and luminous ridges |
| Liquid Chrome | Cohesive flow, lower diffusion, minimal grain and rolling environment reflections |

`personalities.js` holds the presets. Their flow parameters control momentum diffusion, curl strength, curl scale, and motion speed. Substance parameters control pigment diffusion, buoyancy, directional shear, and broad folding. Surface lighting in `shaders.js` derives normals from the actual pigment and velocity fields. Chrome reflects procedural studio lights; no reflection image or external asset is needed. The selected palette still supplies the dye.

## Color intelligence

Semantic mode resolves exact normalized brand names, then semantic keywords/categories, then falls back to the original deterministic character colors. Character mode always uses the original mapping. Custom mode accepts one to six HEX colors, with validation. Color mode and custom colors are remembered locally.

The `colors/` modules contain 21 brand palettes, 52 keyword palettes, category defaults, utilities, the resolver, and the controls. Matching ignores casing, spacing, punctuation, and diacritics, but never uses substring or fuzzy matching. All lookup and rendering work offline after the app has loaded; no API key, AI call, or runtime palette request is used.

The preview identifies the palette and its type, shows its HEX values, and links sources where available. Brand records distinguish verified values from inspired interpretations; weights are artistic, not official brand proportions. The Xbox record is historical. Semantic and custom colors are assigned across actual glyph ink mass, with deterministic weighted distribution, before the text is seeded into the simulation.

## Export

Open **Export** in the top-right corner. Files contain only the artwork, without UI. All rendering and encoding happen locally in the browser.

- **PNG:** 2K (2048-pixel longest edge), 4K (3840-pixel longest edge), or custom dimensions. Presets preserve the canvas aspect ratio. Custom proportions crop from the center without stretching. Dimensions must be whole numbers from 64 to the device limit, capped at 8192 per side and 24 megapixels.
- **Transparent PNG:** removes the white matte and drop shadow and exports straight alpha. Pause during melting to retain open areas; a fully melted field legitimately fills the frame.
- **MP4 / WebM:** six-second, 30 fps target loops, at a 1280- or 1920-pixel longest edge. Available formats are detected at runtime. These videos have an opaque background.
- **Transparent animation:** a ZIP containing 180 numbered PNG frames and an import guide. Import the images as a sequence at 30 fps in a video editor. This preserves alpha independently of video-codec support.

Loops simulate three seconds from the current moment, then reuse those frames in reverse. A cosine time curve eases both turnarounds to zero speed, including the seam. This is deliberately forward/reverse playback, not a claim that the underlying fluid simulation is periodic. A paused early melt can therefore become a transparent melting/unmelting overlay; a completed composition produces a loop of ambient currents.

`exports.js` handles controls, validation, native video recording, and ZIP assembly. `main.js` renders a dedicated output target and snapshots all simulation buffers. Export completion, errors, and cancellation restore the original field and timeline. Resizing is deferred until export completes. Changing tabs cancels an export so background throttling cannot silently spoil a video. Keep the tab visible while recording.

High-resolution output is reconstructed from the 768-pixel simulation field, with grain and lighting evaluated at export resolution. It is not a separate 4K fluid solve. Native MediaRecorder timing and codec availability depend on the browser/device; the PNG sequence has an exact 180-frame timeline. Frame caching is bounded to avoid unbounded memory use; select 1280 px if a large sequence exceeds the limit. Video encoding failures are reported without changing the artwork.

API references: [MediaRecorder format detection](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder), and [canvas image export](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob).

## Visual engine

1. Glyph colors are drawn into a transparent text canvas and seeded once into a premultiplied RGB+density field. The display starts white with a soft density-derived shadow, revealing the assigned hues as melting begins.
2. Velocity advection, viscosity, multiscale curl forcing, buoyancy/shear, broad vortices, and a pressure solve generate material-specific motion with closed walls.
3. Bounded MacCormack advection reduces numerical blur. Local diffusion, density growth, and a temporary expansion spread existing pigment. Sparse fronts use a larger radius based on glyph size and aspect ratio. No replacement palette, background gradient, or text is injected after seeding.
4. Display reconstruction, material lighting, grain, and dithering shade the current dye. Grain never accumulates in the simulation.
5. After 6.5 seconds, expansion and growth stop. Low ambient flow and pointer forces continue affecting the existing field without dye dissipation or restoration images.

Dye uses full-precision float targets because repeated half-float rounding visibly darkened persistent colors. Velocity and pressure use half-float targets with a 192-pixel longest edge; dye uses 768. A fixed 60 Hz step separates simulation timing from display refresh. The engine requires WebGL2 float render targets and linear float filtering.

Resize resamples the existing dye and retains elapsed time. The text texture is recreated when its dimensions change. `settings` near the start of `main.js` exposes transition duration, typing delay, simulation resolutions, pressure iterations, and grain; each personality sets its own grain amount.

## Verification

Run `node --test tests/colors.test.mjs` for palette data, resolution precedence, validation, and weighted ink-distribution tests.

The browser suites use the Playwright and Sharp development dependencies. Run npx playwright install chromium once, or set CHROME_PATH to an installed Chrome. You can also set `PLAYWRIGHT_MODULE` / `SHARP_MODULE` to their module paths and `CHROME_PATH` to Chrome. Start the dev server first.

- `node verify-personalities.cjs`: renders all five presets with the same palette, checks full coverage and distinct simulation fingerprints, persistence of the selected preset, and shader errors.
- `node verify-exports.cjs`: downloads 2K, 4K, custom transparent PNG, MP4, WebM, and a PNG-sequence ZIP; verifies dimensions, alpha, decoded video duration/motion/seams, source-frame seam identity, exact state restoration, cancellation, validation, and mobile layout.
- `node verify-export-edge.cjs`: HD MP4, cancellation during encoding, orientation-aware dimensions, Escape, pause/resume, and unsupported codec fallback.
- `node verify.cjs`: deformation, full coverage, matched hover/drag controls, a real 30.5-second persistence run, brightness/variation, new input, replay, empty input, portrait single characters, punctuation, long text, and resize preservation.
- `node verify-ui.cjs`: direct typing, white shadows, color reveal, editing, mobile focus/layout, and replay.
- `node verify-semantic.cjs`: semantic/custom/character modes, actual dye colors, aliases, input isolation, storage, offline behavior, and mobile controls.
- `node verify-timing.cjs`: alternate transition durations.

The `?debug` URL exposes deterministic pause/reset/advance helpers and field diagnostics only for QA. Reports, screenshots, and test exports go into ignored `qa/`. Rendered desktop and narrow-screen views are visually inspected. Mobile emulation does not substitute for testing a physical iOS device. Vite's production build reports the existing Three.js-sized bundle above its 500 kB advisory threshold.


## GitHub Pages deployment

Repository: https://github.com/HyenaDesign/gradia

In repository settings, choose **Pages → Build and deployment → Source: Deploy from a branch**, then select **gh-pages** and **/(root)** and save. The `main` branch contains source code; `gh-pages` contains only the compiled website. The custom Actions workflow is removed.

The Vite base is relative, so bundled assets work under `/gradia/` and at a domain root. Build locally with `npm run build`; Vite copies `public/.nojekyll` into the output to skip Jekyll processing. Publish the **contents** of `dist/` at the root of `gh-pages`, without changing the source branch. Updates to `main` alone do not publish: rebuild, test, then update `gh-pages`. Local QA captures, test exports, environment files, dependencies, and editor state are excluded from Git.

GitHub still uses its own Pages deployment workflow for branch publishing. This removes the custom build job, but does not guarantee that account-level Actions or billing restrictions will be bypassed. See [GitHub’s publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

For a local production check, run `npm run build` followed by `npm run test:production`. The test hosts the built files beneath `/gradia/`, including a real GPU render and PNG download. Set `FULL_QA=1` to also run all interaction, palette, material, duration, PNG, MP4, WebM, transparency, cancellation, and HD export suites against that production build. All suites accept an `APP_URL` override for a hosted release.

Node 24 is recommended for local builds. No environment variables, backend, account system, or paid API are required for hosting. Unsupported graphics configurations show a recovery message. Video format support is detected per browser. Physical iOS and Android devices still need hands-on testing before claiming universal mobile support.
