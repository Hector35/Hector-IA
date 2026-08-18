const STORAGE_KEY = 'pendientes-table-v1';
const LEGACY_RX_KEY = 'turno-rx-patients-v1';
const LEGACY_FLOOR_KEY = 'turno-rx-floor-v1';

const root = document.getElementById('app');
let rows = loadRows();
let editingId = null;
let processingPhotos = false;

const ICONS = {
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="9" cy="9" r="1.7"/><path d="m5.5 17 4.2-4.3 3.1 3.1 2.1-2.2 3.6 3.4"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16.5-1 3.5 3.5-1L18.7 7.8a2.1 2.1 0 0 0 0-3l-.5-.5a2.1 2.1 0 0 0-3 0L5 14.5v2Z"/><path d="m13.8 5.7 4.5 4.5"/></svg>'
};

const VISION_PROMPT = `Analiza esta foto de una solicitud, boleta o pizarrón hospitalario para crear pendientes operativos de traslado. Devuelve SOLO JSON válido, sin markdown, con este formato exacto: {"patients":[{"handwrittenBed":"","formBed":"","waitingRoomMarked":false,"bed":"","name":"","birthDate":null,"age":null,"target":"","transport":"Silla|Camilla|Por definir","transportReason":"","oxygenProbable":false,"oxygenReason":""}]}.
Extrae únicamente datos visibles; no inventes nombres, edades, estudios, destinos ni hechos clínicos.
REGLA CRÍTICA PARA CAMA: en estas solicitudes el número de cama puede estar escrito A MANO como un número grande y aislado en el margen o parte superior de la hoja (por ejemplo 10, 16, 28). Debes buscarlo de forma explícita aunque no esté dentro del recuadro impreso "CAMA NO.". Pon ese valor en handwrittenBed. Si el recuadro impreso "CAMA NO." contiene un código como UA16, CE1, C15 o UP, ponlo en formBed. waitingRoomMarked=true solo si está marcada la casilla "SALA DE ESPERA".
Para bed usa esta prioridad: 1) handwrittenBed si existe; 2) formBed si no hay handwrittenBed; 3) vacío si ninguno existe. "Sala de espera" NUNCA es una cama y NUNCA debe devolverse en bed, handwrittenBed ni formBed, aunque su casilla esté marcada. Una marca de sala de espera no invalida ni reemplaza un número manuscrito visible.
CE significa Corta Estancia y no debe convertirse en cama numérica; UP significa Urgencias Pediátricas. target es el destino/piso o el estudio solicitado, según lo visible. Si hay fecha de nacimiento visible, colócala como YYYY-MM-DD en birthDate; si la edad está explícita, úsala en age.
transport es una ESTIMACIÓN OPERATIVA, no una orden médica. Elige Silla cuando la información visible sugiera que el paciente está estable, ambulante o puede ir sentado; Camilla cuando haya inmovilidad, trauma importante, déficit neurológico, condición delicada, necesidad evidente de ir acostado o información equivalente. Puedes usar la ubicación visible como pista operativa, pero no inventes condiciones clínicas. Si no hay base suficiente, usa Por definir. transportReason debe explicar brevemente la pista visible o decir que no hay datos suficientes.
oxygenProbable=true SOLO si hay evidencia visible de oxígeno ya indicado/usado, soporte respiratorio, hipoxemia/SpO2 baja o dificultad respiratoria significativa. Si es false, oxygenReason debe ser vacío. Si es true, oxygenReason debe explicar brevemente la evidencia visible. Si hay varios pacientes en la foto, devuelve todos en patients.`;

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

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeBedCandidate(value) {
  const text = clean(value);
  if (!text) return '';
  if (/sala\s+de\s+espera/i.test(text)) return '';
  return text;
}

function resolveVisionBed(patient) {
  return normalizeBedCandidate(patient?.handwrittenBed)
    || normalizeBedCandidate(patient?.formBed)
    || normalizeBedCandidate(patient?.bed);
}

function normalizeTransport(value) {
  const text = clean(value).toLowerCase();
  if (text.includes('camilla')) return 'Camilla';
  if (text.includes('silla')) return 'Silla';
  if (text.includes('definir') || text.includes('pendiente')) return 'Por definir';
  return '';
}

