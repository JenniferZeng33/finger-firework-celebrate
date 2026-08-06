import test from 'node:test';
import assert from 'node:assert/strict';
import { associateHands } from '../src/handAssociation.js';
import { HAND_STATES, updateHandState } from '../src/handStateMachine.js';
import { FireworksSystem } from '../src/fireworks.js';

function session(id, state, gesture, stateSince = 0) {
  return {
    id,
    state,
    stateSince,
    gesture: { smoothed: gesture },
    openEvidence: 0,
    unknownSince: 0,
    detector: { reset() {} },
  };
}

test('one hand can arm while another hand releases and cools down', () => {
  const releases = [];
  const release = (hand) => releases.push(hand.id);
  const openingHand = session('opening', HAND_STATES.READY_TO_RELEASE, 'OPEN');
  openingHand.openEvidence = 2;
  const fistHand = session('fist', HAND_STATES.WAITING_FOR_FIST, 'FIST');

  updateHandState(openingHand, 1000, release);
  updateHandState(fistHand, 1000, release);
  assert.equal(openingHand.state, HAND_STATES.FIREWORK_RELEASED);
  assert.equal(fistHand.state, HAND_STATES.CONFIRMING_FIST);

  updateHandState(openingHand, 1401, release);
  updateHandState(fistHand, 1401, release);
  assert.equal(openingHand.state, HAND_STATES.COOLDOWN);
  assert.equal(fistHand.state, HAND_STATES.READY_TO_RELEASE);

  fistHand.gesture.smoothed = 'OPEN';
  fistHand.openEvidence = 2;
  updateHandState(fistHand, 1450, release);
  assert.deepEqual(releases, ['opening', 'fist']);
});

test('spatial identity survives detection order and handedness label changes', () => {
  const left = { id: 'left-track', lastSeen: 990, normalizedPalm: { x: .2, y: .5 } };
  const right = { id: 'right-track', lastSeen: 990, normalizedPalm: { x: .8, y: .5 } };
  const detections = [
    { handedness: 'Left', normalizedPalm: { x: .79, y: .5 } },
    { handedness: 'Right', normalizedPalm: { x: .21, y: .5 } },
  ];
  const matches = associateHands(detections, [left, right], 1000);
  assert.equal(matches.get(0), right);
  assert.equal(matches.get(1), left);
});

test('a release creates three lightweight follow-up bursts close to the palm', () => {
  globalThis.matchMedia = () => ({ matches: false });
  const fireworks = new FireworksSystem({ getContext: () => ({}) });
  fireworks.width = 1000;
  fireworks.height = 600;
  fireworks.sequence(500, 300);
  assert.equal(fireworks.pendingBursts.length, 3);
  assert.ok(fireworks.particles.length > 0);
  for (const burst of fireworks.pendingBursts) {
    assert.ok(Math.hypot(burst.x - 500, burst.y - 300) <= 61);
    assert.ok(burst.countMultiplier >= .5 && burst.countMultiplier <= .66);
  }
});

test('repeated sequences remain inside the real-time particle budget', () => {
  globalThis.matchMedia = () => ({ matches: false });
  const fireworks = new FireworksSystem({ getContext: () => ({}) });
  fireworks.width = 1000;
  fireworks.height = 600;
  for (let i = 0; i < 12; i += 1) fireworks.sequence(500, 300);
  fireworks.update(400);
  assert.ok(fireworks.particles.length <= 900);
});
