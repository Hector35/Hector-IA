// Pendientes v88 — iOS file-input snapshot hotfix.
// iOS Safari exposes input.files as a live FileList. Clearing input.value before
// copying it can make the selected photos disappear before processFiles reads them.
import { processFiles } from './capture-fix-v80.js?v=87';

const INPUT_IDS = new Set(['galleryInput', 'cameraInput']);

window.addEventListener('change', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !INPUT_IDS.has(input.id)) return;

  // Snapshot the live FileList before any listener clears the file input.
  const files = Array.from(input.files || []).filter(Boolean);
  if (!files.length) return;

  // Stop the older document-level capture handler from seeing an emptied FileList.
  event.stopPropagation();
  input.value = '';
  processFiles(files);
}, true);

document.documentElement.dataset.pendientesCaptureHotfix = '88';
