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
        createdAt: p.createdAt || new Date().toISOString()
      }))
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  return migrated;
}

function transportLabel(value) {
  if (value === 'Camilla') return '🛏 Camilla';
  if (value === 'Silla') return '♿ Silla';
  return '—';
}

function render() {
  root.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <h1>Pendientes</h1>
        <button class="add-btn" id="addPatient">＋ Capturar</button>
      </header>

      <section class="table-shell" aria-label="Pacientes pendientes">
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
                <td colspan="5">Sin pacientes. Toca <b>Capturar</b>.</td>
              </tr>
            `}
          </tbody>
        </table>
      </section>
    </main>

    <div class="sheet-backdrop" id="sheetBackdrop" hidden>
      <form class="capture-sheet" id="patientForm">
        <div class="sheet-head">
          <h2 id="sheetTitle">Capturar paciente</h2>
          <button type="button" class="close-btn" id="closeSheet" aria-label="Cerrar">×</button>
        </div>

        <label>
          <span>Cama / área</span>
          <input id="bed" name="bed" autocomplete="off" placeholder="C15, CE2, UP…" />
        </label>

        <label>
          <span>Nombre</span>
          <input id="name" name="name" autocomplete="off" placeholder="Nombre del paciente" />
        </label>

        <label>
          <span>Destino / estudio</span>
          <input id="target" name="target" autocomplete="off" placeholder="Piso 3, Tórax P.A.…" />
        </label>

        <label>
          <span>Traslado</span>
          <select id="transport" name="transport">
            <option value="">—</option>
            <option value="Silla">Silla</option>
            <option value="Camilla">Camilla</option>
          </select>
        </label>

        <button class="save-btn" type="submit">Guardar</button>
      </form>
    </div>
  `;

  bind();
}

function renderRow(row) {
  return `
    <tr class="patient-row" data-id="${esc(row.id)}" title="Toca para editar">
      <td class="bed-cell">${esc(row.bed || '—')}</td>
      <td class="name-cell">${esc(row.name || '—')}</td>
      <td class="target-cell">${esc(row.target || '—')}</td>
      <td class="transport-cell">${esc(transportLabel(row.transport))}</td>
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
}

function openSheet(id = null) {
  editingId = id;
  const row = rows.find((item) => item.id === id);
  const backdrop = document.getElementById('sheetBackdrop');
  const title = document.getElementById('sheetTitle');

  title.textContent = row ? 'Editar paciente' : 'Capturar paciente';
  document.getElementById('bed').value = row?.bed || '';
  document.getElementById('name').value = row?.name || '';
  document.getElementById('target').value = row?.target || '';
  document.getElementById('transport').value = row?.transport || '';

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
  const next = {
    bed: String(form.get('bed') || '').trim(),
    name: String(form.get('name') || '').trim(),
    target: String(form.get('target') || '').trim(),
    transport: normalizeTransport(form.get('transport'))
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
