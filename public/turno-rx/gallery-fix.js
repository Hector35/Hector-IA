const RX_KEY = 'turno-rx-patients-v1';
const FLOOR_KEY = 'turno-rx-floor-v1';
let multiBusy = false;

const patchPhotoInputs = () => {
  const rxFile = document.getElementById('rxFile');
  const floorFile = document.getElementById('floorFile');

  for (const input of [rxFile, floorFile]) {
    if (!input) continue;
    if (input.hasAttribute('capture')) input.removeAttribute('capture');
    input.setAttribute('multiple', '');
    input.multiple = true;
    input.accept = 'image/*';
  }

  const rxButton = document.getElementById('rxPhoto');
  const floorButton = document.getElementById('floorPhoto');
  if (rxButton && rxButton.textContent !== '📷 Seleccionar fotos') rxButton.textContent = '📷 Seleccionar fotos';
  if (floorButton && floorButton.textContent !== '📷 Seleccionar fotos') floorButton.textContent = '📷 Seleccionar fotos';
};

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTransport(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('camilla')) return 'Camilla';
  if (text.includes('silla')) return 'Silla';
  return 'Por definir';
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

function parseVision(result) {
  let raw = typeof result === 'string'
    ? result
    : [result?.text, result?.output_text, result?.content, result?.message?.content, result?.response, result?.result?.text]
      .find((value) => typeof value === 'string');
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
  return parseVision(data);
}

function showProgress(current, total, label) {
  let overlay = document.getElementById('multi-photo-progress');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'multi-photo-progress';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(3,8,13,.92);display:grid;place-items:center;padding:24px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-align:center';
    overlay.innerHTML = '<div style="max-width:320px"><div style="font-size:42px;margin-bottom:12px">🩻</div><b id="multi-photo-title" style="font-size:20px"></b><div id="multi-photo-sub" style="margin-top:10px;color:#aab7c4;line-height:1.45"></div></div>';
    document.body.appendChild(overlay);
  }
  overlay.querySelector('#multi-photo-title').textContent = label;
  overlay.querySelector('#multi-photo-sub').textContent = `Procesando ${current} de ${total}. No cierres la app.`;
}

function closeProgress() {
  document.getElementById('multi-photo-progress')?.remove();
}

function cleanText(value) {
  return String(value || '').trim();
}

function mergeStudy(a, b) {
  const values = [a, b].flatMap((value) => cleanText(value).split(/\s*\+\s*/)).map(cleanText).filter(Boolean);
  return [...new Set(values.map((value) => value.toLowerCase()))].map((lower) => values.find((value) => value.toLowerCase() === lower)).join(' + ');
}

function patientKey(patient) {
  const name = cleanText(patient.name).toLowerCase();
  const bed = cleanText(patient.bed).toLowerCase();
  return name ? `${bed}|${name}` : '';
}

function mergeRxPatient(target, incoming) {
  const priority = {'Por definir':0, 'Silla':1, 'Camilla':2};
  const transport = priority[incoming.transport] > priority[target.transport] ? incoming.transport : target.transport;
  const reasons = [target.transportReason, incoming.transportReason].map(cleanText).filter(Boolean);
  return {
    ...target,
    bed: target.bed || incoming.bed,
    name: target.name || incoming.name,
    age: target.age ?? incoming.age ?? null,
    study: mergeStudy(target.study, incoming.study),
    transport,
    transportReason: [...new Set(reasons)].join(' · '),
    oxygenProbable: Boolean(target.oxygenProbable || incoming.oxygenProbable),
    oxygenReason: [...new Set([target.oxygenReason, incoming.oxygenReason].map(cleanText).filter(Boolean))].join(' · ')
  };
}

async function analyzeRxFile(file) {
  const prompt = `Analiza esta solicitud hospitalaria para apoyar el traslado de un paciente a Rayos X/Imagenología. Devuelve SOLO JSON válido, sin markdown. Extrae únicamente datos visibles; no inventes nada.\nFormato: {"bed":"","name":"","birthDate":"YYYY-MM-DD o null","age":null,"study":"","transport":"Silla|Camilla|Por definir","transportReason":"","oxygenProbable":false,"oxygenReason":""}.\nConserva CE como Corta Estancia y UP como Urgencias Pediátricas. Silla/Camilla es estimación operativa, no orden. Camilla si hay trauma importante, TCE, déficit neurológico, alteración de movilidad, estado general delicado o necesidad de ir acostado. Silla si parece estable y no requiere inmovilización. Por definir si no hay base suficiente. oxygenProbable=true SOLO con evidencia visible como oxígeno ya indicado/documentado, hipoxemia/SpO2 baja, dificultad respiratoria significativa o soporte respiratorio. No lo marques solo por edad, dolor torácico, trauma o radiografía de tórax.`;
  const data = await vision(file, prompt);
  const rawAge = data.age === null || data.age === undefined || data.age === '' ? null : Number(data.age);
  const age = Number.isFinite(rawAge) && rawAge >= 0 && rawAge < 130 ? rawAge : ageFromBirthDate(data.birthDate);
  return {
    id: uid(),
    bed: cleanText(data.bed),
    name: cleanText(data.name),
    age,
    study: cleanText(data.study),
    transport: normalizeTransport(data.transport),
    transportReason: cleanText(data.transportReason),
    oxygenProbable: Boolean(data.oxygenProbable),
    oxygenReason: Boolean(data.oxygenProbable) ? cleanText(data.oxygenReason) : '',
    status: 'Pendiente',
    createdAt: new Date().toISOString()
  };
}

