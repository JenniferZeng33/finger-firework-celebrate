import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const MODEL_PATH = `${import.meta.env.BASE_URL}models/hand_landmarker.task`;

export class HandTracker {
  constructor() {
    this.landmarker = null;
    this.lastVideoTime = -1;
  }

  async initialize() {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      const options = {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, options);
      } catch (gpuError) {
        options.baseOptions.delegate = 'CPU';
        this.landmarker = await HandLandmarker.createFromOptions(vision, options);
      }
    } catch (error) {
      throw new Error(`MODEL_INIT: ${error?.message || error}`);
    }
  }

  detect(video, now) {
    if (!this.landmarker || video.readyState < 2 || video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;
    const result = this.landmarker.detectForVideo(video, now);
    if (!result.landmarks?.length) return { hands: [] };
    const hands = result.landmarks.map((landmarks, index) => {
      const category = result.handedness?.[index]?.[0];
      const handedness = category?.categoryName || 'Unknown';
      return {
        landmarks,
        handedness,
        confidence: category?.score || 0,
      };
    });
    return { hands };
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
  }
}
