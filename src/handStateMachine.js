import {
  FIST_CONFIRM_MS, OPEN_CONFIRM_FRAMES, COOLDOWN_MS, UNKNOWN_READY_RESET_MS,
} from './gestureDetector.js';

export const HAND_STATES = Object.freeze({
  WAITING_FOR_FIST: 'WAITING_FOR_FIST',
  CONFIRMING_FIST: 'CONFIRMING_FIST',
  READY_TO_RELEASE: 'READY_TO_RELEASE',
  FIREWORK_RELEASED: 'FIREWORK_RELEASED',
  COOLDOWN: 'COOLDOWN',
});

export function transitionHand(session, next, now) {
  if (session.state === next) return;
  session.state = next;
  session.stateSince = now;
  if (next !== HAND_STATES.READY_TO_RELEASE) session.openEvidence = 0;
}

// This function advances exactly one physical hand. It intentionally has no
// knowledge of other hands or the global UI, so every active hand can advance
// during another hand's release animation or cooldown.
export function updateHandState(session, now, onRelease) {
  const gesture = session.gesture.smoothed;
  if (session.state === HAND_STATES.WAITING_FOR_FIST && gesture === 'FIST') {
    transitionHand(session, HAND_STATES.CONFIRMING_FIST, now);
  } else if (session.state === HAND_STATES.CONFIRMING_FIST) {
    if (gesture !== 'FIST') transitionHand(session, HAND_STATES.WAITING_FOR_FIST, now);
    else if (now - session.stateSince >= FIST_CONFIRM_MS) transitionHand(session, HAND_STATES.READY_TO_RELEASE, now);
  } else if (session.state === HAND_STATES.READY_TO_RELEASE) {
    if (session.openEvidence >= OPEN_CONFIRM_FRAMES) {
      onRelease(session, now);
      transitionHand(session, HAND_STATES.FIREWORK_RELEASED, now);
    } else if (gesture === 'UNKNOWN') {
      if (!session.unknownSince) session.unknownSince = now;
      if (now - session.unknownSince > UNKNOWN_READY_RESET_MS) transitionHand(session, HAND_STATES.WAITING_FOR_FIST, now);
    } else session.unknownSince = 0;
  } else if (session.state === HAND_STATES.FIREWORK_RELEASED && now - session.stateSince > 220) {
    transitionHand(session, HAND_STATES.COOLDOWN, now);
  } else if (session.state === HAND_STATES.COOLDOWN && now - session.stateSince >= COOLDOWN_MS) {
    session.detector.reset();
    transitionHand(session, HAND_STATES.WAITING_FOR_FIST, now);
  }
}
