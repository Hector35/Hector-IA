import { syncRowsFromStorageAndRender } from './app-v16.js?v=65';

const BUILD = '2026.08.18.73';
const TAB_FOR_MODALITY = {
  'Rayos X': 'RX',
  'TAC': 'TAC',
  'Ultrasonido': 'USG',
  'Piso': 'Piso'
};
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

function exposeSelectedCategory(form) {
  const selected = TAB_FOR_MODALITY[form?.querySelector('#modality')?.value];
  if (!selected) return () => {};
  const buttons = [...document.querySelectorAll('[data-category-tab]')];
  const snapshot = buttons.map(button => ({
    button,
    active: button.classList.contains('is-active'),
    selected: button.getAttribute('aria-selected'),
    tabIndex: button.getAttribute('tabindex')
  }));
  for (const button of buttons) {
    const on = button.dataset.categoryTab === selected;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-selected', on ? 'true' : 'false');
    button.setAttribute('tabindex', on ? '0' : '-1');
  }
  return () => {
    for (const item of snapshot) {
      item.button.classList.toggle('is-active', item.active);
      item.selected === null ? item.button.removeAttribute('aria-selected') : item.button.setAttribute('aria-selected', item.selected);
      item.tabIndex === null ? item.button.removeAttribute('tabindex') : item.button.setAttribute('tabindex', item.tabIndex);
    }
  };
}

function refreshFromStorage() {
  try { syncRowsFromStorageAndRender(); } catch {}
}

function markBuild() {
  const app = document.getElementById('app');
  if (app) app.dataset.e2eBuild = BUILD;
  ensureManualCategory();
}

window.addEventListener('submit', event => {
  if (event.target?.id !== 'patientForm') return;
  const restore = exposeSelectedCategory(event.target);
  setTimeout(restore, 0);
}, true);

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
