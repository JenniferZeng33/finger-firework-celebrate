# FINGER FIREWORKS ✦

A self-contained webcam experience that turns a deliberate **closed fist → open palm** gesture into an elegant Canvas 2D firework. It can track two hands at once, with an independent gesture sequence for each hand, so near-simultaneous releases create overlapping fireworks. Camera frames and hand landmarks stay in the browser; nothing is uploaded. Recording only begins when the user presses **Record**.

The Record control switches the stage to a clean performance view, shows a live elapsed timer, and composites the mirrored camera plus fireworks into a local MP4. Pressing **Stop recording** automatically downloads the file. MP4 recording requires a browser that exposes native MP4 support through `MediaRecorder`.

## Technology

- Vite, HTML5, CSS3, and vanilla JavaScript ES modules
- MediaPipe Tasks Vision Hand Landmarker in `VIDEO` mode
- MediaDevices camera API, Canvas 2D, `MediaRecorder`, `requestAnimationFrame`, and Fullscreen API
- No backend, account, database, UI library, or second gesture model

## Project structure

```text
.
├── index.html
├── package.json
├── public/models/hand_landmarker.task
└── src
    ├── main.js             # camera, render loop, coordinate mapping, FSM
    ├── handTracking.js     # MediaPipe initialization and inference
    ├── gestureDetector.js  # geometry classifier and temporal smoothing
    ├── fireworks.js        # Canvas particle/effect system
    ├── recorder.js         # clean camera/effects MP4 compositor and download
    ├── ui.js               # interface, onboarding, and errors
    └── styles.css
```

## Install and run

Requires a current Node.js LTS release.

```bash
npm install
npm run dev
```

Open the localhost URL Vite prints. Camera access normally works on `localhost` during development and on HTTPS after deployment. It will generally be blocked on an ordinary HTTP origin.

Production checks:

```bash
npm run build
npm run preview
```

## MediaPipe model

The included file is the official MediaPipe **Hand Landmarker (float16, version 1)** model. Its required path is:

```text
/public/models/hand_landmarker.task
```

If the model is missing, download the official file from:

```text
https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
```

and save it with the exact local filename above. The app uses the pinned `@mediapipe/tasks-vision` npm package, while its matching WASM runtime is loaded from the same pinned version on jsDelivr. Hosting therefore needs network access unless the WASM directory is later copied locally and `WASM_ROOT` is changed in `src/handTracking.js`.

## How gesture detection works

`gestureDetector.js` measures fingertip distances from an estimated palm center and normalizes those distances against hand size. The four non-thumb fingers are marked folded or extended by comparing each tip with its PIP joint. The thumb supports neither required state because its appearance changes substantially with hand angle.

A seven-result history provides majority smoothing. `main.js` maintains one independent state machine per detected hand, and each one enforces this sequence:

1. A stable fist enters confirmation.
2. The fist must remain stable for about 400 ms.
3. Only an open palm after that confirmation releases one firework.
4. An 800 ms cooldown and classifier reset require a new fist for every new firework.

An open hand alone, a held-open hand, and `OPEN → OPEN` cannot trigger an effect. The two hand state machines do not share confirmation or cooldown timing, so both hands can release in the same few inference frames.

Hand identity is associated frame-to-frame by palm position, with MediaPipe handedness used only as a small matching hint. This prevents a fist-to-open pose change or a temporary Left/Right label flip from resetting the other hand's state.

## Tuning

Named constants are near the top of `src/gestureDetector.js`:

- `FIST_DISTANCE`: raise slightly to accept looser fists; lower it for stricter fists.
- `OPEN_DISTANCE`: lower slightly to accept less extended palms; raise it for stricter open hands.
- `HISTORY_SIZE` and `DOMINANCE`: increase for more stability, at the cost of response time.
- `FIST_CONFIRM_MS`: fist confirmation duration (default `220`).
- `OPEN_CONFIRM_FRAMES`: consecutive open-palm evidence required (default `2`).
- `COOLDOWN_MS`: post-release lockout (default `450`).

Set `DEBUG = true` near the top of `src/main.js` to display landmarks, raw/smoothed gesture labels, state, confidence, frame rate, palm position, and particle count. It is `false` by default and no technical overlay is shown to users.

## Firework patterns

`src/fireworks.js` contains coordinated palettes and weighted pattern selection for radial, willow, sparkle, double-burst, and rare heart effects. Every burst also receives an independent randomized scale, so successive gestures produce compact, medium, or occasional cinematic-sized fireworks. Particles last roughly 2.4–5.4 seconds and overlap naturally with later bursts. To add a pattern:

1. Add it to `choosePattern()` and rebalance probabilities.
2. Add its velocity, gravity, drag, lifetime, and/or angle rules in `burst()`.
3. Keep the result within `MAX_PARTICLES`; the system automatically reduces new bursts when near the cap.

## Deployment

Run `npm run build` and deploy the generated `dist/` directory to Vercel, Netlify, GitHub Pages, or another static HTTPS host. The model URL is built from `import.meta.env.BASE_URL`; for a GitHub Pages project subpath, set Vite's `base` to that repository path before building.

## Browser support

Recent desktop Chrome and Edge offer the most consistent MediaPipe/WebGL performance. Recent Safari is supported but camera and fullscreen behavior can vary by OS release. The experience requests one user-facing camera at approximately 1280×720 and falls back from the GPU delegate to CPU if GPU initialization fails.

## Troubleshooting

- **Camera blocked:** allow camera access in site settings, then choose **Try again**.
- **Camera in use:** close video-conferencing or camera apps and retry.
- **Secure-context warning:** use the Vite localhost URL or deploy to HTTPS.
- **Model loading failed:** confirm `public/models/hand_landmarker.task` exists and is not an HTML error page.
- **WASM loading failed:** check network access to the pinned jsDelivr URL in `src/handTracking.js`.
- **Gestures feel strict:** face the palm toward the camera, keep the full hand in frame, and tune the named thresholds in `gestureDetector.js`.
- **Effects feel offset:** verify that browser zoom is normal; resize/fullscreen recalculation is automatic and accounts for `object-fit: cover` cropping.
- **MP4 recording unavailable:** use a current desktop browser with native MP4 support in `MediaRecorder`; the app intentionally does not save a differently named WebM file as MP4.

## Testing notes and known limitations

Manually test each hand alone, both hands simultaneously, close/far distances, slow/fast transitions, open-without-fist, disappearance while armed, partial framing, dim light, busy backgrounds, resize, fullscreen, permission denial, a missing model, reduced motion, and repeated use for at least three minutes.

Geometry-only classification is intentionally lightweight. Severe foreshortening, fingers hidden behind one another, very low light, and a hand parallel to the image plane at an extreme angle can return `UNKNOWN`. Returning `UNKNOWN` is safer than producing an accidental firework.
