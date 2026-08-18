(() => {
  const CATEGORY_MAP = {
    'Rayos X': { modality: 'Rayos X', target: 'Rayos X' },
    'TAC': { modality: 'TAC', target: 'TAC' },
    'Piso': { modality: 'Otro', target: 'Piso' },
    'USG': { modality: 'Ultrasonido', target: 'USG' },
    'Interconsulta': { modality: 'Otro', target: 'Interconsulta' },
    'Apoyo para movimiento': { modality: 'Otro', target: 'Apoyo para movimiento' }
  };

  const MANUAL_GROUPS = [
    { target: 'Piso', label: 'Piso' },
    { target: 'Interconsulta', label: 'Interconsulta' },
    { target: 'Apoyo para movimiento', label: 'Apoyo para movimiento' }
  ];

  let selectedCategory = '';

  function quickMarkup() {
    return `
      <div class="manual-quick-backdrop" id="manualQuickBackdrop" hidden>
        <form class="manual-quick-sheet" id="manualQuickForm" novalidate>
          <div class="manual-quick-handle" aria-hidden="true"></div>
          <div class="manual-quick-head">
            <div>
              <div class="manual-quick-kicker">CAPTURA MANUAL</div>
              <h2>Nuevo pendiente</h2>
            </div>
            <button class="manual-quick-close" id="manualQuickClose" type="button" aria-label="Cerrar">×</button>
          </div>

          <label class="manual-quick-bed">
            <span>Cama / Área</span>
            <input id="manualQuickBed" name="bed" autocomplete="off" autocapitalize="characters" placeholder="24, CE2, UP1…" />
          </label>

          <fieldset class="manual-quick-categories">
            <legend>¿Qué necesita?</legend>
            <div class="manual-quick-grid">
              ${Object.keys(CATEGORY_MAP).map((category) => `<button type="button" class="manual-category-btn" data-manual-category="${category}">${category === 'Apoyo para movimiento' ? 'Apoyo movimiento' : category}</button>`).join('')}
            </div>
          </fieldset>

          <div class="manual-quick-error" id="manualQuickError" hidden></div>
          <button class="manual-quick-save" id="manualQuickSave" type="submit" disabled>Guardar pendiente</button>
        </form>
      </div>`;
  }

  function ensureQuickSheet() {
    let backdrop = document.getElementById('manualQuickBackdrop');
    if (backdrop) return backdrop;

    document.body.insertAdjacentHTML('beforeend', quickMarkup());
    backdrop = document.getElementById('manualQuickBackdrop');

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeQuickSheet();
    });
    document.getElementById('manualQuickClose')?.addEventListener('click', closeQuickSheet);
    document.getElementById('manualQuickForm')?.addEventListener('submit', submitQuickCapture);
    document.getElementById('manualQuickBed')?.addEventListener('input', updateSaveState);
    document.querySelectorAll('[data-manual-category]').forEach((button) => {
      button.addEventListener('click', () => selectCategory(button.dataset.manualCategory || ''));
    });
    return backdrop;
  }

  function setQuickError(message = '') {
    const node = document.getElementById('manualQuickError');
    if (!node) return;
    node.hidden = !message;
    node.textContent = message;
  }

  function updateSaveState() {
    const bed = document.getElementById('manualQuickBed')?.value.trim() || '';
    const save = document.getElementById('manualQuickSave');
    if (save) save.disabled = !(bed && selectedCategory);
  }

  function selectCategory(category) {
    selectedCategory = CATEGORY_MAP[category] ? category : '';
    document.querySelectorAll('[data-manual-category]').forEach((button) => {
      const active = button.dataset.manualCategory === selectedCategory;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    setQuickError('');
    updateSaveState();
  }

  function openQuickSheet() {
    const backdrop = ensureQuickSheet();
    selectedCategory = '';
    const bed = document.getElementById('manualQuickBed');
    if (bed) bed.value = '';
    document.querySelectorAll('[data-manual-category]').forEach((button) => {
      button.classList.remove('is-selected');
      button.setAttribute('aria-pressed', 'false');
    });
    setQuickError('');
    updateSaveState();
    backdrop.hidden = false;
    document.body.classList.add('manual-quick-open');
    requestAnimationFrame(() => bed?.focus());
  }

  function closeQuickSheet() {
    const backdrop = document.getElementById('manualQuickBackdrop');
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('manual-quick-open');
  }

  function setField(id, value) {
    const field = document.getElementById(id);
    if (field) field.value = value;
  }

  function resetFullFormForQuickCapture(bed, category) {
    const mapped = CATEGORY_MAP[category];
    if (!mapped) return false;

    setField('bed', bed);
    setField('age', '');
    setField('name', '');
    setField('sex', 'No visible');
    setField('modality', mapped.modality);
    setField('target', mapped.target);
    setField('diagnosis', '');
    setField('diagnosisMeaning', '');
    setField('transport', 'Por definir');
    setField('transportReason', '');
    setField('oxygenReason', '');
    const oxygen = document.getElementById('oxygenProbable');
    if (oxygen) oxygen.checked = false;
    return true;
  }

  function submitQuickCapture(event) {
    event.preventDefault();
    const bed = document.getElementById('manualQuickBed')?.value.trim() || '';
    if (!bed) {
      setQuickError('Escribe la cama o área.');
      document.getElementById('manualQuickBed')?.focus();
      return;
    }
    if (!selectedCategory) {
      setQuickError('Selecciona qué necesita.');
      return;
    }

    const patientForm = document.getElementById('patientForm');
    if (!patientForm || !resetFullFormForQuickCapture(bed, selectedCategory)) {
      setQuickError('No pude abrir la captura. Recarga Pendientes e inténtalo otra vez.');
      return;
    }

    closeQuickSheet();
    patientForm.requestSubmit();
  }

  function createCategorySection(template, rows, label, slug) {
    const section = template.cloneNode(true);
    section.classList.remove('modality-otro');
    section.classList.add('manual-category-generated', `manual-category-${slug}`);
    section.setAttribute('aria-label', label);
    const title = section.querySelector('.modality-title');
    if (title) title.innerHTML = `${label} — <strong>${rows.length}</strong>`;
    const body = section.querySelector('tbody');
    if (body) body.replaceChildren(...rows);
    return section;
  }

  function reorganizeManualCategories() {
    const app = document.getElementById('app');
    if (!app || app.querySelector('.manual-category-generated')) return;
    const other = app.querySelector('.modality-section.modality-otro');
    if (!other) return;

    const body = other.querySelector('tbody');
    if (!body) return;
    const rows = [...body.querySelectorAll('tr.patient-row')];
    let inserted = false;

    for (const group of MANUAL_GROUPS) {
      const matches = rows.filter((row) => (row.querySelector('.study-cell')?.textContent || '').trim() === group.target);
      if (!matches.length) continue;
      const section = createCategorySection(other, matches, group.label, group.target.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      other.parentNode?.insertBefore(section, other);
      inserted = true;
    }

    if (!inserted) return;
    const remaining = [...body.querySelectorAll('tr.patient-row')];
    if (!remaining.length) {
      other.remove();
    } else {
      const title = other.querySelector('.modality-title');
      if (title) title.innerHTML = `Otros estudios — <strong>${remaining.length}</strong>`;
    }
  }

  document.addEventListener('click', (event) => {
    const pencil = event.target.closest?.('#manualCapture');
    if (!pencil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openQuickSheet();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('manualQuickBackdrop')?.hidden) closeQuickSheet();
  });

  const observer = new MutationObserver(() => reorganizeManualCategories());
  const app = document.getElementById('app');
  if (app) observer.observe(app, { childList: true, subtree: true });
  reorganizeManualCategories();
})();