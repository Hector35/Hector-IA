(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const SHIFT_KEY = 'pendientes-shift-v1';
  const QUICK_TARGETS = new Map([
    ['Piso', 'Piso'],
    ['Interconsulta', 'Interconsulta'],
    ['Apoyo para movimiento', 'Apoyo para movimiento']
  ]);

  let bypassManualCapture = false;
  let selectedCategory = '';
  let observer = null;
  let organizeScheduled = false;

  const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  function ensureStyles() {
    if (document.getElementById('quickManualV38Styles')) return;
    const style = document.createElement('style');
    style.id = 'quickManualV38Styles';
    style.textContent = `
      .quick-manual-backdrop-v38[hidden] { display: none !important; }
      .quick-manual-sheet-v38 {
        max-height: min(76vh, 620px);
      }
      .quick-manual-sheet-v38 .quick-manual-body-v38 {
        display: grid;
        gap: 16px;
      }
      .quick-manual-field-v38 {
        display: grid;
        gap: 7px;
      }
      .quick-manual-field-v38 > span,
      .quick-manual-question-v38 {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .02em;
        color: var(--muted, #63727d);
      }
      .quick-manual-field-v38 input {
        width: 100%;
        min-height: 48px;
        box-sizing: border-box;
        border: 1px solid rgba(31, 57, 72, .14);
        border-radius: 13px;
        padding: 11px 13px;
        background: rgba(255, 255, 255, .92);
        color: inherit;
        font: inherit;
        font-size: 17px;
        font-weight: 750;
        outline: none;
        -webkit-appearance: none;
      }
      .quick-manual-field-v38 input:focus {
        border-color: rgba(30, 96, 128, .42);
        box-shadow: 0 0 0 3px rgba(30, 96, 128, .10);
      }
      .quick-manual-categories-v38 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
      }
      .quick-manual-category-v38 {
        min-height: 48px;
        border: 1px solid rgba(31, 57, 72, .13);
        border-radius: 13px;
        padding: 10px 9px;
        background: rgba(255, 255, 255, .78);
        color: inherit;
        font: inherit;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.15;
        text-align: center;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      .quick-manual-category-v38.is-selected {
        border-color: rgba(27, 93, 124, .38);
        background: rgba(27, 93, 124, .10);
        box-shadow: inset 0 0 0 1px rgba(27, 93, 124, .06);
      }
      .quick-manual-save-v38[disabled] {
        opacity: .45;
        pointer-events: none;
      }
      .quick-manual-hint-v38 {
        margin: -5px 0 0;
        color: var(--muted, #667782);
        font-size: 11px;
        line-height: 1.35;
      }
      body.quick-manual-open-v38 { overflow: hidden; }
      body.quick-manual-bridging-v38 #sheetBackdrop { display: none !important; }
      .quick-category-section-v38 .patient-name:empty::after { content: '—'; }
      @media (max-width: 390px) {
        .quick-manual-categories-v38 { gap: 8px; }
        .quick-manual-category-v38 { min-height: 46px; font-size: 12.5px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureQuickSheet() {
    let backdrop = document.getElementById('quickManualBackdropV38');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'quickManualBackdropV38';
    backdrop.className = 'sheet-backdrop quick-manual-backdrop-v38';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <form class="capture-sheet quick-manual-sheet-v38" id="quickManualFormV38">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <div>
            <div class="sheet-kicker">PENDIENTE</div>
            <h2>Captura manual</h2>
          </div>
          <button type="button" class="close-btn" id="quickManualCloseV38" aria-label="Cerrar">×</button>
        </div>
        <div class="quick-manual-body-v38">
          <label class="quick-manual-field-v38">
            <span>Cama / Área</span>
            <input id="quickManualBedV38" name="bed" autocomplete="off" inputmode="text" placeholder="24, CE2, UP1, UI1…" />
          </label>
          <div>
            <div class="quick-manual-question-v38">¿Qué necesita?</div>
            <div class="quick-manual-categories-v38" role="group" aria-label="Categoría del pendiente">
              <button type="button" class="quick-manual-category-v38" data-quick-category="Rayos X">Rayos X</button>
              <button type="button" class="quick-manual-category-v38" data-quick-category="TAC">TAC</button>
              <button type="button" class="quick-manual-category-v38" data-quick-category="Piso">Piso</button>
              <button type="button" class="quick-manual-category-v38" data-quick-category="USG">USG</button>
              <button type="button" class="quick-manual-category-v38" data-quick-category="Interconsulta">Interconsulta</button>
              <button type="button" class="quick-manual-category-v38" data-quick-category="Apoyo para movimiento">Apoyo movimiento</button>
            </div>
          </div>
          <p class="quick-manual-hint-v38">Apoyo movimiento puede ser solo mover, acomodar o pasar al paciente de cama a camilla; no implica enviarlo a otro servicio.</p>
          <button class="save-btn quick-manual-save-v38" id="quickManualSaveV38" type="submit" disabled>Guardar pendiente</button>
        </div>
      </form>`;
    document.body.appendChild(backdrop);

    const form = backdrop.querySelector('#quickManualFormV38');
    const input = backdrop.querySelector('#quickManualBedV38');
    const save = backdrop.querySelector('#quickManualSaveV38');

    const updateSave = () => {
      save.disabled = !normalize(input.value) || !selectedCategory;
    };

    input.addEventListener('input', updateSave);
    backdrop.querySelectorAll('[data-quick-category]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedCategory = button.dataset.quickCategory || '';
        backdrop.querySelectorAll('[data-quick-category]').forEach((item) => {
          const selected = item === button;
          item.classList.toggle('is-selected', selected);
          item.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        updateSave();
      });
    });

    backdrop.querySelector('#quickManualCloseV38').addEventListener('click', closeQuickSheet);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeQuickSheet();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const bed = normalize(input.value);
      if (!bed || !selectedCategory) return;
      bridgeToExistingForm(bed, selectedCategory);
    });

    return backdrop;
  }

  function openQuickSheet() {
    const backdrop = ensureQuickSheet();
    selectedCategory = '';
    const input = backdrop.querySelector('#quickManualBedV38');
    input.value = '';
    backdrop.querySelectorAll('[data-quick-category]').forEach((item) => {
      item.classList.remove('is-selected');
      item.setAttribute('aria-pressed', 'false');
    });
    backdrop.querySelector('#quickManualSaveV38').disabled = true;
    backdrop.hidden = false;
    document.body.classList.add('quick-manual-open-v38');
    requestAnimationFrame(() => input.focus());
  }

  function closeQuickSheet() {
    const backdrop = document.getElementById('quickManualBackdropV38');
    if (backdrop) backdrop.hidden = true;
    selectedCategory = '';
    document.body.classList.remove('quick-manual-open-v38');
  }

  function categoryBridge(category) {
    if (category === 'Rayos X') return { modality: 'Rayos X', target: '' };
    if (category === 'TAC') return { modality: 'TAC', target: '' };
    if (category === 'USG') return { modality: 'Ultrasonido', target: '' };
    if (category === 'Piso') return { modality: 'Otro', target: 'Piso' };
    if (category === 'Interconsulta') return { modality: 'Otro', target: 'Interconsulta' };
    return { modality: 'Otro', target: 'Apoyo para movimiento' };
  }

  function setValue(id, value) {
    const field = document.getElementById(id);
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value;
  }

  function bridgeToExistingForm(bed, category) {
    const manual = document.getElementById('manualCapture');
    if (!manual) return;

    closeQuickSheet();
    document.body.classList.add('quick-manual-bridging-v38');
    bypassManualCapture = true;
    manual.click();
    bypassManualCapture = false;

    const form = document.getElementById('patientForm');
    if (!form) {
      document.body.classList.remove('quick-manual-bridging-v38');
      return;
    }

    const bridge = categoryBridge(category);
    setValue('bed', bed);
    setValue('age', '');
    setValue('name', '');
    setValue('sex', 'No visible');
    setValue('modality', bridge.modality);
    setValue('target', bridge.target);
    setValue('diagnosis', '');
    setValue('diagnosisMeaning', '');
    setValue('transport', 'Por definir');
    setValue('transportReason', '');
    setValue('oxygenProbable', false);
    setValue('oxygenReason', '');

    form.requestSubmit();
    queueMicrotask(() => {
      document.body.classList.remove('quick-manual-bridging-v38');
      organizeQuickCategories();
    });
  }

  function readRows() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function rawSectionName(section) {
    const title = section?.querySelector('.modality-title');
    const named = title?.querySelector('.modality-name-v33');
    if (named) return normalize(named.textContent);
    const strong = title?.querySelector('strong');
    if (!title) return '';
    return normalize([...title.childNodes]
      .filter((node) => node !== strong)
      .map((node) => node.textContent || '')
      .join(' ')
      .replace(/\s*[—-]\s*$/, ''));
  }

  function relabelSection(section, label) {
    if (!section) return;
    const title = section.querySelector('.modality-title');
    if (!title) return;
    const count = section.querySelectorAll('tbody .patient-row').length;
    const currentLabel = normalize(title.querySelector('.modality-name-v33')?.textContent || rawSectionName(section));
    const currentCount = normalize(title.querySelector('.modality-count-v33')?.textContent || title.querySelector('strong')?.textContent);
    if (title.dataset.v33Title === '1' && currentLabel === label && currentCount === String(count)) return;
    title.dataset.v33Title = '1';
    title.innerHTML = `<span class="modality-name-v33"></span><strong class="modality-count-v33" aria-label="${count} pendientes">${count}</strong>`;
    title.querySelector('.modality-name-v33').textContent = label;
  }

  function createCategorySection(label, key) {
    const section = document.createElement('section');
    section.className = `modality-section quick-category-section-v38 quick-category-${key}-v38`;
    section.dataset.quickCategorySection = key;
    section.setAttribute('aria-label', label);
    section.innerHTML = `
      <div class="modality-title" data-v33-title="1"><span class="modality-name-v33"></span><strong class="modality-count-v33">0</strong></div>
      <div class="table-wrap imaging-table-wrap">
        <table class="patient-table imaging-table">
          <colgroup><col class="col-origin"/><col class="col-patient"/><col class="col-move"/><col class="col-study"/><col class="col-diagnosis"/><col class="col-meaning"/><col class="col-action"/></colgroup>
          <thead><tr><th>Origen</th><th>Paciente</th><th>Traslado</th><th>Estudio</th><th>Diagnóstico</th><th>Qué significa</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>`;
    section.querySelector('.modality-name-v33').textContent = label;
    return section;
  }

  function ensureCategorySection(board, label, key) {
    let section = board.querySelector(`[data-quick-category-section="${key}"]`);
    if (!section) {
      section = createCategorySection(label, key);
      board.appendChild(section);
    }
    return section;
  }

  function organizeQuickCategories() {
    organizeScheduled = false;
    const board = document.querySelector('.imaging-board');
    if (!board) return;

    const stored = new Map(readRows().filter((row) => row?.id).map((row) => [String(row.id), row]));
    const otherSection = [...board.querySelectorAll('.modality-section')].find((section) => rawSectionName(section) === 'Otros estudios' || section.classList.contains('modality-otro'));

    const custom = [
      ['Piso', 'piso'],
      ['Interconsulta', 'interconsulta'],
      ['Apoyo para movimiento', 'apoyo']
    ].map(([label, key]) => ({
      label,
      key,
      section: board.querySelector(`[data-quick-category-section="${key}"]`)
    }));

    if (otherSection) {
      otherSection.querySelectorAll('tbody .patient-row[data-id]').forEach((tr) => {
        const row = stored.get(String(tr.dataset.id || ''));
        const target = normalize(row?.target);
        const match = custom.find((item) => QUICK_TARGETS.get(item.label) === target);
        if (!match) return;
        if (!match.section || !match.section.isConnected) match.section = ensureCategorySection(board, match.label, match.key);
        match.section.querySelector('tbody')?.appendChild(tr);
      });
    }

    custom.forEach((item) => {
      if (!item.section || !item.section.isConnected) return;
      const count = item.section.querySelectorAll('tbody .patient-row').length;
      if (!count) item.section.remove();
      else relabelSection(item.section, item.label);
    });

    const sections = [...board.querySelectorAll('.modality-section')];
    const rayos = sections.find((section) => rawSectionName(section) === 'Rayos X');
    const tac = sections.find((section) => rawSectionName(section) === 'TAC');
    const usg = sections.find((section) => rawSectionName(section) === 'Ultrasonido' || rawSectionName(section) === 'USG');
    if (usg) relabelSection(usg, 'USG');

    const piso = board.querySelector('[data-quick-category-section="piso"]');
    const interconsulta = board.querySelector('[data-quick-category-section="interconsulta"]');
    const apoyo = board.querySelector('[data-quick-category-section="apoyo"]');

    let visibleOther = null;
    if (otherSection) {
      const otherCount = otherSection.querySelectorAll('tbody .patient-row').length;
      if (!otherCount) otherSection.style.display = 'none';
      else {
        otherSection.style.display = '';
        relabelSection(otherSection, 'Otros estudios');
        visibleOther = otherSection;
      }
    }

    const desired = [rayos, tac, piso, usg, interconsulta, apoyo, visibleOther].filter(Boolean);
    const current = [...board.children].filter((node) => desired.includes(node));
    const sameOrder = current.length === desired.length && current.every((node, index) => node === desired[index]);
    if (!sameOrder) desired.forEach((section) => board.appendChild(section));
  }

  function scheduleOrganize() {
    if (organizeScheduled) return;
    organizeScheduled = true;
    requestAnimationFrame(organizeQuickCategories);
  }

  function onCaptureClick(event) {
    const manual = event.target.closest?.('#manualCapture');
    if (!manual || bypassManualCapture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openQuickSheet();
  }

  function start() {
    ensureStyles();
    ensureQuickSheet();
    organizeQuickCategories();
    document.addEventListener('click', onCaptureClick, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !document.getElementById('quickManualBackdropV38')?.hidden) closeQuickSheet();
    });

    const target = document.getElementById('app') || document.body;
    if (target && !observer) {
      observer = new MutationObserver(scheduleOrganize);
      observer.observe(target, { childList: true, subtree: true });
    }

    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY || event.key === SHIFT_KEY) scheduleOrganize();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
