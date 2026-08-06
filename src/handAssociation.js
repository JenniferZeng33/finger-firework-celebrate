// Match by motion continuity, not MediaPipe's handedness label. That label can
// flip when a fist opens and must never move READY/COOLDOWN state to the other
// physical hand. Sessions that have briefly disappeared use a much tighter
// gate so a newly-entering fist cannot inherit an old hand's state.
export function associateHands(detections, sessions, now = performance.now()) {
  const pairs = [];
  detections.forEach((detection, detectionIndex) => {
    sessions.forEach((session, sessionIndex) => {
      if (!session.normalizedPalm) return;
      const distance = Math.hypot(
        detection.normalizedPalm.x - session.normalizedPalm.x,
        detection.normalizedPalm.y - session.normalizedPalm.y,
      );
      const age = Math.max(0, now - session.lastSeen);
      const maxDistance = age < 180 ? .3 : .14;
      pairs.push({ detectionIndex, sessionIndex, distance, maxDistance });
    });
  });

  const validPairs = pairs.filter((pair) => pair.distance <= pair.maxDistance);
  let best = { count: -1, cost: Infinity, assignments: [] };
  const search = (detectionIndex, usedSessions, assignments, cost) => {
    if (detectionIndex >= detections.length) {
      if (assignments.length > best.count || (assignments.length === best.count && cost < best.cost)) {
        best = { count: assignments.length, cost, assignments: [...assignments] };
      }
      return;
    }
    search(detectionIndex + 1, usedSessions, assignments, cost);
    for (const pair of validPairs) {
      if (pair.detectionIndex !== detectionIndex || usedSessions.has(pair.sessionIndex)) continue;
      usedSessions.add(pair.sessionIndex);
      assignments.push(pair);
      search(detectionIndex + 1, usedSessions, assignments, cost + pair.distance);
      assignments.pop();
      usedSessions.delete(pair.sessionIndex);
    }
  };
  search(0, new Set(), [], 0);
  return new Map(best.assignments.map((pair) => [pair.detectionIndex, sessions[pair.sessionIndex]]));
}
