import { syncRowsFromStorageAndRender } from './app-v16.js?v=65';

const BUILD = '2026.08.18.74';
const MODALITY_FOR_TAB = {
  RX: 'Rayos X',
  TAC: 'TAC',
  USG: 'Ultrasonido',
  Piso: 'Piso'
};

function activeTab() {
  return document.querySelector('[data-category-tab].is-active')?.dataset.categoryTab || 'RX';
}

function ensureManualCategory() {
  const select = document.getElementById('modality');
  if (!select) return null;
  if (!select.querySelector('option[value="Piso"]')) {
    const option = document.createElement('option');
    option.value = 'Piso';
    option.textContent = 'Piso';
    select.appendChild(option);
  }
  const label = select.closest('label')?.querySelector('span');
  if (label && /modalidad/i.test(label.textContent || '')) label.textContent = 'Categoría';
  return select;
}

function prepareManualCapture() {
  queueMicrotask(() => {
    const select = ensureManualCategory();
    if (select) select.value = MODALITY_FOR_TAB[activeTab()] || 'Rayos X';
  });
}

function refreshFromStorage() {
  try { syncRowsFromStorageAndRender(); } catch {}
}

function markBuild() {
  const app = document.getElementById('app');
  if (app) app.dataset.e2eBuild = BUILD;
  ensureManualCategory();
}

document.addEventListener('click', event => {
  if (event.target.closest?.('#manualCapture')) prepareManualCapture();
}, true);

window.addEventListener('pageshow', refreshFromStorage);
window.addEventListener('focus', refreshFromStorage);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshFromStorage();
});

const observer = new MutationObserver(() => markBuild());
const root = document.getElementById('app');
if (root) observer.observe(root, { childList: true, subtree: true });
markBuild();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/turno-rx/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(() => {});
  }, { once: true });
}
