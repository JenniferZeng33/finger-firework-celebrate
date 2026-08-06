import './styles.css';
import { HandTracker } from './handTracking.js';
import {
  GestureDetector, getPalmCenter, HAND_LOST_RESET_MS, OPEN_CONFIRM_FRAMES,
} from './gestureDetector.js';
import { HAND_STATES, updateHandState } from './handStateMachine.js';
import { FireworksSystem } from './fireworks.js';
import { UI, cameraErrorMessage } from './ui.js';
import { ExperienceRecorder } from './recorder.js';
import { associateHands } from './handAssociation.js';

const DEBUG = false;
const INFERENCE_INTERVAL_MS = 1000 / 27;
const PALM_SMOOTHING = 0.28;

if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.getElementById('gesture-morph-animation')?.remove();
}

const STATES = Object.freeze({
  LOADING: 'LOADING', NO_HAND: 'NO_HAND', ...HAND_STATES,
});

const video = document.getElementById('webcam');
const stage = document.getElementById('stage');
const effectsCanvas = document.getElementById('effects-canvas');
const debugCanvas = document.getElementById('debug-canvas');
const recordButton = document.getElementById('record-button');
const recordingTime = document.getElementById('recording-time');
const stopRecordingButton = document.getElementById('stop-recording-button');
const cancelRecordingButton = document.getElementById('cancel-recording-button');
const debugCtx = debugCanvas.getContext('2d');
const ui = new UI();
const fireworks = new FireworksSystem(effectsCanvas);
const handSessions = new Map();

let tracker;
let stream;
let running = false;
let state = STATES.LOADING;
let lastInference = 0;
let lastFrame = performance.now();
let frameCounter = 0;
let fps = 0;
let fpsSince = performance.now();
let recordingErrorTimer = 0;
let nextHandId = 1;
let showingConcurrentPrompt = false;

const recorder = new ExperienceRecorder({
  video,
  effectsCanvas,
  stage,
  onTick(value) {
    recordingTime.textContent = value;
    const [minutes, seconds] = value.split(':').map(Number);
    recordingTime.dateTime = `PT${minutes}M${seconds}S`;
  },
  onStateChange(status, detail) {
    if (status === 'recording') {
      stage.classList.add('recording');
      recordButton.setAttribute('aria-pressed', 'true');
      stopRecordingButton.disabled = false;
      cancelRecordingButton.disabled = false;
      stopRecordingButton.textContent = 'Stop recording';
      return;
    }
    if (status === 'saving') {
      stopRecordingButton.disabled = true;
      cancelRecordingButton.disabled = true;
      stopRecordingButton.textContent = 'Saving…';
      return;
    }
    if (status === 'cancelling') {
      stopRecordingButton.disabled = true;
      cancelRecordingButton.disabled = true;
      cancelRecordingButton.textContent = 'Cancelling…';
      return;
    }
    stage.classList.remove('recording');
    recordButton.setAttribute('aria-pressed', 'false');
    stopRecordingButton.disabled = false;
    cancelRecordingButton.disabled = false;
    stopRecordingButton.textContent = 'Stop recording';
    cancelRecordingButton.textContent = 'Cancel';
    recordingTime.textContent = '00:00';
    recordingTime.dateTime = 'PT0S';
    if (status === 'error') {
      ui.setInstruction(detail?.message || 'Recording failed. Please try again.', 'RECORDING UNAVAILABLE');
      clearTimeout(recordingErrorTimer);
      recordingErrorTimer = window.setTimeout(() => transition(state, performance.now(), true), 3600);
    }
  },
});

function transition(next, now = performance.now(), force = false) {
  if (state === next && !force) return;
  state = next;
  if (DEBUG) console.info(`[FSM] ${next}`);
  const copy = {
    [STATES.LOADING]: ['Preparing the magic…', ''],
    [STATES.NO_HAND]: ['Show your hand', 'COME INTO FRAME'],
    [STATES.WAITING_FOR_FIST]: ['Make a fist', 'GESTURE ONE'],
    [STATES.CONFIRMING_FIST]: ['Hold for a moment', 'ALMOST READY'],
    [STATES.READY_TO_RELEASE]: ['Now open your hand ✦', 'GESTURE TWO'],
    [STATES.FIREWORK_RELEASED]: ['Magic released ✦', 'BEAUTIFUL'],
    [STATES.COOLDOWN]: ['Make a fist', 'AGAIN, WHEN READY'],
  }[next];
  if (copy) ui.setInstruction(...copy);
}