function normalizeAge(value) {
  const text = clean(value);
  if (!text) return null;
  const age = Number.parseInt(text, 10);
  return Number.isFinite(age) && age >= 0 && age <= 130 ? age : null;
}

function ageFromBirthDate(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const birth = new Date(`${text}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
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
        age: normalizeAge(p.age),
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
        age: normalizeAge(p.age),
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
  const type = normalizeTransport(row.transport) || 'Por definir';
  const icon = type === 'Camilla' ? '🛏️' : type === 'Silla' ? '♿' : '•';
  const klass = type === 'Camilla' ? 'camilla' : type === 'Silla' ? 'silla' : 'unset';
  const reason = clean(row.transportReason);
  return `
    <div class="transport-main ${klass}"><span>${icon}</span><b>${esc(type)}</b></div>
    <div class="transport-reason ${reason ? '' : 'is-empty'}"><span>Motivo</span>${esc(reason || '—')}</div>
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
        <div class="capture-actions" aria-label="Opciones de captura">
          <button class="capture-icon-btn" id="galleryCapture" type="button" aria-label="Elegir foto">${ICONS.photo}</button>
          <button class="capture-icon-btn manual" id="manualCapture" type="button" aria-label="Captura manual">${ICONS.pencil}</button>
        </div>
        <input id="galleryInput" type="file" accept="image/*" multiple hidden />
      </header>

      <div class="capture-status" id="captureStatus" hidden></div>

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
              <th>Nombre / edad</th>
              <th>Destino / estudio</th>
              <th>Traslado / motivo</th>
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
                    <span>Usa foto o lápiz para capturar.</span>
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
            <span>Edad</span>
            <input id="age" name="age" type="number" inputmode="numeric" min="0" max="130" autocomplete="off" placeholder="Años" />
          </label>

          <label class="full">
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
              <option value="Por definir">Por definir</option>
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
  const age = normalizeAge(row.age);
  return `
    <tr class="patient-row" data-id="${esc(row.id)}" title="Toca para editar">
      <td class="bed-cell"><span>${esc(row.bed || '—')}</span></td>
      <td class="name-cell">
        <div class="patient-name">${esc(row.name || '—')}</div>
        <div class="age-line"><span>Edad</span>${age !== null ? `${age} años` : '—'}</div>
      </td>
      <td class="target-cell">${esc(row.target || '—')}</td>
      <td class="transport-cell">${renderTransport(row)}</td>
      <td class="action-cell">
        <button class="remove-btn" type="button" data-remove="${esc(row.id)}" aria-label="Quitar paciente">×</button>
      </td>
    </tr>
  `;
}

function bind() {
  document.getElementById('galleryCapture')?.addEventListener('click', () => document.getElementById('galleryInput')?.click());
  document.getElementById('manualCapture')?.addEventListener('click', () => openSheet());
  document.getElementById('galleryInput')?.addEventListener('change', handlePhotoInput);
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

function setCaptureStatus(message, state = 'busy') {
  const status = document.getElementById('captureStatus');
  if (!status) return;
  if (!message) {
    status.hidden = true;
    status.textContent = '';
    status.dataset.state = '';
    return;
  }
  status.hidden = false;
  status.dataset.state = state;
  status.textContent = message;
}

function parseVisionJSON(value) {
  if (value && typeof value === 'object') return value;
  const raw = clean(value);
  if (!raw) throw new Error('La IA no devolvió datos.');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || raw;
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
    throw new Error('No pude interpretar los datos de la foto.');
  }
}

function normalizeVisionRow(patient) {
  const age = normalizeAge(patient?.age) ?? ageFromBirthDate(patient?.birthDate);
  const oxygenProbable = Boolean(patient?.oxygenProbable);
  return {
    id: uid(),
    bed: resolveVisionBed(patient),
    name: clean(patient?.name),
    age,
    target: clean(patient?.target || patient?.study || patient?.destination),
    transport: normalizeTransport(patient?.transport) || 'Por definir',
    transportReason: clean(patient?.transportReason),
    oxygenProbable,
    oxygenReason: oxygenProbable ? clean(patient?.oxygenReason) : '',
    createdAt: new Date().toISOString()
  };
}

async function analyzePhoto(file) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) throw new Error('Selecciona una imagen.');
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name || 'La foto'} pesa más de 8 MB.`);

  const form = new FormData();
  form.append('image', file);
  form.append('prompt', VISION_PROMPT);

  const response = await fetch('/api/turno-rx/vision', {
    method: 'POST',
    headers: {'X-Turno-RX': '1'},
    body: form,
    credentials: 'same-origin'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `No se pudo analizar la foto (${response.status}).`);

  const parsed = parseVisionJSON(data.text || data.answer || data.output_text || data);
  const patients = Array.isArray(parsed?.patients) ? parsed.patients : [parsed];
  return patients.map(normalizeVisionRow).filter((row) => row.bed || row.name || row.target);
}

function rowKey(row) {
  return [row.bed, row.name, row.target].map((value) => clean(value).toLowerCase()).join('|');
}

function findMatchingRowIndex(list, incoming) {
  const key = rowKey(incoming);
  let index = key !== '||' ? list.findIndex((row) => rowKey(row) === key) : -1;
  if (index >= 0) return index;

  const name = clean(incoming.name).toLowerCase();
  const target = clean(incoming.target).toLowerCase();
  if (!name) return -1;

  index = list.findIndex((row) => {
    const rowName = clean(row.name).toLowerCase();
    const rowTarget = clean(row.target).toLowerCase();
    return rowName === name && (!target || !rowTarget || rowTarget === target);
  });
  return index;
}

function mergeRow(existing, incoming) {
  const incomingTransport = normalizeTransport(incoming.transport);
  const existingTransport = normalizeTransport(existing.transport);
  return {
    ...existing,
    bed: incoming.bed || normalizeBedCandidate(existing.bed) || '',
    name: incoming.name || existing.name || '',
    age: incoming.age ?? normalizeAge(existing.age),
    target: incoming.target || existing.target || '',
    transport: incomingTransport && incomingTransport !== 'Por definir' ? incomingTransport : (existingTransport || incomingTransport || 'Por definir'),
    transportReason: incoming.transportReason || existing.transportReason || '',
    oxygenProbable: Boolean(existing.oxygenProbable || incoming.oxygenProbable),
    oxygenReason: incoming.oxygenReason || existing.oxygenReason || ''
  };
}

function addAnalyzedRows(incomingRows) {
  const next = [...rows];
  for (const incoming of incomingRows) {
    const index = findMatchingRowIndex(next, incoming);
    if (index >= 0) next[index] = mergeRow(next[index], incoming);
    else next.unshift(incoming);
  }
  rows = next;
  save();
}

async function handlePhotoInput(event) {
  const input = event.currentTarget;
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length || processingPhotos) return;

  processingPhotos = true;
  const imported = [];
  const errors = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      setCaptureStatus(files.length > 1 ? `Leyendo foto ${index + 1} de ${files.length}…` : 'Leyendo foto…');
      try {
        imported.push(...await analyzePhoto(files[index]));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'No pude leer una foto.');
      }
    }

    if (imported.length) {
      addAnalyzedRows(imported);
      render();
      setCaptureStatus(`${imported.length} ${imported.length === 1 ? 'paciente agregado' : 'pacientes agregados'}.`, 'success');
      window.setTimeout(() => setCaptureStatus(''), 2600);
    } else {
      setCaptureStatus(errors[0] || 'No encontré pacientes en la foto.', 'error');
    }
  } finally {
    processingPhotos = false;
  }
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
  document.getElementById('age').value = normalizeAge(row?.age) ?? '';
  document.getElementById('name').value = row?.name || '';
  document.getElementById('target').value = row?.target || '';
  document.getElementById('transport').value = normalizeTransport(row?.transport) || 'Por definir';
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
    bed: clean(form.get('bed')),
    name: clean(form.get('name')),
    age: normalizeAge(form.get('age')),
    target: clean(form.get('target')),
    transport: normalizeTransport(form.get('transport')) || 'Por definir',
    transportReason: clean(form.get('transportReason')),
    oxygenProbable,
    oxygenReason: oxygenProbable ? clean(form.get('oxygenReason')) : ''
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
