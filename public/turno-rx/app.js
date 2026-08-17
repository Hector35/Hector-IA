const STORAGE_KEY = 'pendientes-table-v1';
const LEGACY_RX_KEY = 'turno-rx-patients-v1';
const LEGACY_FLOOR_KEY = 'turno-rx-floor-v1';

const root = document.getElementById('app');
let rows = loadRows();
let editingId = null;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function normalizeTransport(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('camilla')) return 'Camilla';
  if (text.includes('silla')) return 'Silla';
  return '';
}

function loadRows() {
  const current = read(STORAGE_KEY, null);
  if (Array.isArray(current)) return current;

  const rx = read(LEGACY_RX_KEY, []);
  const floor = read(LEGACY_FLOOR_KEY, []);
  const migrated = [
    ...rx
      .filter((p) => p?.status !== 'Realizado')
      .map((p) => ({
        id: p.id || uid(),
        bed: p.bed || '',
        name: p.name || '',
        target: p.study || '',
        transport: normalizeTransport(p.transport),
        transportReason: p.transportReason || '',
        oxygenProbable: Boolean(p.oxygenProbable),
        oxygenReason: p.oxygenReason || '',
        createdAt: p.createdAt || new Date().toISOString()
      })),
    ...floor
      .filter((p) => p?.status !== 'Realizado')
      .map((p) => ({
        id: p.id || uid(),
        bed: p.bed || '',
        name: p.name || '',
        target: p.destination || '',
        transport: normalizeTransport(p.transport),
        transportReason: p.transportReason || '',
        oxygenProbable: Boolean(p.oxygenProbable),
        oxygenReason: p.oxygenReason || '',
        createdAt: p.createdAt || new Date().toISOString()
      }))
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  return migrated;
}

function renderTransport(row) {
  const type = row.transport || '';
  const icon = type === 'Camilla' ? '🛏️' : type === 'Silla' ? '♿' : '•';
  const klass = type === 'Camilla' ? 'camilla' : type === 'Silla' ? 'silla' : 'unset';
  return `
    <div class="transport-main ${klass}"><span>${icon}</span><b>${esc(type || '—')}</b></div>
    ${row.transportReason ? `<div class="transport-reason">${esc(row.transportReason)}</div>` : ''}
    ${row.oxygenProbable ? `<div class="oxygen-chip">O₂${row.oxygenReason ? ` · ${esc(row.oxygenReason)}` : ''}</div>` : ''}
  `;
}

function render() {
  root.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-dot"></span>
          <h1>Pendientes</h1>
        </div>
        <button class="add-btn" id="addPatient"><span>＋</span> Capturar</button>
      </header>

      <section class="table-wrap" aria-label="Pacientes pendientes">
        <table class="patient-table">
          <colgroup>
            <col class="col-bed" />
            <col class="col-name" />
            <col class="col-target" />
            <col class="col-transport" />
            <col class="col-action" />
          </colgroup>
          <thead>
            <tr>
              <th>Cama</th>
              <th>Nombre</th>
              <th>Destino / estudio</th>
              <th>Traslado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(renderRow).join('') : `
              <tr class="empty-row">
                <td colspan="5">
                  <div class="empty-state">
                    <div class="empty-icon">＋</div>
                    <b>Sin pendientes</b>
                    <span>Toca Capturar para agregar el primero.</span>
                  </div>
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </section>
    </main>

    <div class="sheet-backdrop" id="sheetBackdrop" hidden>
      <form class="capture-sheet" id="patientForm">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <div>
            <div class="sheet-kicker">PENDIENTE</div>
            <h2 id="sheetTitle">Capturar paciente</h2>
          </div>
          <button type="button" class="close-btn" id="closeSheet" aria-label="Cerrar">×</button>
        </div>

        <div class="form-grid">
          <label>
            <span>Cama / área</span>
            <input id="bed" name="bed" autocomplete="off" placeholder="C15, CE2, UP…" />
          </label>

          <label>
            <span>Nombre</span>
            <input id="name" name="name" autocomplete="off" placeholder="Nombre del paciente" />
          </label>

          <label class="full">
            <span>Destino / estudio</span>
            <input id="target" name="target" autocomplete="off" placeholder="Piso 3, Tórax P.A.…" />
          </label>

          <label>
            <span>Traslado más probable</span>
            <select id="transport" name="transport">
              <option value="">—</option>
              <option value="Silla">Silla</option>
              <option value="Camilla">Camilla</option>
            </select>
          </label>

          <label>
            <span>Por qué</span>
            <input id="transportReason" name="transportReason" autocomplete="off" placeholder="Razón breve" />
          </label>

          <label class="oxygen-toggle full">
            <input id="oxygenProbable" name="oxygenProbable" type="checkbox" />
            <span class="toggle-ui"></span>
            <span class="toggle-copy"><b>O₂ probable</b><small>Solo si realmente parece necesario.</small></span>
          </label>

          <label class="full oxygen-reason" id="oxygenReasonWrap" hidden>
            <span>Por qué O₂</span>
            <input id="oxygenReason" name="oxygenReason" autocomplete="off" placeholder="Razón breve" />
          </label>
        </div>

        <button class="save-btn" type="submit">Guardar pendiente</button>
      </form>
    </div>
  `;

  bind();
}

function renderRow(row) {
  return `
    <tr class="patient-row" data-id="${esc(row.id)}" title="Toca para editar">
      <td class="bed-cell"><span>${esc(row.bed || '—')}</span></td>
      <td class="name-cell">${esc(row.name || '—')}</td>
      <td class="target-cell">${esc(row.target || '—')}</td>
      <td class="transport-cell">${renderTransport(row)}</td>
      <td class="action-cell">
        <button class="remove-btn" type="button" data-remove="${esc(row.id)}" aria-label="Quitar paciente">×</button>
      </td>
    </tr>
  `;
}

function bind() {
  document.getElementById('addPatient')?.addEventListener('click', () => openSheet());
  document.getElementById('closeSheet')?.addEventListener('click', closeSheet);
  document.getElementById('sheetBackdrop')?.addEventListener('click', (event) => {
    if (event.target.id === 'sheetBackdrop') closeSheet();
  });

  document.querySelectorAll('.patient-row').forEach((tr) => {
    tr.addEventListener('click', (event) => {
      if (event.target.closest('[data-remove]')) return;
      openSheet(tr.dataset.id);
    });
  });

  document.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => removeRow(button.dataset.remove));
  });

  document.getElementById('patientForm')?.addEventListener('submit', submitForm);
  document.getElementById('oxygenProbable')?.addEventListener('change', syncOxygenField);
}

