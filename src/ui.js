const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.startScreen = $('start-screen');
    this.experience = $('experience');
    this.loading = $('loading-panel');
    this.loadingTitle = $('loading-title');
    this.loadingDetail = $('loading-detail');
    this.countdown = $('countdown');
    this.tutorial = $('tutorial');
    this.reminder = $('gesture-reminder');
    this.instruction = $('instruction');
    this.kicker = $('instruction-kicker');
    this.status = $('hand-status');
    this.error = $('error-panel');
    this.errorTitle = $('error-title');
    this.errorMessage = $('error-message');
    this.debugPanel = $('debug-panel');
  }

  enterExperience() {
    this.startScreen.classList.add('is-hidden');
    this.experience.classList.remove('is-hidden');
    this.showLoading('Opening the camera…', 'Your video never leaves this browser.');
  }

  exitExperience() {
    this.loading.classList.add('is-hidden');
    this.error.classList.add('is-hidden');
    this.countdown.classList.add('is-hidden');
    this.tutorial.classList.add('is-hidden');
    this.reminder.classList.add('is-hidden');
    this.experience.classList.add('is-hidden');
    this.startScreen.classList.remove('is-hidden');
  }

  showLoading(title, detail = '') {
    this.error.classList.add('is-hidden');
    this.loading.classList.remove('is-hidden');
    this.loadingTitle.textContent = title;
    this.loadingDetail.textContent = detail;
  }

  hideLoading() { this.loading.classList.add('is-hidden'); }

  async runCountdown() {
    this.countdown.classList.remove('is-hidden');
    for (const value of ['3', '2', '1', 'Make some magic ✦']) {
      const isMessage = value.length > 2;
      this.countdown.classList.toggle('is-message', isMessage);
      if (isMessage) this.countdown.innerHTML = '<span>Let\'s Make</span><span>Magic✦</span>';
      else this.countdown.textContent = value;
      this.countdown.style.animation = 'none';
      void this.countdown.offsetWidth;
      this.countdown.style.animation = '';
      await new Promise((resolve) => setTimeout(resolve, value.length > 2 ? 1150 : 850));
    }
    this.countdown.classList.remove('is-message');
    this.countdown.classList.add('is-hidden');
  }

  async playTutorial() {
    this.reminder.classList.add('is-hidden');
    this.tutorial.classList.remove('is-hidden');
    await new Promise((resolve) => setTimeout(resolve, 3600));
    this.tutorial.classList.add('is-hidden');
    this.reminder.classList.remove('is-hidden');
  }

  setInstruction(text, kicker = '') {
    if (this.instruction.textContent !== text) this.instruction.textContent = text;
    this.kicker.textContent = kicker;
  }

  setHandVisible(value) {
    const count = typeof value === 'number' ? value : value ? 1 : 0;
    const visible = count > 0;
    this.status.classList.toggle('detected', visible);
    this.status.lastChild.textContent = count > 1 ? ` ${count} hands detected` : visible ? ' Hand detected' : ' Waiting for hand';
  }

  showError(title, message) {
    this.loading.classList.add('is-hidden');
    this.tutorial.classList.add('is-hidden');
    this.countdown.classList.add('is-hidden');
    this.errorTitle.textContent = title;
    this.errorMessage.textContent = message;
    this.error.classList.remove('is-hidden');
  }

  setDebug(enabled, text = '') {
    this.debugPanel.classList.toggle('is-hidden', !enabled);
    if (enabled) this.debugPanel.textContent = text;
  }
}

export function cameraErrorMessage(error) {
  if (!window.isSecureContext) return ['Secure connection required', 'This experience requires HTTPS or localhost to access your camera.'];
  if (!navigator.mediaDevices?.getUserMedia) return ['Camera unsupported', 'This browser does not support camera access. Try a recent version of Chrome, Edge, or Safari.'];
  if (error?.message?.startsWith('MODEL_INIT')) return ['Hand tracking unavailable', 'The hand-tracking model could not be loaded. Check the model path and your connection, then try again.'];
  if (error?.name === 'NotAllowedError') return ['Camera access was blocked', 'Please allow camera access in your browser settings and try again.'];
  if (error?.name === 'NotFoundError') return ['No camera found', 'Connect a camera, then try again.'];
  if (error?.name === 'NotReadableError' || error?.name === 'AbortError') return ['Camera is unavailable', 'Another application may be using your camera. Close it and try again.'];
  return ['Could not start the experience', error?.message || 'Check your camera and model files, then try again.'];
}
