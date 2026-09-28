/** Lightweight toast notifications */

let container = null;

function ensure() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'toast-root';
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

export function toast(message, type = 'info', duration = 3200) {
  const root = ensure();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--show'));
  setTimeout(() => {
    el.classList.remove('toast--show');
    setTimeout(() => el.remove(), 280);
  }, duration);
}
