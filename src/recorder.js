const MP4_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/mp4',
];

function pickMp4Type() {
  if (typeof MediaRecorder === 'undefined') return null;
  return MP4_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

function even(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function formatRecordingTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export class ExperienceRecorder {
  constructor({ video, effectsCanvas, stage, onTick, onStateChange }) {
    this.video = video;
    this.effectsCanvas = effectsCanvas;
    this.stage = stage;
    this.onTick = onTick;
    this.onStateChange = onStateChange;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.mediaRecorder = null;
    this.outputStream = null;
    this.chunks = [];
    this.animationId = 0;
    this.timerId = 0;
    this.startedAt = 0;
    this.stopPromise = null;
    this.resolveStop = null;
    this.discard = false;
  }

  get isRecording() { return this.mediaRecorder?.state === 'recording'; }

  start() {
    if (this.isRecording) return;
    if (!this.video.videoWidth || this.video.readyState < 2) throw new Error('Wait for the camera to finish starting before recording.');
    if (typeof this.canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      throw new Error('Video recording is not supported by this browser.');
    }
    const mimeType = pickMp4Type();
    if (!mimeType) throw new Error('This browser cannot encode MP4. Try the latest Safari, Chrome, or Edge.');

    const stageRect = this.stage.getBoundingClientRect();
    const aspect = Math.max(.5, stageRect.width / Math.max(stageRect.height, 1));
    this.canvas.height = 720;
    this.canvas.width = even(this.canvas.height * aspect);
    if (this.canvas.width > 1920) {
      this.canvas.width = 1920;
      this.canvas.height = even(this.canvas.width / aspect);
    }

    this.outputStream = this.canvas.captureStream(30);
    this.chunks = [];
    this.discard = false;
    this.mediaRecorder = new MediaRecorder(this.outputStream, { mimeType, videoBitsPerSecond: 8_000_000 });
    this.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) this.chunks.push(event.data);
    });
    this.mediaRecorder.addEventListener('stop', () => this.finish(mimeType), { once: true });
    this.mediaRecorder.addEventListener('error', (event) => {
      this.cleanup();
      this.onStateChange?.('error', event.error || new Error('Recording failed.'));
      this.resolveStop?.(null);
      this.resolveStop = null;
    });

    this.startedAt = performance.now();
    this.mediaRecorder.start(1000);
    this.drawFrame();
    this.timerId = window.setInterval(() => this.onTick?.(formatRecordingTime(performance.now() - this.startedAt)), 250);
    this.onTick?.('00:00');
    this.onStateChange?.('recording');
  }

  stop() {
    if (!this.isRecording) return Promise.resolve(null);
    this.discard = false;
    this.onStateChange?.('saving');
    this.stopPromise = new Promise((resolve) => { this.resolveStop = resolve; });
    this.mediaRecorder.stop();
    return this.stopPromise;
  }

  cancel() {
    if (!this.isRecording) return Promise.resolve(null);
    this.discard = true;
    this.onStateChange?.('cancelling');
    this.stopPromise = new Promise((resolve) => { this.resolveStop = resolve; });
    this.mediaRecorder.stop();
    return this.stopPromise;
  }

  drawFrame = () => {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    const { width, height } = this.canvas;
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    const targetAspect = width / height;
    const sourceAspect = videoWidth / videoHeight;
    let sx = 0; let sy = 0; let sw = videoWidth; let sh = videoHeight;
    if (sourceAspect > targetAspect) {
      sw = videoHeight * targetAspect;
      sx = (videoWidth - sw) / 2;
    } else {
      sh = videoWidth / targetAspect;
      sy = (videoHeight - sh) / 2;
    }

    this.ctx.save();
    this.ctx.filter = 'brightness(.62) saturate(.72) contrast(1.08)';
    this.ctx.translate(width, 0);
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, width, height);
    this.ctx.restore();
    this.ctx.filter = 'none';

    this.ctx.fillStyle = 'rgba(3, 2, 10, .16)';
    this.ctx.fillRect(0, 0, width, height);
    const topShade = this.ctx.createLinearGradient(0, 0, 0, height);
    topShade.addColorStop(0, 'rgba(3,2,10,.46)');
    topShade.addColorStop(.25, 'rgba(3,2,10,0)');
    topShade.addColorStop(.65, 'rgba(3,2,10,0)');
    topShade.addColorStop(1, 'rgba(3,2,10,.5)');
    this.ctx.fillStyle = topShade;
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.drawImage(this.effectsCanvas, 0, 0, this.effectsCanvas.width, this.effectsCanvas.height, 0, 0, width, height);
    this.animationId = requestAnimationFrame(this.drawFrame);
  };

  finish(mimeType) {
    if (this.discard) {
      this.cleanup();
      this.onStateChange?.('idle', { discarded: true });
      this.resolveStop?.(null);
      this.resolveStop = null;
      return;
    }
    const blob = new Blob(this.chunks, { type: mimeType });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `finger-fireworks-${stamp}.mp4`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.cleanup();
    this.onStateChange?.('idle', { filename, size: blob.size });
    this.resolveStop?.({ filename, size: blob.size });
    this.resolveStop = null;
  }

  cleanup() {
    cancelAnimationFrame(this.animationId);
    clearInterval(this.timerId);
    this.outputStream?.getTracks().forEach((track) => track.stop());
    this.outputStream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }

  destroy() {
    this.discard = true;
    if (this.isRecording) this.mediaRecorder.stop();
    else this.cleanup();
  }
}