function createHandSession(now) {
  return {
    id: `hand-${nextHandId++}`,
    handedness: 'Unknown',
    detector: new GestureDetector(),
    state: STATES.WAITING_FOR_FIST,
    stateSince: now,
    lastSeen: now,
    unknownSince: 0,
    openEvidence: 0,
    landmarks: null,
    gesture: { raw: 'UNKNOWN', smoothed: 'UNKNOWN', confidence: 0 },
    rawPalm: null,
    smoothPalm: null,
    normalizedPalm: null,
  };
}

// Maps MediaPipe normalized coordinates onto the visible object-fit: cover video.
// Canvas rendering uses a DPR transform, so these logical pixels stay aligned at
// any devicePixelRatio while the backing store remains sharp.
function normalizedToCanvas(point) {
  const rect = stage.getBoundingClientRect();
  const videoWidth = video.videoWidth || 1280;
  const videoHeight = video.videoHeight || 720;
  const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;
  const cropX = (renderedWidth - rect.width) / 2;
  const cropY = (renderedHeight - rect.height) / 2;
  return {
    x: (1 - point.x) * renderedWidth - cropX,
    y: point.y * renderedHeight - cropY,
  };
}

function resize() {
  const rect = stage.getBoundingClientRect();
  fireworks.resize(rect.width, rect.height);
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  debugCanvas.width = Math.round(rect.width * dpr);
  debugCanvas.height = Math.round(rect.height * dpr);
  debugCanvas.style.width = `${rect.width}px`;
  debugCanvas.style.height = `${rect.height}px`;
  debugCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new DOMException('Secure camera access is unavailable', 'NotSupportedError');
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
  });
  video.srcObject = stream;
  await video.play();
  await new Promise((resolve, reject) => {
    if (video.readyState >= 2 && video.videoWidth) return resolve();
    const timer = setTimeout(() => reject(new Error('The camera video did not start in time.')), 8000);
    video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

function stopExperience() {
  recorder.destroy();
  stage.classList.remove('recording');
  running = false;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  tracker?.close();
  tracker = null;
}

async function initialize() {
  stopExperience();
  handSessions.clear();
  nextHandId = 1;
  transition(STATES.LOADING);
  ui.enterExperience();
  try {
    ui.showLoading('Opening the camera…', 'Your video never leaves this browser.');
    await startCamera();
    ui.showLoading('Learning your gestures…', 'Loading the on-device hand model.');
    tracker = new HandTracker();
    await tracker.initialize();
    resize();
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(loop);
    ui.hideLoading();
    transition(STATES.NO_HAND);
    await ui.runCountdown();
    ui.playTutorial();
  } catch (error) {
    stopExperience();
    const [title, message] = cameraErrorMessage(error);
    ui.showError(title, message);
  }
}

function processTracking(now) {
  if (!tracker || now - lastInference < INFERENCE_INTERVAL_MS || document.hidden) return;
  lastInference = now;
  try {
    const result = tracker.detect(video, now);
    if (!result) return;
    const detections = result.hands.map((hand) => ({
      ...hand,
      normalizedPalm: getPalmCenter(hand.landmarks),
    }));
    const recentSessions = [...handSessions.values()].filter((session) => now - session.lastSeen < HAND_LOST_RESET_MS);
    const matches = associateHands(detections, recentSessions, now);
    for (const [index, hand] of detections.entries()) {
      let session = matches.get(index);
      if (!session) {
        session = createHandSession(now);
        handSessions.set(session.id, session);
      }
      session.lastSeen = now;
      session.normalizedPalm = hand.normalizedPalm;
      if (hand.handedness !== 'Unknown' && hand.confidence >= .55) session.handedness = hand.handedness;
      session.landmarks = hand.landmarks;
      session.gesture = session.detector.classify(hand.landmarks);
      if (session.state === STATES.READY_TO_RELEASE) {
        if (session.gesture.raw === 'OPEN') session.openEvidence += 1;
        else if (session.gesture.raw === 'FIST') session.openEvidence = 0;
        else session.openEvidence = Math.max(0, session.openEvidence - 1);
      }
      session.rawPalm = normalizedToCanvas(session.gesture.palm || hand.normalizedPalm);
      if (!session.smoothPalm) session.smoothPalm = { ...session.rawPalm };
      session.smoothPalm.x += (session.rawPalm.x - session.smoothPalm.x) * PALM_SMOOTHING;
      session.smoothPalm.y += (session.rawPalm.y - session.smoothPalm.y) * PALM_SMOOTHING;
    }
  } catch (error) {
    console.error('Hand inference failed:', error);
  }
}

function triggerFirework(session, now) {
  if (!session.smoothPalm) return;
  fireworks.sequence(session.smoothPalm.x, session.smoothPalm.y);
  const flash = document.getElementById('screen-flash');
  flash.classList.remove('flash'); void flash.offsetWidth; flash.classList.add('flash');
}

function updateState(now) {
  for (const [id, session] of handSessions) {
    if (now - session.lastSeen > HAND_LOST_RESET_MS) handSessions.delete(id);
  }
  const activeHands = [...handSessions.values()].filter((session) => now - session.lastSeen < 140);
  ui.setHandVisible(activeHands.length);
  for (const session of activeHands) updateHandState(session, now, triggerFirework);

  if (!activeHands.length) {
    showingConcurrentPrompt = false;
    if (!handSessions.size && state !== STATES.LOADING) transition(STATES.NO_HAND, now);
    return;
  }
  const priority = [
    STATES.READY_TO_RELEASE, STATES.CONFIRMING_FIST, STATES.FIREWORK_RELEASED,
    STATES.WAITING_FOR_FIST, STATES.COOLDOWN,
  ];
  const hasReadyHand = activeHands.some((session) => session.state === STATES.READY_TO_RELEASE);
  const hasConfirmingHand = activeHands.some((session) => session.state === STATES.CONFIRMING_FIST);
  if (hasReadyHand && hasConfirmingHand) {
    state = STATES.READY_TO_RELEASE;
    showingConcurrentPrompt = true;
    ui.setInstruction('Open one hand · keep holding the other fist', '2 GESTURES ACTIVE');
    return;
  }
  const nextState = priority.find((candidate) => activeHands.some((session) => session.state === candidate)) || STATES.WAITING_FOR_FIST;
  transition(nextState, now, showingConcurrentPrompt);
  showingConcurrentPrompt = false;
}

function drawDebug(now) {
  if (!DEBUG) return;
  debugCtx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
  for (const session of handSessions.values()) {
    if (!session.landmarks || now - session.lastSeen >= 160) continue;
    debugCtx.fillStyle = '#62ffb3';
    for (const landmark of session.landmarks) {
      const p = normalizedToCanvas(landmark);
      debugCtx.beginPath(); debugCtx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); debugCtx.fill();
    }
    if (session.smoothPalm) {
      debugCtx.strokeStyle = '#ffeb72'; debugCtx.beginPath(); debugCtx.arc(session.smoothPalm.x, session.smoothPalm.y, 8, 0, Math.PI * 2); debugCtx.stroke();
    }
  }
  const handDebug = [...handSessions.values()].map((session) => `${session.id}: ${session.gesture.raw}/${session.gesture.smoothed} ${session.state} open:${session.openEvidence}/${OPEN_CONFIRM_FRAMES}`).join('\n');
  ui.setDebug(true, `${handDebug || 'no hands'}\nfps: ${fps}\nparticles: ${fireworks.particles.length}`);
}

function loop(now) {
  if (!running) return;
  const dt = now - lastFrame; lastFrame = now;
  processTracking(now);
  updateState(now);
  fireworks.update(dt);
  const palmFeedback = [...handSessions.values()]
    .filter((session) => session.smoothPalm && now - session.lastSeen < 160)
    .map((session) => ({ ...session.smoothPalm, state: session.state, now }));
  fireworks.render(palmFeedback);
  frameCounter += 1;
  if (now - fpsSince > 1000) { fps = Math.round(frameCounter * 1000 / (now - fpsSince)); frameCounter = 0; fpsSince = now; }
  drawDebug(now);
  requestAnimationFrame(loop);
}

document.getElementById('start-button').addEventListener('click', initialize);
document.getElementById('retry-button').addEventListener('click', initialize);
document.getElementById('tutorial-button').addEventListener('click', () => ui.playTutorial());
document.getElementById('back-button').addEventListener('click', async () => {
  stopExperience();
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch (error) { console.warn('Could not exit fullscreen:', error); }
  }
  ui.exitExperience();
});
recordButton.addEventListener('click', () => {
  clearTimeout(recordingErrorTimer);
  try {
    recorder.start();
  } catch (error) {
    ui.setInstruction(error.message, 'RECORDING UNAVAILABLE');
    recordingErrorTimer = window.setTimeout(() => transition(state, performance.now(), true), 3600);
  }
});
stopRecordingButton.addEventListener('click', () => recorder.stop());
cancelRecordingButton.addEventListener('click', () => recorder.cancel());
document.getElementById('fullscreen-button').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await stage.requestFullscreen();
    else await document.exitFullscreen();
  } catch (error) { console.warn('Fullscreen unavailable:', error); }
});

window.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', () => {
  const fullscreenButton = document.getElementById('fullscreen-button');
  const isFullscreen = Boolean(document.fullscreenElement);
  fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
  fullscreenButton.dataset.tooltip = isFullscreen ? 'Exit fullscreen' : 'Open fullscreen';
  requestAnimationFrame(resize);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && running) lastFrame = performance.now(); });
window.addEventListener('beforeunload', stopExperience);
ui.setDebug(DEBUG);
