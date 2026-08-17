import React, {FormEvent, useMemo, useRef, useState} from 'react';
import {api} from './api';

type Tab = 'rayos' | 'piso';
type Transport = 'Silla' | 'Camilla' | 'Por definir';
type Status = 'Pendiente' | 'En traslado' | 'Realizado';

type XRayPatient = {
  id: string;
  bed: string;
  name: string;
  age: number | null;
  study: string;
  transport: Transport;
  transportReason: string;
  oxygenProbable: boolean;
  oxygenReason: string;
  status: Status;
  createdAt: string;
  source?: string;
};

type FloorPatient = {
  id: string;
  bed: string;
  name: string;
  destination: string;
  transport: Transport;
  status: Status;
  createdAt: string;
};

type XRayDraft = Omit<XRayPatient, 'id' | 'createdAt' | 'status'>;
type FloorDraft = Omit<FloorPatient, 'id' | 'createdAt' | 'status'>;

const XRAY_KEY = 'turno-imss-rayos-v1';
const FLOOR_KEY = 'turno-imss-piso-v1';
const SHIFT_KEY = 'turno-imss-meta-v1';

const emptyXRay: XRayDraft = {
  bed: '',
  name: '',
  age: null,
  study: '',
  transport: 'Por definir',
  transportReason: '',
  oxygenProbable: false,
  oxygenReason: '',
  source: '',
};

