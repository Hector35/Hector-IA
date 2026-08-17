const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const KEYS = {
  rx: 'turno-rx-patients-v1',
  floor: 'turno-rx-floor-v1',
  meta: 'turno-rx-meta-v1'
};

const state = {
  tab: 'rx',
  rx: read(KEYS.rx, []),
  floor: read(KEYS.floor, []),
  startedAt: read(KEYS.meta, {}).startedAt || new Date().toISOString(),
  modal: null,
  rxDraft: null,
  floorDraft: null,
  floorImport: [],
  installPrompt: null,
  authKnown: false,
  authenticated: false,
  loading: false,
  error: ''
};

const root = $('#app');

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persist() {
  localStorage.setItem(KEYS.rx, JSON.stringify(state.rx));
  localStorage.setItem(KEYS.floor, JSON.stringify(state.floor));
  localStorage.setItem(KEYS.meta, JSON.stringify({startedAt: state.startedAt}));
}

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function today() {
  return new Intl.DateTimeFormat('es-MX', {weekday:'short', day:'numeric', month:'short'}).format(new Date());
}

function time(value) {
  return new Intl.DateTimeFormat('es-MX', {hour:'2-digit', minute:'2-digit'}).format(new Date(value));
}

function ageFromBirthDate(value) {
  if (!value) return null;
  const dob = new Date(`${value}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function normalizeTransport(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('camilla')) return 'Camilla';
  if (text.includes('silla')) return 'Silla';
  return 'Por definir';
}

function transportClass(value) {
  return value.toLowerCase().replaceAll(' ', '-');
}

function summary(items) {
  return {
    total: items.length,
    pending: items.filter((p) => p.status === 'Pendiente').length,
    moving: items.filter((p) => p.status === 'En traslado').length,
    done: items.filter((p) => p.status === 'Realizado').length
  };
}

function toast(message) {
  const old = $('.toast');
  if (old) old.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2300);
}

function render() {
  const items = state.tab === 'rx' ? state.rx : state.floor;
  const sum = summary(items);
  const oxygen = state.rx.filter((p) => p.oxygenProbable && p.status !== 'Realizado').length;
  root.innerHTML = `
    <main class="app">
      <header class="top">
        <div>
          <div class="eyebrow">PWA independiente · turno</div>
          <h1>Turno RX</h1>
          <div class="sub">${esc(today())} · iniciado ${esc(time(state.startedAt))}</div>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="copyCut" aria-label="Copiar corte">⎘</button>
          <button class="icon-btn" id="newShift" aria-label="Iniciar turno nuevo">↻</button>
        </div>
      </header>

      ${state.installPrompt ? `<div class="install"><p>Instálala como app para abrirla directo en el turno.</p><button class="primary" id="installBtn">Instalar</button></div>` : ''}
      ${state.authKnown && !state.authenticated ? `<div class="notice">La captura manual funciona. Para analizar fotos con IA, inicia sesión una vez en el sistema principal y vuelve aquí. <a href="/" style="color:inherit;font-weight:800">Abrir sesión</a>.</div>` : ''}

      <nav class="tabs" aria-label="Secciones">
        <button class="${state.tab === 'rx' ? 'active' : ''}" data-tab="rx">🩻 Rayos X</button>
        <button class="${state.tab === 'floor' ? 'active' : ''}" data-tab="floor">🏥 A piso</button>
      </nav>

      <section class="summary">
        <div class="metric"><b>${sum.pending}</b><span>Pendientes</span></div>
        <div class="metric"><b>${sum.moving}</b><span>En traslado</span></div>
        <div class="metric"><b>${sum.done}</b><span>Realizados</span></div>
        <div class="metric"><b>${state.tab === 'rx' ? oxygen : sum.total}</b><span>${state.tab === 'rx' ? 'O₂ probable' : 'Total'}</span></div>
      </section>

      ${state.tab === 'rx' ? renderRx() : renderFloor()}
      <p class="footer-note">Silla/camilla y O₂ son estimaciones operativas basadas en la información visible. Corrige cualquier dato antes de usarlo. Las fotos no se guardan en esta PWA.</p>
    </main>
    ${state.modal ? renderModal() : ''}
    ${state.loading ? `<div class="loading"><div><div class="spinner"></div><b>Analizando imagen…</b><div class="sub" style="margin-top:7px">Extraigo solo lo visible y preparo una revisión.</div></div></div>` : ''}
  `;
  bind();
}

function renderRx() {
  return `
    <section class="actions">
      <button class="primary" id="rxPhoto">📷 Leer solicitud</button>
      <button class="ghost" id="rxManual">＋ Agregar manual</button>
      <input id="rxFile" type="file" accept="image/*" capture="environment" hidden />
    </section>
    <div class="section-title"><h2>Pacientes de Rayos X</h2><span>${state.rx.length} en el turno</span></div>
    ${state.rx.length ? `<div class="list">${state.rx.map(rxCard).join('')}</div>` : `<div class="empty">Toma una foto de la solicitud o agrega el primer paciente.</div>`}
  `;
}

function rxCard(p) {
  return `
    <article class="card ${p.status === 'Realizado' ? 'done' : ''}" data-id="${esc(p.id)}">
      <div class="card-head">
        <div>
          <div class="bed">${esc(p.bed || 'Sin cama')}</div>
          <div class="name">${esc(p.name || 'Nombre no visible')}</div>
          <div class="meta">${p.age == null ? 'Edad no visible' : `${esc(p.age)} años`} · ${esc(time(p.createdAt))}</div>
        </div>
        <span class="pill ${transportClass(p.transport)}">${p.transport === 'Camilla' ? '🛏️' : p.transport === 'Silla' ? '🦽' : '◌'} ${esc(p.transport)}</span>
      </div>
      <div class="study"><b>Estudio:</b> ${esc(p.study || 'No visible')}</div>
      ${p.transportReason ? `<div class="detail"><b>Por qué:</b> ${esc(p.transportReason)}</div>` : ''}
      ${p.oxygenProbable ? `<div class="oxygen"><b>O₂ probable</b>${p.oxygenReason ? ` · ${esc(p.oxygenReason)}` : ''}</div>` : ''}
      <div class="card-actions">
        <select class="status-select" aria-label="Estado">
          ${['Pendiente','En traslado','Realizado'].map((s) => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="status-btn quick-status">${p.status === 'Realizado' ? '↩ Reabrir' : '✓ Realizado'}</button>
        <button class="edit" aria-label="Editar">✎</button>
        <button class="delete" aria-label="Eliminar">⌫</button>
      </div>
    </article>
  `;
}

function renderFloor() {
  return `
    <section class="actions">
      <button class="primary" id="floorPhoto">📷 Leer pizarrón</button>
      <button class="ghost" id="floorManual">＋ Agregar manual</button>
      <input id="floorFile" type="file" accept="image/*" capture="environment" hidden />
    </section>
    <div class="section-title"><h2>Pacientes a piso</h2><span>${state.floor.length} en el turno</span></div>
    ${state.floor.length ? `<div class="list">${state.floor.map(floorCard).join('')}</div>` : `<div class="empty">Toma una foto del pizarrón o agrega un paciente.</div>`}
  `;
}

function floorCard(p) {
  return `
    <article class="card ${p.status === 'Realizado' ? 'done' : ''}" data-id="${esc(p.id)}">
      <div class="card-head">
        <div>
          <div class="bed">${esc(p.bed || 'Sin cama')}</div>
          <div class="name">${esc(p.name || 'Nombre no proporcionado')}</div>
          <div class="meta">${esc(time(p.createdAt))}</div>
        </div>
        <span class="pill ${transportClass(p.transport)}">${p.transport === 'Camilla' ? '🛏️' : p.transport === 'Silla' ? '🦽' : '◌'} ${esc(p.transport)}</span>
      </div>
      <div class="study"><b>Destino:</b> ${esc(p.destination || 'No visible')}</div>
      ${p.transportReason ? `<div class="detail"><b>Por qué:</b> ${esc(p.transportReason)}</div>` : ''}
      <div class="card-actions">
        <select class="status-select" aria-label="Estado">
          ${['Pendiente','En traslado','Realizado'].map((s) => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="status-btn quick-status">${p.status === 'Realizado' ? '↩ Reabrir' : '✓ Realizado'}</button>
        <button class="edit" aria-label="Editar">✎</button>
        <button class="delete" aria-label="Eliminar">⌫</button>
      </div>
    </article>
  `;
}

function renderModal() {
  if (state.modal === 'rx') return rxForm();
  if (state.modal === 'floor') return floorForm();
  if (state.modal === 'floor-import') return floorImportForm();
  return '';
}

function rxForm() {
  const d = state.rxDraft || emptyRx();
  return `
    <div class="form-wrap" role="dialog" aria-modal="true" aria-label="Paciente de Rayos X">
      <form class="sheet" id="rxForm">
        <div class="sheet-head"><div><h3>${d.id ? 'Editar paciente' : 'Revisar paciente'}</h3><div class="hint">Confirma lo leído antes de guardarlo.</div></div><button type="button" class="close">×</button></div>
        <div class="grid">
          <div class="field"><label>Cama / área</label><input name="bed" value="${esc(d.bed)}" placeholder="C#15, CE1, UA16, UP…" /></div>
          <div class="field"><label>Edad</label><input name="age" inputmode="numeric" type="number" min="0" max="129" value="${d.age == null ? '' : esc(d.age)}" placeholder="—" /></div>
          <div class="field full"><label>Nombre</label><input name="name" value="${esc(d.name)}" placeholder="Nombre completo" /></div>
          <div class="field full"><label>Estudio</label><textarea name="study" placeholder="Tele de tórax, TAC simple de cráneo…">${esc(d.study)}</textarea></div>
          <div class="field"><label>Traslado más probable</label><select name="transport">${['Por definir','Silla','Camilla'].map((v) => `<option ${d.transport === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>Estado</label><select name="status">${['Pendiente','En traslado','Realizado'].map((v) => `<option ${d.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field full"><label>Por qué silla/camilla</label><textarea name="transportReason" placeholder="Razón breve basada en lo visible">${esc(d.transportReason)}</textarea></div>
          <div class="field full"><label class="check"><input type="checkbox" name="oxygenProbable" ${d.oxygenProbable ? 'checked' : ''}/><span><b>O₂ probable</b><br><small style="color:var(--muted)">Marca solo si existe una razón visible.</small></span></label></div>
          <div class="field full oxygen-reason ${d.oxygenProbable ? '' : 'hidden'}"><label>Por qué O₂</label><textarea name="oxygenReason" placeholder="SpO₂ baja, disnea significativa, O₂ ya indicado…">${esc(d.oxygenReason)}</textarea></div>
        </div>
        ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}
        <div class="form-actions"><button type="button" class="ghost close">Cancelar</button><button class="primary" type="submit">Guardar</button></div>
      </form>
    </div>
  `;
}

function floorForm() {
  const d = state.floorDraft || emptyFloor();
  return `
    <div class="form-wrap" role="dialog" aria-modal="true" aria-label="Paciente a piso">
      <form class="sheet" id="floorForm">
        <div class="sheet-head"><div><h3>${d.id ? 'Editar paciente' : 'Agregar a piso'}</h3><div class="hint">CE es Corta Estancia; UP es Urgencias Pediátricas.</div></div><button type="button" class="close">×</button></div>
        <div class="grid">
          <div class="field"><label>Cama / área</label><input name="bed" value="${esc(d.bed)}" placeholder="C#11, CE1, UP…" /></div>
          <div class="field"><label>Destino / servicio</label><input name="destination" value="${esc(d.destination)}" placeholder="Nefro, Geriatría…" /></div>
          <div class="field full"><label>Nombre (si te lo dieron)</label><input name="name" value="${esc(d.name)}" placeholder="Opcional" /></div>
          <div class="field"><label>Traslado</label><select name="transport">${['Por definir','Silla','Camilla'].map((v) => `<option ${d.transport === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>Estado</label><select name="status">${['Pendiente','En traslado','Realizado'].map((v) => `<option ${d.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field full"><label>Por qué silla/camilla (si aplica)</label><textarea name="transportReason" placeholder="Opcional">${esc(d.transportReason)}</textarea></div>
        </div>
        ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}
        <div class="form-actions"><button type="button" class="ghost close">Cancelar</button><button class="primary" type="submit">Guardar</button></div>
      </form>
    </div>
  `;
}

function floorImportForm() {
  return `
    <div class="form-wrap" role="dialog" aria-modal="true" aria-label="Revisar pizarrón">
      <form class="sheet" id="floorImportForm">
        <div class="sheet-head"><div><h3>Revisar pizarrón</h3><div class="hint">Selecciona solo las filas que quieras agregar.</div></div><button type="button" class="close">×</button></div>
        <div class="import-list">
          ${state.floorImport.map((p, i) => `<label class="import-item"><input type="checkbox" name="row" value="${i}" checked/><span><b>${esc(p.bed || 'Sin cama')} · ${esc(p.destination || 'Sin destino')}</b><small>${esc(p.name || 'Nombre no proporcionado')} · ${esc(p.transport || 'Por definir')}</small></span></label>`).join('')}
        </div>
        <div class="form-actions"><button type="button" class="ghost close">Cancelar</button><button class="primary" type="submit">Agregar seleccionados</button></div>
      </form>
    </div>
  `;
}

function emptyRx() {
  return {id:null,bed:'',name:'',age:null,study:'',transport:'Por definir',transportReason:'',oxygenProbable:false,oxygenReason:'',status:'Pendiente',createdAt:new Date().toISOString()};
}

function emptyFloor() {
  return {id:null,bed:'',name:'',destination:'',transport:'Por definir',transportReason:'',status:'Pendiente',createdAt:new Date().toISOString()};
}

function bind() {
  $$('[data-tab]').forEach((button) => button.addEventListener('click', () => { state.tab = button.dataset.tab; state.error = ''; render(); }));
  $('#copyCut')?.addEventListener('click', copyCut);
  $('#newShift')?.addEventListener('click', newShift);
  $('#installBtn')?.addEventListener('click', installPwa);

  $('#rxPhoto')?.addEventListener('click', () => $('#rxFile').click());
  $('#rxFile')?.addEventListener('change', (event) => event.target.files?.[0] && analyzeRx(event.target.files[0]));
  $('#rxManual')?.addEventListener('click', () => { state.rxDraft = emptyRx(); state.modal = 'rx'; state.error = ''; render(); });

  $('#floorPhoto')?.addEventListener('click', () => $('#floorFile').click());
  $('#floorFile')?.addEventListener('change', (event) => event.target.files?.[0] && analyzeFloor(event.target.files[0]));
  $('#floorManual')?.addEventListener('click', () => { state.floorDraft = emptyFloor(); state.modal = 'floor'; state.error = ''; render(); });

  $$('.close').forEach((button) => button.addEventListener('click', closeModal));
  $('#rxForm')?.addEventListener('submit', saveRxFromForm);
  $('#floorForm')?.addEventListener('submit', saveFloorFromForm);
  $('#floorImportForm')?.addEventListener('submit', saveFloorImport);
  $('[name="oxygenProbable"]')?.addEventListener('change', (event) => $('.oxygen-reason')?.classList.toggle('hidden', !event.target.checked));

  $$('.card').forEach((card) => {
    const id = card.dataset.id;
    $('.status-select', card)?.addEventListener('change', (event) => setStatus(id, event.target.value));
    $('.quick-status', card)?.addEventListener('click', () => {
      const collection = state.tab === 'rx' ? state.rx : state.floor;
      const patient = collection.find((p) => p.id === id);
      setStatus(id, patient?.status === 'Realizado' ? 'Pendiente' : 'Realizado');
    });
    $('.edit', card)?.addEventListener('click', () => editPatient(id));
    $('.delete', card)?.addEventListener('click', () => deletePatient(id));
  });
}

function closeModal() {
  state.modal = null;
  state.rxDraft = null;
  state.floorDraft = null;
  state.floorImport = [];
  state.error = '';
  render();
}

function saveRxFromForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const bed = String(form.get('bed') || '').trim();
  const name = String(form.get('name') || '').trim();
  if (!bed && !name) {
    state.error = 'Agrega al menos cama/área o nombre.';
    render();
    return;
  }
  const ageRaw = String(form.get('age') || '').trim();
  const existing = state.rxDraft || emptyRx();
  const patient = {
    ...existing,
    bed,
    name,
    age: ageRaw === '' ? null : Math.max(0, Math.min(129, Number(ageRaw))),
    study: String(form.get('study') || '').trim(),
    transport: normalizeTransport(form.get('transport')),
    transportReason: String(form.get('transportReason') || '').trim(),
    oxygenProbable: form.get('oxygenProbable') === 'on',
    oxygenReason: form.get('oxygenProbable') === 'on' ? String(form.get('oxygenReason') || '').trim() : '',
    status: String(form.get('status') || 'Pendiente')
  };
  if (patient.id) {
    state.rx = state.rx.map((p) => p.id === patient.id ? patient : p);
  } else {
    patient.id = uid();
    patient.createdAt = new Date().toISOString();
    state.rx.unshift(patient);
  }
  persist();
  closeModal();
  toast('Paciente guardado en Rayos X.');
}

function saveFloorFromForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const bed = String(form.get('bed') || '').trim();
  const destination = String(form.get('destination') || '').trim();
  if (!bed || !destination) {
    state.error = 'Cama/área y destino son necesarios.';
    render();
    return;
  }
  const existing = state.floorDraft || emptyFloor();
  const patient = {
    ...existing,
    bed,
    destination,
    name: String(form.get('name') || '').trim(),
    transport: normalizeTransport(form.get('transport')),
    transportReason: String(form.get('transportReason') || '').trim(),
    status: String(form.get('status') || 'Pendiente')
  };
  if (patient.id) {
    state.floor = state.floor.map((p) => p.id === patient.id ? patient : p);
  } else {
    patient.id = uid();
    patient.createdAt = new Date().toISOString();
    state.floor.unshift(patient);
  }
  persist();
  closeModal();
  toast('Paciente agregado a piso.');
}

function saveFloorImport(event) {
  event.preventDefault();
  const selected = new Set(new FormData(event.currentTarget).getAll('row').map(Number));
  const additions = state.floorImport.filter((_, i) => selected.has(i)).map((p) => ({...p,id:uid(),status:'Pendiente',createdAt:new Date().toISOString()}));
  state.floor = [...additions, ...state.floor];
  persist();
  closeModal();
  toast(`${additions.length} paciente${additions.length === 1 ? '' : 's'} agregado${additions.length === 1 ? '' : 's'}.`);
}

function editPatient(id) {
  if (state.tab === 'rx') {
    state.rxDraft = {...state.rx.find((p) => p.id === id)};
    state.modal = 'rx';
  } else {
    state.floorDraft = {...state.floor.find((p) => p.id === id)};
    state.modal = 'floor';
  }
  state.error = '';
  render();
}

function deletePatient(id) {
  if (!confirm('¿Eliminar este paciente del turno?')) return;
  if (state.tab === 'rx') state.rx = state.rx.filter((p) => p.id !== id);
  else state.floor = state.floor.filter((p) => p.id !== id);
  persist();
  render();
  toast('Paciente eliminado.');
}

function setStatus(id, status) {
  const valid = ['Pendiente','En traslado','Realizado'];
  if (!valid.includes(status)) return;
  if (state.tab === 'rx') state.rx = state.rx.map((p) => p.id === id ? {...p,status} : p);
  else state.floor = state.floor.map((p) => p.id === id ? {...p,status} : p);
  persist();
  render();
}

async function analyzeRx(file) {
  state.loading = true;
  state.error = '';
  render();
  try {
    const prompt = `Analiza esta solicitud hospitalaria para apoyar el traslado de un paciente a Rayos X/Imagenología. Devuelve SOLO JSON válido, sin markdown. Extrae únicamente datos visibles; no inventes nada.\n\nFormato exacto:\n{\n  "bed":"cama o área tal como aparece; conserva CE como Corta Estancia y UP como Urgencias Pediátricas",\n  "name":"nombre completo visible o cadena vacía",\n  "birthDate":"YYYY-MM-DD o null",\n  "age":null,\n  "study":"estudio o estudios solicitados",\n  "transport":"Silla|Camilla|Por definir",\n  "transportReason":"razón breve basada solo en datos visibles",\n  "oxygenProbable":false,\n  "oxygenReason":""\n}\n\nReglas: Silla/Camilla es una estimación operativa, no una orden. Usa Camilla cuando los datos visibles sugieren trauma importante, TCE, déficit neurológico, alteración de movilidad, estado general delicado o necesidad de ir acostado. Usa Silla cuando parece estable y el problema visible no exige inmovilización. Usa Por definir si no hay base suficiente. oxygenProbable=true SOLO con evidencia visible que lo haga razonablemente probable: oxígeno ya indicado/documentado, hipoxemia/SpO2 baja, dificultad respiratoria significativa, soporte respiratorio o equivalente. No lo marques solo por edad, dolor torácico, trauma o radiografía de tórax.`;
    const result = await vision(file, prompt);
    const data = parseVision(result);
    const rawAge = data.age === null || data.age === undefined || data.age === '' ? null : Number(data.age);
    const age = Number.isFinite(rawAge) && rawAge >= 0 && rawAge < 130 ? rawAge : ageFromBirthDate(data.birthDate);
    state.rxDraft = {
      ...emptyRx(),
      bed: String(data.bed || '').trim(),
      name: String(data.name || '').trim(),
      age,
      study: String(data.study || '').trim(),
      transport: normalizeTransport(data.transport),
      transportReason: String(data.transportReason || '').trim(),
      oxygenProbable: Boolean(data.oxygenProbable),
      oxygenReason: Boolean(data.oxygenProbable) ? String(data.oxygenReason || '').trim() : ''
    };
    state.modal = 'rx';
    toast('Solicitud leída. Revisa antes de guardar.');
  } catch (error) {
    handleVisionError(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function analyzeFloor(file) {
  state.loading = true;
  state.error = '';
  render();
  try {
    const prompt = `Analiza este pizarrón/lista hospitalaria de pacientes que van a piso. Devuelve SOLO JSON válido sin markdown con este formato: {"patients":[{"bed":"","name":"","destination":"","transport":"Por definir","transportReason":""}]}. Extrae únicamente lo visible; no inventes nombres ni destinos. CE significa Corta Estancia y no debe convertirse en una cama numérica. UP significa Urgencias Pediátricas. Si no hay información clínica suficiente para estimar silla/camilla usa Por definir. No dupliques una misma fila visible.`;
    const result = await vision(file, prompt);
    const data = parseVision(result);
    const rows = Array.isArray(data.patients) ? data.patients : [];
    state.floorImport = rows.map((p) => ({
      bed: String(p.bed || '').trim(),
      name: String(p.name || '').trim(),
      destination: String(p.destination || '').trim(),
      transport: normalizeTransport(p.transport),
      transportReason: String(p.transportReason || '').trim()
    })).filter((p) => p.bed || p.name || p.destination);
    if (!state.floorImport.length) throw new Error('No encontré filas legibles en el pizarrón.');
    state.modal = 'floor-import';
    toast('Pizarrón leído. Revisa las filas.');
  } catch (error) {
    handleVisionError(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function vision(file, prompt) {
  const form = new FormData();
  form.append('image', file);
  form.append('prompt', prompt);
  const response = await fetch('/api/vision', {method:'POST', body:form, credentials:'same-origin'});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function parseVision(result) {
  let raw = typeof result === 'string' ? result : [result?.text,result?.output_text,result?.content,result?.message?.content,result?.response,result?.result?.text].find((v) => typeof v === 'string');
  if (!raw && result && typeof result === 'object') return result;
  raw = String(raw || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || raw;
  try { return JSON.parse(source); } catch {}
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
  throw new Error('La IA no devolvió datos estructurados.');
}

function handleVisionError(error) {
  if (error?.status === 401 || error?.status === 403) {
    state.authKnown = true;
    state.authenticated = false;
    toast('Inicia sesión para usar el análisis de fotos.');
    return;
  }
  toast(error?.message || 'No pude analizar la imagen.');
}

async function copyCut() {
  const rx = state.rx.map((p) => `${p.bed || 'Sin cama'} · ${p.name || 'Sin nombre'} · ${p.age == null ? 'edad ?' : `${p.age} años`} · ${p.study || 'estudio ?'} · ${p.transport}${p.oxygenProbable ? ` · O2 probable: ${p.oxygenReason || 'sí'}` : ''} · ${p.status}`);
  const floor = state.floor.map((p) => `${p.bed || 'Sin cama'} · ${p.name || 'Sin nombre'} · ${p.destination || 'destino ?'} · ${p.transport} · ${p.status}`);
  const text = `CORTE DEL TURNO\n${today()}\n\nRAYOS X (${state.rx.length})\n${rx.join('\n') || 'Sin pacientes'}\n\nA PISO (${state.floor.length})\n${floor.join('\n') || 'Sin pacientes'}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('Corte copiado.');
  } catch {
    prompt('Copia el corte:', text);
  }
}

function newShift() {
  if ((state.rx.length || state.floor.length) && !confirm('Esto borrará las listas de este dispositivo. ¿Iniciar turno nuevo?')) return;
  state.rx = [];
  state.floor = [];
  state.startedAt = new Date().toISOString();
  persist();
  render();
  toast('Turno nuevo iniciado.');
}

async function installPwa() {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice.catch(() => null);
  state.installPrompt = null;
  render();
}

async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me', {credentials:'same-origin'});
    state.authKnown = true;
    state.authenticated = response.ok;
  } catch {
    state.authKnown = true;
    state.authenticated = false;
  }
  render();
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installPrompt = event;
  render();
});

window.addEventListener('appinstalled', () => {
  state.installPrompt = null;
  render();
  toast('Turno RX instalada.');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/turno-rx/sw.js', {scope:'/turno-rx/'}).catch(() => {}));
}

render();
checkAuth();