function syncOxygenField() {
  const checked = document.getElementById('oxygenProbable')?.checked;
  const wrap = document.getElementById('oxygenReasonWrap');
  if (wrap) wrap.hidden = !checked;
}

function openSheet(id = null) {
  editingId = id;
  const row = rows.find((item) => item.id === id);
  const backdrop = document.getElementById('sheetBackdrop');

  document.getElementById('sheetTitle').textContent = row ? 'Editar paciente' : 'Capturar paciente';
  document.getElementById('bed').value = row?.bed || '';
  document.getElementById('name').value = row?.name || '';
  document.getElementById('target').value = row?.target || '';
  document.getElementById('transport').value = row?.transport || '';
  document.getElementById('transportReason').value = row?.transportReason || '';
  document.getElementById('oxygenProbable').checked = Boolean(row?.oxygenProbable);
  document.getElementById('oxygenReason').value = row?.oxygenReason || '';
  syncOxygenField();

  backdrop.hidden = false;
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => document.getElementById('bed')?.focus());
}

function closeSheet() {
  editingId = null;
  document.getElementById('sheetBackdrop').hidden = true;
  document.body.classList.remove('sheet-open');
}

function submitForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const oxygenProbable = document.getElementById('oxygenProbable')?.checked || false;
  const next = {
    bed: String(form.get('bed') || '').trim(),
    name: String(form.get('name') || '').trim(),
    target: String(form.get('target') || '').trim(),
    transport: normalizeTransport(form.get('transport')),
    transportReason: String(form.get('transportReason') || '').trim(),
    oxygenProbable,
    oxygenReason: oxygenProbable ? String(form.get('oxygenReason') || '').trim() : ''
  };

  if (!next.bed && !next.name && !next.target) {
    document.getElementById('bed')?.focus();
    return;
  }

  if (editingId) {
    rows = rows.map((row) => row.id === editingId ? {...row, ...next} : row);
  } else {
    rows.unshift({id: uid(), ...next, createdAt: new Date().toISOString()});
  }

  save();
  closeSheet();
  render();
}

function removeRow(id) {
  rows = rows.filter((row) => row.id !== id);
  save();
  render();
}

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/turno-rx/sw.js').catch(() => {});
  });
}
