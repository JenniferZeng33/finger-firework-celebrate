// A file:// page cannot load Vite's module graph or access a webcam safely.
// Keep direct double-clicks informative instead of leaving a dead button.
if (location.protocol === 'file:') {
  document.getElementById('start-button').addEventListener('click', function () {
    document.getElementById('start-screen').classList.add('is-hidden');
    document.getElementById('experience').classList.remove('is-hidden');
    document.getElementById('loading-panel').classList.add('is-hidden');
    document.getElementById('error-title').textContent = 'Open through localhost';
    document.getElementById('error-message').textContent = 'Camera experiences cannot run from a file:// address. In this project folder, run “npm run dev”, then open the localhost link shown in Terminal.';
    document.getElementById('retry-button').textContent = 'Localhost required';
    document.getElementById('retry-button').disabled = true;
    document.getElementById('error-panel').classList.remove('is-hidden');
  });
}
