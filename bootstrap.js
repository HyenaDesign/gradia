const startup = document.getElementById('startupStatus');
function showUnavailable(message) {
  document.body.classList.add('engine-unavailable');
  startup.hidden = false;
  startup.querySelector('p').textContent = message;
}
startup.querySelector('button').addEventListener('click', () => location.reload());
document.addEventListener('webglcontextlost', () => {
  showUnavailable('The graphics connection was interrupted. Reload to start a new composition.');
}, true);
import('./main.js').catch(error => {
  console.error('Gradia could not start:', error);
  showUnavailable('Gradia needs WebGL 2 and floating-point graphics support. Enable hardware acceleration or try a recent browser, then reload.');
});
