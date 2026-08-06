// Gesture tuning lives here. Lower FIST_DISTANCE to make fists stricter; lower
// OPEN_DISTANCE to make open palms easier. Increase HISTORY_SIZE / DOMINANCE
// for stability at the cost of responsiveness. Confirmation and cooldown timing
// are exported so the interaction FSM remains explicit and easy to tune.
export const FIST_CONFIRM_MS = 220;
export const OPEN_CONFIRM_FRAMES = 2;
export const COOLDOWN_MS = 450;
export const HAND_LOST_RESET_MS = 1000;
export const UNKNOWN_READY_RESET_MS = 1000;

const HISTORY_SIZE = 5;
const DOMINANCE = 3;
const FIST_DISTANCE = 1.42;
// Fingertip-to-palm distances are usually about 1.15–1.7 palm units for an
// open hand. The previous 1.82 threshold rejected many real open palms.
const OPEN_DISTANCE = 1.12;
const FOLDED_RATIO = 1.08;
const EXTENDED_RATIO = 1.08;
const EXTENDED_STRAIGHTNESS = 0.78;
const STRONGLY_EXTENDED_STRAIGHTNESS = 0.88;

const FINGERS = [
  { mcp: 5, pip: 6, dip: 7, tip: 8 },
  { mcp: 9, pip: 10, dip: 11, tip: 12 },
  { mcp: 13, pip: 14, dip: 15, tip: 16 },
  { mcp: 17, pip: 18, dip: 19, tip: 20 },
];

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

export function getPalmCenter(landmarks) {
  const ids = [0, 5, 9, 13, 17];
  const center = ids.reduce((sum, id) => ({
    x: sum.x + landmarks[id].x,
    y: sum.y + landmarks[id].y,
    z: sum.z + (landmarks[id].z || 0),
  }), { x: 0, y: 0, z: 0 });
  return { x: center.x / ids.length, y: center.y / ids.length, z: center.z / ids.length };
}

export class GestureDetector {
  constructor() {
    this.history = [];
    this.smoothed = 'UNKNOWN';
    this.raw = 'UNKNOWN';
    this.confidence = 0;
  }

  reset() {
    this.history.length = 0;
    this.raw = this.smoothed = 'UNKNOWN';
    this.confidence = 0;
  }

  classify(landmarks) {
    if (!landmarks?.[20]) return { raw: 'UNKNOWN', smoothed: this.push('UNKNOWN'), confidence: 0 };

    const palm = getPalmCenter(landmarks);
    const verticalScale = distance(landmarks[0], landmarks[9]);
    const widthScale = distance(landmarks[5], landmarks[17]);
    // Averaging the two palm axes avoids making the open threshold change too
    // much when the user rotates their hand or spreads the knuckles.
    const scale = Math.max((verticalScale + widthScale) * 0.5, 0.001);
    let folded = 0;
    let extended = 0;
    let strongExtended = 0;
    let normalizedSum = 0;

    for (const finger of FINGERS) {
      const tipDistance = distance(landmarks[finger.tip], palm);
      const pipDistance = distance(landmarks[finger.pip], palm);
      const normalized = tipDistance / scale;
      const fingerPath = distance(landmarks[finger.mcp], landmarks[finger.pip])
        + distance(landmarks[finger.pip], landmarks[finger.dip])
        + distance(landmarks[finger.dip], landmarks[finger.tip]);
      const straightness = distance(landmarks[finger.mcp], landmarks[finger.tip]) / Math.max(fingerPath, 0.001);
      normalizedSum += normalized;
      if (normalized < FIST_DISTANCE && tipDistance < pipDistance * FOLDED_RATIO) folded += 1;
      if (normalized > OPEN_DISTANCE && tipDistance > pipDistance * EXTENDED_RATIO && straightness > EXTENDED_STRAIGHTNESS) extended += 1;
      if (normalized > OPEN_DISTANCE * 1.12 && straightness > STRONGLY_EXTENDED_STRAIGHTNESS) strongExtended += 1;
    }

    const average = normalizedSum / FINGERS.length;
    let raw = 'UNKNOWN';
    let confidence = 0;
    if (folded >= 3 && average < FIST_DISTANCE * 1.02) {
      raw = 'FIST';
      confidence = Math.min(1, .55 + folded * .1 + Math.max(0, FIST_DISTANCE - average) * .25);
    } else if (extended === 4 || (extended >= 3 && strongExtended >= 3 && average > OPEN_DISTANCE * 1.08)) {
      raw = 'OPEN';
      confidence = Math.min(1, .52 + extended * .1 + Math.max(0, average - OPEN_DISTANCE) * .18);
    }

    this.raw = raw;
    this.confidence = confidence;
    return { raw, smoothed: this.push(raw), confidence, palm, metrics: { folded, extended, average } };
  }

  push(value) {
    this.history.push(value);
    if (this.history.length > HISTORY_SIZE) this.history.shift();
    const counts = this.history.reduce((all, item) => ({ ...all, [item]: (all[item] || 0) + 1 }), {});
    const candidate = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (candidate?.[1] >= DOMINANCE) this.smoothed = candidate[0];
    return this.smoothed;
  }
}