const emptyFloor: FloorDraft = {
  bed: '',
  name: '',
  destination: '',
  transport: 'Por definir',
};

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function ageFromBirthDate(value: string | null | undefined) {
  if (!value) return null;
  const dob = new Date(`${value}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const month = today.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function ageFromVision(data: any): number | null {
  const rawAge = data?.age;
  if (rawAge !== null && rawAge !== undefined && rawAge !== '') {
    const numeric = Number(rawAge);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric < 130) return numeric;
  }
  return ageFromBirthDate(data?.birthDate);
}

function normalizeTransport(value: unknown): Transport {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('camilla')) return 'Camilla';
  if (text.includes('silla')) return 'Silla';
  return 'Por definir';
}

function extractVisionText(result: any): string {
  if (typeof result === 'string') return result;
  const candidates = [
    result?.text,
    result?.output_text,
    result?.content,
    result?.message?.content,
    result?.response,
    result?.result?.text,
  ];
  const found = candidates.find((item) => typeof item === 'string');
  return found ?? JSON.stringify(result ?? {});
}

function parseVisionJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || raw.trim();
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
    throw new Error('La respuesta no llegó en formato estructurado.');
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {hour: '2-digit', minute: '2-digit'}).format(new Date(value));
}

function todayLabel() {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function statusClass(status: Status) {
  if (status === 'Realizado') return 'status status-done';
  if (status === 'En traslado') return 'status status-moving';
  return 'status status-pending';
}

export function PatientShiftApp() {
  const [tab, setTab] = useState<Tab>('rayos');
  const [xrayPatients, setXrayPatients] = useState<XRayPatient[]>(() => safeRead(XRAY_KEY, []));
  const [floorPatients, setFloorPatients] = useState<FloorPatient[]>(() => safeRead(FLOOR_KEY, []));
  const [shiftStartedAt, setShiftStartedAt] = useState<string>(() => {
    const meta = safeRead<{startedAt?: string}>(SHIFT_KEY, {});
    return meta.startedAt || new Date().toISOString();
  });
  const [xrayDraft, setXrayDraft] = useState<XRayDraft>(emptyXRay);
  const [floorDraft, setFloorDraft] = useState<FloorDraft>(emptyFloor);
  const [showXRayForm, setShowXRayForm] = useState(false);
  const [showFloorForm, setShowFloorForm] = useState(false);
  const [editingXRay, setEditingXRay] = useState<string | null>(null);
  const [editingFloor, setEditingFloor] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [toast, setToast] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function persistXRay(next: XRayPatient[]) {
    setXrayPatients(next);
    localStorage.setItem(XRAY_KEY, JSON.stringify(next));
  }

  function persistFloor(next: FloorPatient[]) {
    setFloorPatients(next);
    localStorage.setItem(FLOOR_KEY, JSON.stringify(next));
  }

  const xraySummary = useMemo(() => {
    let pending = 0;
    let moving = 0;
    let done = 0;
    let oxygen = 0;
    for (const patient of xrayPatients) {
      if (patient.status === 'Pendiente') pending += 1;
      else if (patient.status === 'En traslado') moving += 1;
      else done += 1;
      if (patient.oxygenProbable && patient.status !== 'Realizado') oxygen += 1;
    }
    return {total: xrayPatients.length, pending, moving, done, oxygen};
  }, [xrayPatients]);

  const floorSummary = useMemo(() => {
    let pending = 0;
    let moving = 0;
    let done = 0;
    for (const patient of floorPatients) {
      if (patient.status === 'Pendiente') pending += 1;
      else if (patient.status === 'En traslado') moving += 1;
      else done += 1;
    }
    return {total: floorPatients.length, pending, moving, done};
  }, [floorPatients]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }

  async function analyzeRequisition(file: File) {
    setAnalyzing(true);
    setUploadError('');
    try {
      const prompt = `Analiza esta solicitud hospitalaria de Rayos X o imagenología como apoyo operativo para un camillero. Devuelve SOLO JSON válido, sin markdown ni comentarios.

Extrae únicamente datos visibles en la imagen. No inventes nombres, diagnósticos, camas, estudios ni valores clínicos. Si algo no se ve, usa cadena vacía o null.

Formato exacto:
{
  "bed": "cama o área tal como aparece, por ejemplo C#15, CE1, UA16, UP; no confundas CE con cama",
  "name": "nombre completo visible",
  "birthDate": "YYYY-MM-DD o null",
  "age": null,
  "study": "estudio o estudios solicitados",
  "transport": "Silla|Camilla|Por definir",
  "transportReason": "razón breve basada SOLO en datos visibles de la solicitud",
  "oxygenProbable": false,
  "oxygenReason": ""
}

Reglas para la estimación operativa:
- transport no es una orden médica. Estima Silla cuando el paciente parece estable y el problema visible no exige inmovilización; Camilla cuando hay trauma importante, TCE, sospecha neurológica con posible déficit, alteración importante de movilidad, estado general delicado o necesidad clara de traslado acostado; Por definir si la imagen no da base suficiente.
- oxygenProbable=true SOLO si hay evidencia visible que haga razonablemente probable que necesite oxígeno durante el traslado: oxígeno ya indicado/documentado, hipoxemia o SpO2 baja, dificultad respiratoria/disnea significativa, soporte respiratorio o dato equivalente. No lo marques solo por edad, dolor torácico, trauma o por tratarse de una radiografía de tórax.
- Si oxygenProbable=false, oxygenReason debe ser cadena vacía.
- Si hay fecha de nacimiento pero no edad, calcula la edad a la fecha actual. Si no puede calcularse, age=null.`;
      const result = await api.vision(file, prompt);
      const data = parseVisionJson(extractVisionText(result));
      setXrayDraft({
        bed: String(data.bed ?? '').trim(),
        name: String(data.name ?? '').trim(),
        age: ageFromVision(data),
        study: String(data.study ?? '').trim(),
        transport: normalizeTransport(data.transport),
        transportReason: String(data.transportReason ?? '').trim(),
        oxygenProbable: Boolean(data.oxygenProbable),
        oxygenReason: Boolean(data.oxygenProbable) ? String(data.oxygenReason ?? '').trim() : '',
        source: file.name,
      });
      setEditingXRay(null);
      setShowXRayForm(true);
      flash('Solicitud leída. Revisa antes de guardar.');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'No pude leer la solicitud.');
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function saveXRay(event: FormEvent) {
    event.preventDefault();
    if (!xrayDraft.bed.trim() && !xrayDraft.name.trim()) {
      setUploadError('Agrega al menos cama/área o nombre para guardar.');
      return;
    }
    const clean: XRayDraft = {
      ...xrayDraft,
      bed: xrayDraft.bed.trim(),
      name: xrayDraft.name.trim(),
      study: xrayDraft.study.trim(),
      transportReason: xrayDraft.transportReason.trim(),
      oxygenReason: xrayDraft.oxygenProbable ? xrayDraft.oxygenReason.trim() : '',
    };
    if (editingXRay) {
      persistXRay(xrayPatients.map((patient) => patient.id === editingXRay ? {...patient, ...clean} : patient));
      flash('Paciente actualizado.');
    } else {
      persistXRay([{...clean, id: uid(), status: 'Pendiente', createdAt: new Date().toISOString()}, ...xrayPatients]);
      flash('Paciente agregado a Rayos X.');
    }
    setXrayDraft(emptyXRay);
    setEditingXRay(null);
    setShowXRayForm(false);
    setUploadError('');
  }

  function editXRay(patient: XRayPatient) {
    const {id, createdAt, status, ...draft} = patient;
    void id;
    void createdAt;
    void status;
    setXrayDraft(draft);
    setEditingXRay(patient.id);
    setShowXRayForm(true);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function setXRayStatus(id: string, status: Status) {
    persistXRay(xrayPatients.map((patient) => patient.id === id ? {...patient, status} : patient));
  }

  function removeXRay(id: string) {
    if (!window.confirm('¿Eliminar este paciente de la lista de Rayos X?')) return;
    persistXRay(xrayPatients.filter((patient) => patient.id !== id));
  }

  function saveFloor(event: FormEvent) {
    event.preventDefault();
    if (!floorDraft.bed.trim() || !floorDraft.destination.trim()) return;
    const clean: FloorDraft = {
      ...floorDraft,
      bed: floorDraft.bed.trim(),
      name: floorDraft.name.trim(),
      destination: floorDraft.destination.trim(),
    };
    if (editingFloor) {
      persistFloor(floorPatients.map((patient) => patient.id === editingFloor ? {...patient, ...clean} : patient));
      flash('Paciente a piso actualizado.');
    } else {
      persistFloor([{...clean, id: uid(), status: 'Pendiente', createdAt: new Date().toISOString()}, ...floorPatients]);
      flash('Paciente agregado a piso.');
    }
    setFloorDraft(emptyFloor);
    setEditingFloor(null);
    setShowFloorForm(false);
  }

  function editFloor(patient: FloorPatient) {
    const {id, createdAt, status, ...draft} = patient;
    void id;
    void createdAt;
    void status;
    setFloorDraft(draft);
    setEditingFloor(patient.id);
    setShowFloorForm(true);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function setFloorStatus(id: string, status: Status) {
    persistFloor(floorPatients.map((patient) => patient.id === id ? {...patient, status} : patient));
  }

  function removeFloor(id: string) {
    if (!window.confirm('¿Eliminar este paciente de la lista a piso?')) return;
    persistFloor(floorPatients.filter((patient) => patient.id !== id));
  }

  function newShift() {
    if ((xrayPatients.length || floorPatients.length) && !window.confirm('Esto limpiará las listas del turno actual en este dispositivo. ¿Iniciar un turno nuevo?')) return;
    const now = new Date().toISOString();
    persistXRay([]);
    persistFloor([]);
    setShiftStartedAt(now);
    localStorage.setItem(SHIFT_KEY, JSON.stringify({startedAt: now}));
    flash('Turno nuevo iniciado.');
  }

  async function copyCurrentCut() {
    const xrayLines = xrayPatients.map((patient) => {
      const oxygen = patient.oxygenProbable ? ` · O2 probable: ${patient.oxygenReason || 'sí'}` : '';
      return `${patient.bed || 'Sin cama'} · ${patient.name || 'Sin nombre'} · ${patient.age ?? 'edad ?'} · ${patient.study || 'estudio ?'} · ${patient.transport}${oxygen} · ${patient.status}`;
    });
    const floorLines = floorPatients.map((patient) => `${patient.bed} · ${patient.name || 'Sin nombre'} · ${patient.destination} · ${patient.transport} · ${patient.status}`);
    const text = `CORTE DEL TURNO\n${todayLabel()}\n\nRAYOS X (${xrayPatients.length})\n${xrayLines.join('\n') || 'Sin pacientes'}\n\nA PISO (${floorPatients.length})\n${floorLines.join('\n') || 'Sin pacientes'}`;
    try {
      await navigator.clipboard.writeText(text);
      flash('Corte copiado.');
    } catch {
      flash('No se pudo copiar automáticamente.');
    }
  }

  return (
    <div className="shift-app">
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      <header className="topbar">
        <div>
          <div className="eyebrow">Control operativo · turno actual</div>
          <h1>Pacientes</h1>
          <p className="date-line">{todayLabel()} · iniciado {formatTime(shiftStartedAt)}</p>
        </div>
        <div className="top-actions">
          <button className="button ghost" onClick={copyCurrentCut}>Copiar corte</button>
          <button className="button ghost danger-text" onClick={newShift}>Nuevo turno</button>
        </div>
      </header>

      <div className="privacy-note">
        <strong>Uso operativo:</strong> verifica los datos antes de mover al paciente. Silla/camilla y oxígeno son estimaciones de apoyo, no indicaciones médicas. Los registros del turno se guardan localmente en este dispositivo; la foto se envía al servicio de visión configurado en la PWA para analizarla.
      </div>

      <nav className="tabs" aria-label="Secciones del turno">
        <button className={tab === 'rayos' ? 'tab active' : 'tab'} onClick={() => setTab('rayos')}>
          <span>Rayos X</span><b>{xraySummary.total}</b>
        </button>
        <button className={tab === 'piso' ? 'tab active' : 'tab'} onClick={() => setTab('piso')}>
          <span>Pacientes a piso</span><b>{floorSummary.total}</b>
        </button>
      </nav>

      {tab === 'rayos' ? (
        <main>
          <section className="summary-grid" aria-label="Resumen de Rayos X">
            <div className="summary-card"><span>Pendientes</span><strong>{xraySummary.pending}</strong></div>
            <div className="summary-card"><span>En traslado</span><strong>{xraySummary.moving}</strong></div>
            <div className="summary-card"><span>Realizados</span><strong>{xraySummary.done}</strong></div>
            {xraySummary.oxygen > 0 ? <div className="summary-card oxygen"><span>O₂ probable</span><strong>{xraySummary.oxygen}</strong></div> : null}
          </section>

          <section className="capture-panel">
            <div>
              <div className="eyebrow">Entrada rápida</div>
              <h2>Leer solicitud de Rayos X</h2>
              <p>Toma una foto o elige una imagen. La información queda en revisión antes de guardarse.</p>
            </div>
            <div className="capture-actions">
              <input
                ref={fileInputRef}
                id="xray-photo"
                className="visually-hidden"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void analyzeRequisition(file);
                }}
              />
              <label className={`button primary ${analyzing ? 'disabled' : ''}`} htmlFor="xray-photo">
                {analyzing ? 'Analizando…' : 'Tomar / subir foto'}
              </label>
              <button className="button secondary" onClick={() => {
                setXrayDraft(emptyXRay);
                setEditingXRay(null);
                setShowXRayForm(true);
              }}>Agregar manual</button>
            </div>
          </section>

          {uploadError ? <div className="error-banner">{uploadError}</div> : null}

          {showXRayForm ? (
            <form className="editor" onSubmit={saveXRay}>
              <div className="editor-head">
                <div>
                  <div className="eyebrow">{editingXRay ? 'Corrección' : 'Revisión antes de guardar'}</div>
                  <h2>{editingXRay ? 'Editar paciente' : 'Confirma la solicitud'}</h2>
                </div>
                <button type="button" className="icon-button" aria-label="Cerrar" onClick={() => {
                  setShowXRayForm(false);
                  setEditingXRay(null);
                  setXrayDraft(emptyXRay);
                }}>×</button>
              </div>
              <div className="form-grid">
                <label>Cama / área<input value={xrayDraft.bed} onChange={(event) => setXrayDraft({...xrayDraft, bed: event.target.value})} placeholder="C#15, CE1, UA16…" /></label>
                <label>Nombre<input value={xrayDraft.name} onChange={(event) => setXrayDraft({...xrayDraft, name: event.target.value})} placeholder="Nombre del paciente" /></label>
                <label>Edad<input type="number" min="0" max="129" value={xrayDraft.age ?? ''} onChange={(event) => setXrayDraft({...xrayDraft, age: event.target.value === '' ? null : Number(event.target.value)})} placeholder="Edad" /></label>
                <label className="span-2">Estudio<textarea value={xrayDraft.study} onChange={(event) => setXrayDraft({...xrayDraft, study: event.target.value})} placeholder="Estudio solicitado" rows={2} /></label>
                <label>Traslado probable<select value={xrayDraft.transport} onChange={(event) => setXrayDraft({...xrayDraft, transport: event.target.value as Transport})}><option>Silla</option><option>Camilla</option><option>Por definir</option></select></label>
                <label className="span-2">Por qué<textarea value={xrayDraft.transportReason} onChange={(event) => setXrayDraft({...xrayDraft, transportReason: event.target.value})} placeholder="Razón basada en los datos visibles" rows={2} /></label>
                <label className="check-row"><input type="checkbox" checked={xrayDraft.oxygenProbable} onChange={(event) => setXrayDraft({...xrayDraft, oxygenProbable: event.target.checked, oxygenReason: event.target.checked ? xrayDraft.oxygenReason : ''})} />Oxígeno probablemente necesario</label>
                {xrayDraft.oxygenProbable ? <label className="span-2">Por qué O₂<textarea value={xrayDraft.oxygenReason} onChange={(event) => setXrayDraft({...xrayDraft, oxygenReason: event.target.value})} placeholder="Dato visible que lo hace probable" rows={2} /></label> : null}
              </div>
              <div className="editor-actions">
                <button type="button" className="button ghost" onClick={() => {
                  setShowXRayForm(false);
                  setEditingXRay(null);
                  setXrayDraft(emptyXRay);
                }}>Cancelar</button>
                <button className="button primary" type="submit">{editingXRay ? 'Guardar cambios' : 'Agregar a Rayos X'}</button>
              </div>
            </form>
          ) : null}

          <section className="list-section">
            <div className="section-head">
              <div><div className="eyebrow">Seguimiento</div><h2>Rayos X</h2></div>
              <span className="muted">{xrayPatients.length} en el turno</span>
            </div>
            {xrayPatients.length === 0 ? (
              <div className="empty-state"><strong>Sin pacientes todavía</strong><span>Sube la primera solicitud y aparecerá aquí.</span></div>
            ) : (
              <div className="table-wrap">
                <table className="patient-table">
                  <thead><tr><th>Cama</th><th>Paciente</th><th>Estudio</th><th>Traslado probable</th><th>O₂</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {xrayPatients.map((patient) => (
                      <tr key={patient.id} className={patient.status === 'Realizado' ? 'row-done' : ''}>
                        <td data-label="Cama"><strong className="bed-chip">{patient.bed || '—'}</strong></td>
                        <td data-label="Paciente"><div className="patient-name">{patient.name || 'Sin nombre'}</div><div className="subtle">{patient.age !== null ? `${patient.age} años` : 'Edad no disponible'} · {formatTime(patient.createdAt)}</div></td>
                        <td data-label="Estudio"><div className="study-text">{patient.study || 'Sin estudio capturado'}</div></td>
                        <td data-label="Traslado"><strong>{patient.transport}</strong>{patient.transportReason ? <div className="reason">{patient.transportReason}</div> : null}</td>
                        <td data-label="Oxígeno">{patient.oxygenProbable ? <div className="oxygen-flag"><strong>O₂ probable</strong><span>{patient.oxygenReason}</span></div> : null}</td>
                        <td data-label="Estado">
                          <select className={statusClass(patient.status)} value={patient.status} onChange={(event) => setXRayStatus(patient.id, event.target.value as Status)}>
                            <option>Pendiente</option><option>En traslado</option><option>Realizado</option>
                          </select>
                        </td>
                        <td className="row-actions"><button onClick={() => editXRay(patient)}>Editar</button><button className="danger-text" onClick={() => removeXRay(patient.id)}>Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      ) : (
        <main>
          <section className="summary-grid" aria-label="Resumen de pacientes a piso">
            <div className="summary-card"><span>Pendientes</span><strong>{floorSummary.pending}</strong></div>
            <div className="summary-card"><span>En traslado</span><strong>{floorSummary.moving}</strong></div>
            <div className="summary-card"><span>Realizados</span><strong>{floorSummary.done}</strong></div>
          </section>

          <section className="capture-panel compact">
            <div><div className="eyebrow">Piso</div><h2>Agregar traslado</h2><p>Registra cama/área y destino. El nombre puede quedar vacío si todavía no te lo dieron.</p></div>
            <button className="button primary" onClick={() => {
              setFloorDraft(emptyFloor);
              setEditingFloor(null);
              setShowFloorForm(true);
            }}>Agregar paciente</button>
          </section>

          {showFloorForm ? (
            <form className="editor" onSubmit={saveFloor}>
              <div className="editor-head">
                <div><div className="eyebrow">{editingFloor ? 'Corrección' : 'Nuevo traslado'}</div><h2>{editingFloor ? 'Editar paciente a piso' : 'Paciente a piso'}</h2></div>
                <button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setShowFloorForm(false)}>×</button>
              </div>
              <div className="form-grid floor-grid">
                <label>Cama / área<input required value={floorDraft.bed} onChange={(event) => setFloorDraft({...floorDraft, bed: event.target.value})} placeholder="C#11, CE1, UP…" /></label>
                <label>Nombre <span className="optional">opcional</span><input value={floorDraft.name} onChange={(event) => setFloorDraft({...floorDraft, name: event.target.value})} placeholder="Si te lo proporcionan" /></label>
                <label>Destino<input required value={floorDraft.destination} onChange={(event) => setFloorDraft({...floorDraft, destination: event.target.value})} placeholder="Nefro, Gastro, MI…" /></label>
                <label>Traslado<select value={floorDraft.transport} onChange={(event) => setFloorDraft({...floorDraft, transport: event.target.value as Transport})}><option>Por definir</option><option>Silla</option><option>Camilla</option></select></label>
              </div>
              <div className="editor-actions"><button type="button" className="button ghost" onClick={() => setShowFloorForm(false)}>Cancelar</button><button className="button primary" type="submit">{editingFloor ? 'Guardar cambios' : 'Agregar a piso'}</button></div>
            </form>
          ) : null}

          <section className="list-section">
            <div className="section-head"><div><div className="eyebrow">Seguimiento</div><h2>Pacientes a piso</h2></div><span className="muted">{floorPatients.length} en el turno</span></div>
            {floorPatients.length === 0 ? (
              <div className="empty-state"><strong>Sin pacientes a piso</strong><span>Agrega el primero cuando te den el destino.</span></div>
            ) : (
              <div className="table-wrap">
                <table className="patient-table floor-table">
                  <thead><tr><th>Cama / área</th><th>Paciente</th><th>Destino</th><th>Traslado</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {floorPatients.map((patient) => (
                      <tr key={patient.id} className={patient.status === 'Realizado' ? 'row-done' : ''}>
                        <td data-label="Cama"><strong className="bed-chip">{patient.bed}</strong></td>
                        <td data-label="Paciente"><div className="patient-name">{patient.name || 'Nombre no proporcionado'}</div><div className="subtle">{formatTime(patient.createdAt)}</div></td>
                        <td data-label="Destino"><strong>{patient.destination}</strong></td>
                        <td data-label="Traslado">{patient.transport}</td>
                        <td data-label="Estado"><select className={statusClass(patient.status)} value={patient.status} onChange={(event) => setFloorStatus(patient.id, event.target.value as Status)}><option>Pendiente</option><option>En traslado</option><option>Realizado</option></select></td>
                        <td className="row-actions"><button onClick={() => editFloor(patient)}>Editar</button><button className="danger-text" onClick={() => removeFloor(patient.id)}>Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
