(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const SHIFT_KEY = 'pendientes-shift-v1';

  const clean = (value) => String(value ?? '').trim();
  const plain = (value) => clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const normalizeTransport = (value) => {
    const text = plain(value);
    if (text.includes('no traslad') || text.includes('portatil')) return 'No trasladar';
    if (text.includes('camilla')) return 'Camilla';
    if (text.includes('silla')) return 'Silla';
    return 'Por definir';
  };

  function canonicalOrigin(value) {
    const text = clean(value)
      .replace(/^C\/\s*(?=CE\s*\d+)/i, '')
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/#/g, '');
    if (!text || text.includes('SALADEESPERA')) return '';
    let match = text.match(/^CAMA0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^UA0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^C0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^(CE|UP|UI)0*(\d+)$/); if (match) return `${match[1]}:${Number(match[2])}`;
    return text;
  }

  function rowCategory(row) {
    const explicit = plain(row?.category);
    if (explicit === 'piso') return 'Piso';
    if (explicit === 'tac' || explicit === 'tc' || explicit.includes('tomograf')) return 'TAC';
    if (explicit === 'usg' || explicit.includes('ultrason') || explicit.includes('ecograf')) return 'USG';
    if (explicit.includes('rayos') || explicit.includes('radiograf') || explicit === 'rx') return 'Rayos X';
    if (explicit === 'interconsulta') return 'Interconsulta';
    if (explicit.includes('apoyo')) return 'Apoyo para movimiento';
    return clean(row?.category) || 'Otro';
  }

  function isPending(row) {
    return plain(row?.status) !== 'realizado';
  }

  function readRows() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function currentShiftId() {
    try {
      return clean(JSON.parse(localStorage.getItem(SHIFT_KEY) || 'null')?.id);
    } catch {
      return '';
    }
  }

  function uid() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function hasActiveFloorConflict(rows, bed, excludeId = '') {
    const origin = canonicalOrigin(bed);
    if (!origin) return false;
    return (Array.isArray(rows) ? rows : []).some((row) =>
      String(row?.id ?? '') !== String(excludeId || '') &&
      rowCategory(row) === 'Piso' &&
      isPending(row) &&
      canonicalOrigin(row?.bed || row?.origin) === origin
    );
  }

  const QUICK_MAP = {
    'Rayos X': {category:'Rayos X', modality:'Rayos X', target:'Rayos X'},
    'TAC': {category:'TAC', modality:'TAC', target:'TAC'},
    'Piso': {category:'Piso', modality:'Otro', target:'', destination:''},
    'USG': {category:'USG', modality:'Ultrasonido', target:'USG'},
    'Interconsulta': {category:'Interconsulta', modality:'Otro', target:'Interconsulta'},
    'Apoyo para movimiento': {category:'Apoyo para movimiento', modality:'Otro', target:'Apoyo para movimiento'}
  };

  function createManualRow({bed, category, shiftId = '', now = new Date().toISOString()} = {}) {
    const mapped = QUICK_MAP[category];
    if (!mapped || !clean(bed)) return null;
    return {
      id: uid(),
      shiftId: shiftId || undefined,
      bed: clean(bed),
      name: '',
      age: null,
      sex: 'No visible',
      category: mapped.category,
      modality: mapped.modality,
      target: mapped.target,
      destination: mapped.destination || '',
      status: 'Pendiente',
      transport: 'Por definir',
      transportReason: '',
      oxygenProbable: false,
      oxygenReason: '',
      needsReview: false,
      reviewFields: [],
      createdAt: now
    };
  }

  function dispatchSync(source, detail = {}) {
    if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') return;
    document.dispatchEvent(new CustomEvent('pendientes:status-changed', {detail:{source, ...detail}}));
  }

  function saveQuickCaptureData({bed, category} = {}) {
    const rows = readRows();
    const row = createManualRow({bed, category, shiftId:currentShiftId()});
    if (!row) return {ok:false, error:'Completa la cama/área y la categoría.'};
    if (row.category === 'Piso' && hasActiveFloorConflict(rows, row.bed)) {
      return {ok:false, error:`La cama ${clean(bed)} ya tiene un paciente pendiente a Piso.`};
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([row, ...rows]));
    dispatchSync('manual-v65', {id:row.id, category:row.category});
    return {ok:true, row};
  }

  function setQuickError(message = '') {
    const node = document.getElementById('manualQuickError');
    if (!node) return;
    node.hidden = !message;
    node.textContent = message;
  }

  function closeQuickSheet() {
    const backdrop = document.getElementById('manualQuickBackdrop');
    if (backdrop) backdrop.hidden = true;
    document.body?.classList?.remove('manual-quick-open');
  }

  function handleQuickSubmit(event) {
    const form = event.target;
    if (form?.id !== 'manualQuickForm') return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const bed = clean(document.getElementById('manualQuickBed')?.value);
    const selected = document.querySelector('[data-manual-category].is-selected');
    const category = clean(selected?.dataset?.manualCategory);
    const result = saveQuickCaptureData({bed, category});
    if (!result.ok) {
      setQuickError(result.error);
      if (!bed) document.getElementById('manualQuickBed')?.focus();
      return true;
    }
    setQuickError('');
    closeQuickSheet();
    return true;
  }

  function normalizeAge(value) {
    const text = clean(value);
    if (!text) return null;
    const age = Number.parseInt(text, 10);
    return Number.isFinite(age) && age >= 0 && age <= 130 ? age : null;
  }

  function inferCategory(modality, target, existing = null) {
    if (rowCategory(existing) === 'Piso') return 'Piso';
    const study = plain(target);
    const mode = plain(modality);
    if (study === 'piso') return 'Piso';
    if (study.includes('interconsulta')) return 'Interconsulta';
    if (study.includes('apoyo') && study.includes('movimiento')) return 'Apoyo para movimiento';
    if (mode === 'tac' || /\b(tac|tc|tomografia|angiotac)\b/.test(study)) return 'TAC';
    if (mode.includes('ultrason') || /\b(usg|ultrasonido|ecografia)\b/.test(study)) return 'USG';
    if (mode.includes('rayos') || /\b(rx|rayos x|radiografia|placa|tele de torax)\b/.test(study)) return 'Rayos X';
    return clean(existing?.category) || 'Otro';
  }

  let editingRowId = null;

  function savePatientForm(form, id = '') {
    const rows = readRows();
    const index = id ? rows.findIndex((row) => String(row?.id ?? '') === String(id)) : -1;
    const existing = index >= 0 ? rows[index] : null;
    const formData = new FormData(form);
    const target = clean(formData.get('target'));
    const category = inferCategory(formData.get('modality'), target, existing);
    const bed = clean(formData.get('bed'));

    if (!bed && !clean(formData.get('name')) && !target) return {ok:false, error:'Captura al menos cama/área, paciente o destino/estudio.'};
    if (category === 'Piso' && hasActiveFloorConflict(rows, bed, existing?.id || '')) {
      return {ok:false, error:`La cama ${bed || 'indicada'} ya tiene otro paciente pendiente a Piso.`};
    }

    const portable = /port[áa]til/i.test(target);
    const transport = portable ? 'No trasladar' : normalizeTransport(formData.get('transport'));
    const oxygenProbable = Boolean(document.getElementById('oxygenProbable')?.checked);
    const next = {
      ...(existing || {}),
      id: existing?.id || uid(),
      shiftId: existing?.shiftId || currentShiftId() || undefined,
      bed,
      name: clean(formData.get('name')),
      age: normalizeAge(formData.get('age')),
      sex: clean(formData.get('sex')) || 'No visible',
      category,
      modality: clean(formData.get('modality')) || existing?.modality || 'Otro',
      target,
      destination: category === 'Piso' ? target : clean(existing?.destination),
      diagnosis: clean(formData.get('diagnosis')),
      diagnosisMeaning: clean(formData.get('diagnosis')) ? clean(formData.get('diagnosisMeaning')) : '',
      transport,
      transportReason: clean(formData.get('transportReason')),
      oxygenProbable,
      oxygenReason: oxygenProbable ? clean(formData.get('oxygenReason')) : '',
      status: clean(existing?.status) || 'Pendiente',
      needsReview: false,
      reviewFields: [],
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    const updated = [...rows];
    if (index >= 0) updated[index] = next;
    else updated.unshift(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    dispatchSync('manual-edit-v65', {id:next.id, category:next.category});
    return {ok:true, row:next};
  }

  function setPatientFormError(message = '') {
    const node = document.getElementById('formError');
    if (!node) return;
    node.hidden = !message;
    node.textContent = message;
  }

  function closePatientSheet() {
    const backdrop = document.getElementById('sheetBackdrop');
    if (backdrop) backdrop.hidden = true;
    document.body?.classList?.remove('sheet-open');
  }

  function handlePatientSubmit(event) {
    const form = event.target;
    if (form?.id !== 'patientForm') return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const editing = /editar/i.test(clean(document.getElementById('sheetTitle')?.textContent));
    const result = savePatientForm(form, editing ? editingRowId : '');
    if (!result.ok) {
      setPatientFormError(result.error);
      return true;
    }
    setPatientFormError('');
    closePatientSheet();
    editingRowId = null;
    return true;
  }

  function formatPhotoSummary(summary = {}) {
    const added = Number(summary.added || 0);
    const updated = Number(summary.updated || 0);
    const duplicates = Number(summary.duplicates || 0);
    const review = Number(summary.review || 0);
    const errors = Number(summary.errors || 0);
    const pieces = [`${added} ${added === 1 ? 'agregado' : 'agregados'}`];
    if (updated) pieces.push(`${updated} ${updated === 1 ? 'actualizado' : 'actualizados'}`);
    if (duplicates) pieces.push(`${duplicates} ${duplicates === 1 ? 'duplicado' : 'duplicados'}`);
    if (review) pieces.push(`${review} ${review === 1 ? 'foto por revisar' : 'fotos por revisar'}`);
    if (errors) pieces.push(`${errors} ${errors === 1 ? 'con error' : 'con error'}`);
    return pieces.join(' · ');
  }

  function enhancePhotoSummary() {
    const summary = window.__pendientesPhotoQueueSummaryV65;
    if (!summary) return;
    const node = document.querySelector('.photo-queue-summary');
    if (!node) return;
    const text = formatPhotoSummary(summary);
    if (node.textContent !== text) node.textContent = text;
  }

  function trackClick(event) {
    const row = event.target.closest?.('.patient-row[data-id]');
    if (row && !event.target.closest?.('[data-remove], [data-quick-transport="1"]')) editingRowId = row.dataset.id || null;
    if (event.target.closest?.('#closeSheet') || event.target?.id === 'sheetBackdrop') editingRowId = null;
  }

  function startObserver() {
    const app = document.getElementById('app');
    if (!app || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(enhancePhotoSummary);
    observer.observe(app, {childList:true, subtree:true});
    enhancePhotoSummary();
  }

  window.__PENDIENTES_GLOBAL_STATUS_GESTURES__ = true;
  window.__pendientesStabilityV65 = {
    canonicalOrigin,
    hasActiveFloorConflict,
    createManualRow,
    saveQuickCaptureData,
    savePatientForm,
    formatPhotoSummary
  };

  document.addEventListener('click', trackClick, true);
  document.addEventListener('submit', (event) => {
    if (handleQuickSubmit(event)) return;
    handlePatientSubmit(event);
  }, true);
  document.addEventListener('pendientes:photo-queue-summary', enhancePhotoSummary);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, {once:true});
  else startObserver();
})();