async function analyzeFloorFile(file) {
  const prompt = `Analiza este pizarrón/lista hospitalaria de pacientes que van a piso. Devuelve SOLO JSON válido sin markdown con este formato: {"patients":[{"bed":"","name":"","destination":"","transport":"Por definir","transportReason":""}]}. Extrae únicamente lo visible; no inventes nombres ni destinos. CE significa Corta Estancia y no debe convertirse en una cama numérica. UP significa Urgencias Pediátricas. Si no hay información clínica suficiente para estimar silla/camilla usa Por definir. No dupliques una misma fila visible.`;
  const data = await vision(file, prompt);
  const rows = Array.isArray(data.patients) ? data.patients : [];
  return rows.map((patient) => ({
    id: uid(),
    bed: cleanText(patient.bed),
    name: cleanText(patient.name),
    destination: cleanText(patient.destination),
    transport: normalizeTransport(patient.transport),
    transportReason: cleanText(patient.transportReason),
    status: 'Pendiente',
    createdAt: new Date().toISOString()
  })).filter((patient) => patient.bed || patient.name || patient.destination);
}

async function importMany(kind, files) {
  if (multiBusy || !files.length) return;
  multiBusy = true;
  const errors = [];
  try {
    if (kind === 'rx') {
      const imported = [];
      for (let index = 0; index < files.length; index += 1) {
        showProgress(index + 1, files.length, 'Leyendo solicitudes de Rayos X');
        try {
          const patient = await analyzeRxFile(files[index]);
          const key = patientKey(patient);
          const existingIndex = key ? imported.findIndex((item) => patientKey(item) === key) : -1;
          if (existingIndex >= 0) imported[existingIndex] = mergeRxPatient(imported[existingIndex], patient);
          else imported.push(patient);
        } catch (error) {
          errors.push({file: files[index].name, error});
        }
      }

      const current = readList(RX_KEY);
      const merged = [...current];
      for (const patient of imported) {
        const key = patientKey(patient);
        const existingIndex = key ? merged.findIndex((item) => patientKey(item) === key) : -1;
        if (existingIndex >= 0) merged[existingIndex] = mergeRxPatient(merged[existingIndex], patient);
        else merged.unshift(patient);
      }
      writeList(RX_KEY, merged);
    } else {
      const imported = [];
      for (let index = 0; index < files.length; index += 1) {
        showProgress(index + 1, files.length, 'Leyendo pizarrones');
        try {
          imported.push(...await analyzeFloorFile(files[index]));
        } catch (error) {
          errors.push({file: files[index].name, error});
        }
      }
      const current = readList(FLOOR_KEY);
      const seen = new Set(current.map((patient) => `${cleanText(patient.bed).toLowerCase()}|${cleanText(patient.name).toLowerCase()}|${cleanText(patient.destination).toLowerCase()}`));
      const unique = imported.filter((patient) => {
        const key = `${cleanText(patient.bed).toLowerCase()}|${cleanText(patient.name).toLowerCase()}|${cleanText(patient.destination).toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      writeList(FLOOR_KEY, [...unique, ...current]);
    }

    closeProgress();
    const ok = files.length - errors.length;
    if (errors.some(({error}) => error?.status === 401 || error?.status === 403)) {
      alert('Necesitas iniciar sesión en el sistema principal para analizar fotos con IA.');
    } else if (errors.length) {
      alert(`Se procesaron ${ok} de ${files.length} fotos. ${errors.length} no pudieron leerse.`);
    }
    window.location.reload();
  } finally {
    multiBusy = false;
    closeProgress();
  }
}

document.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.id !== 'rxFile' && input.id !== 'floorFile') return;
  const files = [...(input.files || [])];
  if (files.length <= 1) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const kind = input.id === 'rxFile' ? 'rx' : 'floor';
  input.value = '';
  void importMany(kind, files);
}, true);

patchPhotoInputs();
new MutationObserver(patchPhotoInputs).observe(document.documentElement, {childList: true, subtree: true});
