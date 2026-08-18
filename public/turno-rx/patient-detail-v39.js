(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const SNAPSHOT_KEY = 'pendientes-shift-snapshots-v37';
  const HISTORY_KEY = 'pendientes-shift-history-v1';
  const DB_NAME = 'pendientes-boletas-v1';
  const DB_VERSION = 1;
  const STORE_NAME = 'images';
  const BOLETA_ADDENDUM = `\n\nDATOS ADICIONALES DE LA BOLETA:\nSi son VISIBLES y legibles, agrega también a cada paciente estas claves opcionales: \"requestingDoctor\" (médico solicitante), \"service\" (servicio), \"originService\" (procedencia), \"folio\", \"requestDate\", \"notes\" y \"extraData\" (objeto con otros datos útiles visibles que no encajen en los campos anteriores). Si un dato no está visible, déjalo vacío o no lo incluyas. No inventes nada. Conserva además todos los campos ya solicitados.`;

  const upstreamSetItem = Storage.prototype.setItem;
  const nativeGetItem = Storage.prototype.getItem;
  const upstreamFetch = window.fetch.bind(window);
  const fileRefs = new WeakMap();
  const captureWindows = [];
  let activeHistorySnapshotId = null;
  let selectedCurrentRowId = null;
  let bypassRowDetail = false;
  let detailObjectUrl = null;
  let viewerObjectUrl = null;
  let viewerScale = 1;
  let historyWireScheduled = false;

  function uid() {
    return globalThis.crypto?.randomUUID?.() || `boleta-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function text(value) {
    return String(value ?? '').trim();
  }

  function plain(value) {
    return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }

  function readLocal(key, fallback) {
    try {
      const raw = nativeGetItem.call(localStorage, key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function parseVisionPayload(value) {
    if (value && typeof value === 'object') return value;
    const raw = text(value);
    if (!raw) return null;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    const source = fenced || raw;
    try { return JSON.parse(source); } catch {}
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(source.slice(start, end + 1)); } catch {}
    }
    return null;
  }

  function extractRawPatients(data) {
    const parsed = parseVisionPayload(data?.text ?? data?.answer ?? data?.output_text ?? data);
    if (!parsed) return [];
    return Array.isArray(parsed.patients) ? parsed.patients : [parsed];
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'));
    });
  }

  async function saveBoletaFile(id, file) {
    if (!(file instanceof File)) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        id,
        blob: file,
        name: file.name || 'boleta',
        type: file.type || 'image/jpeg',
        size: file.size || 0,
        createdAt: new Date().toISOString()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('No se pudo guardar la boleta'));
      tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la boleta'));
    });
    db.close();
  }

  async function getBoletaFile(id) {
    if (!id) return null;
    try {
      const db = await openDb();
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return result;
    } catch {
      return null;
    }
  }

  function normalizeCandidate(value) {
    return plain(value).replace(/^c\/\s*(?=ce\s*\d+)/, '').replace(/\s+/g, '');
  }

  function rawMatchScore(row, raw) {
    let score = 0;
    const rowBed = normalizeCandidate(row?.bed);
    const rawBed = normalizeCandidate(raw?.handwrittenBed || raw?.formBed || raw?.bed);
    if (rowBed && rawBed && rowBed === rawBed) score += 6;
    const rowName = plain(row?.name);
    const rawName = plain(raw?.name);
    if (rowName && rawName) {
      if (rowName === rawName) score += 6;
      else if (rowName.includes(rawName) || rawName.includes(rowName)) score += 3;
    }
    const rowTarget = plain(row?.target);
    const rawTarget = plain(raw?.target || raw?.study || raw?.destination);
    if (rowTarget && rawTarget) {
      if (rowTarget === rawTarget) score += 4;
      else if (rowTarget.includes(rawTarget) || rawTarget.includes(rowTarget)) score += 2;
    }
    return score;
  }

  function meaningfulRowChanged(before, after) {
    if (!before || !after) return true;
    const fields = ['bed','name','age','sex','target','modality','diagnosis','diagnosisMeaning','transport','transportReason','oxygenProbable','oxygenReason'];
    return fields.some((key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null));
  }

  function captureForRow(row, windows) {
    const created = Date.parse(row?.createdAt || '');
    if (!Number.isFinite(created)) return null;
    for (let index = 0; index < windows.length; index += 1) {
      const current = windows[index];
      const next = windows[index + 1];
      const start = Number(current.fetchStartedAt || current.selectedAt || 0) - 1500;
      const end = next?.fetchStartedAt ? Number(next.fetchStartedAt) - 1 : Date.now() + 5000;
      if (created >= start && created <= end) return current;
    }
    return null;
  }

  function compactExtraData(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const ignored = new Set([
      'handwrittenBed','formBed','waitingRoomMarked','bed','name','birthDate','age','sex','category','target','study','destination','destinationFloor','destinationBlock','modality',
      'diagnosis','diagnosisMeaning','transport','transportReason','oxygenProbable','oxygenReason','requestingDoctor','doctor','physician',
      'service','originService','procedence','provenance','folio','requestDate','notes','extraData'
    ]);
    const extra = {};
    if (raw.extraData && typeof raw.extraData === 'object' && !Array.isArray(raw.extraData)) {
      for (const [key, value] of Object.entries(raw.extraData)) if (value !== '' && value !== null && value !== undefined) extra[key] = value;
    }
    for (const [key, value] of Object.entries(raw)) {
      if (ignored.has(key) || value === '' || value === null || value === undefined || typeof value === 'object') continue;
      extra[key] = value;
    }
    return Object.keys(extra).length ? extra : null;
  }

  function attachRawBoleta(row, capture, raw) {
    if (!capture) return row;
    const next = { ...row, boletaPhotoId: capture.photoId, boletaCapturedAt: capture.selectedIso, boletaOriginalName: capture.fileName, boletaMimeType: capture.fileType };
    if (!raw || typeof raw !== 'object') return next;
    const doctor = text(raw.requestingDoctor || raw.doctor || raw.physician);
    const service = text(raw.service);
    const originService = text(raw.originService || raw.procedence || raw.provenance);
    const folio = text(raw.folio);
    const requestDate = text(raw.requestDate);
    const notes = text(raw.notes);
    if (doctor) next.requestingDoctor = doctor;
    if (service) next.service = service;
    if (originService) next.originService = originService;
    if (folio) next.folio = folio;
    if (requestDate) next.requestDate = requestDate;
    if (notes) next.boletaNotes = notes;
    const extra = compactExtraData(raw);
    if (extra) next.boletaExtra = extra;
    return next;
  }

  function attachPendingCaptures(incoming) {
    if (!Array.isArray(incoming) || !captureWindows.length) return incoming;
    const current = readLocal(STORAGE_KEY, []);
    const currentById = new Map((Array.isArray(current) ? current : []).filter((row) => row?.id).map((row) => [String(row.id), row]));
    const windows = [...captureWindows].filter((item) => item.fetchStartedAt).sort((a, b) => a.fetchStartedAt - b.fetchStartedAt);
    if (!windows.length) return incoming;

    const candidates = incoming.filter((row) => {
      const before = currentById.get(String(row?.id ?? ''));
      return !before || meaningfulRowChanged(before, row);
    });
    const assignments = new Map();

    for (const capture of windows) {
      const captureRows = candidates.filter((row) => captureForRow(row, windows) === capture);
      if (!captureRows.length && windows.length === 1 && candidates.length) captureRows.push(...candidates);
      const rawList = Array.isArray(capture.rawPatients) ? capture.rawPatients : [];
      const used = new Set();
      captureRows.forEach((row, rowIndex) => {
        let bestIndex = -1;
        let bestScore = -1;
        rawList.forEach((raw, rawIndex) => {
          if (used.has(rawIndex)) return;
          const score = rawMatchScore(row, raw);
          if (score > bestScore) { bestScore = score; bestIndex = rawIndex; }
        });
        if (bestIndex < 0 && rawList[rowIndex] && !used.has(rowIndex)) bestIndex = rowIndex;
        if (bestIndex >= 0) used.add(bestIndex);
        assignments.set(String(row?.id ?? ''), { capture, raw: bestIndex >= 0 ? rawList[bestIndex] : null });
      });
    }

    const next = incoming.map((row) => {
      const match = assignments.get(String(row?.id ?? ''));
      return match ? attachRawBoleta(row, match.capture, match.raw) : row;
    });
    captureWindows.splice(0, captureWindows.length);
    return next;
  }

  Storage.prototype.setItem = function patientDetailStorageSetItem(key, value) {
    if (this !== localStorage || key !== STORAGE_KEY) return upstreamSetItem.call(this, key, value);
    try {
      const incoming = JSON.parse(value);
      if (!Array.isArray(incoming)) return upstreamSetItem.call(this, key, value);
      return upstreamSetItem.call(this, key, JSON.stringify(attachPendingCaptures(incoming)));
    } catch {
      return upstreamSetItem.call(this, key, value);
    }
  };

  function registerSelectedFiles(input) {
    const files = [...(input?.files || [])];
    if (!files.length) return;
    const selectedAt = Date.now();
    files.forEach((file, index) => {
      const photoId = uid();
      const record = {
        photoId,
        fileName: file.name || `boleta-${index + 1}`,
        fileType: file.type || 'image/jpeg',
        selectedAt,
        selectedIso: new Date(selectedAt).toISOString(),
        fetchStartedAt: 0,
        rawPatients: []
      };
      fileRefs.set(file, record);
      captureWindows.push(record);
      saveBoletaFile(photoId, file).catch(() => {});
    });
  }

  window.fetch = async function patientDetailFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isVision = String(url).includes('/api/turno-rx/vision') && init?.body instanceof FormData;
    let capture = null;
    if (isVision) {
      const file = init.body.get('image');
      capture = file instanceof File ? fileRefs.get(file) || null : null;
      if (!capture && file instanceof File) {
        const photoId = uid();
        capture = { photoId, fileName:file.name || 'boleta', fileType:file.type || 'image/jpeg', selectedAt:Date.now(), selectedIso:new Date().toISOString(), fetchStartedAt:0, rawPatients:[] };
        fileRefs.set(file, capture);
        captureWindows.push(capture);
        saveBoletaFile(photoId, file).catch(() => {});
      }
      if (capture) capture.fetchStartedAt = Date.now();
      const prompt = text(init.body.get('prompt'));
      if (prompt && !prompt.includes('DATOS ADICIONALES DE LA BOLETA')) init.body.set('prompt', `${prompt}${BOLETA_ADDENDUM}`);
    }

    const response = await upstreamFetch(input, init);
    if (isVision && capture && typeof response?.json === 'function') {
      const originalJson = response.json.bind(response);
      try {
        Object.defineProperty(response, 'json', {
          configurable: true,
          value: async (...args) => {
            const data = await originalJson(...args);
            capture.rawPatients = extractRawPatients(data);
            capture.responseParsedAt = Date.now();
            return data;
          }
        });
      } catch {}
    }
    return response;
  };

  function categoryFor(row) {
    const explicit = text(row?.category);
    if (explicit) return explicit;
    const target = plain(row?.target || row?.study || row?.destination);
    if (target === 'piso') return 'Piso';
    if (target === 'interconsulta') return 'Interconsulta';
    if (target === 'apoyo para movimiento' || target === 'apoyo movimiento') return 'Apoyo para movimiento';
    const modality = plain(row?.modality);
    if (modality.includes('tac') || modality.includes('tomograf')) return 'TAC';
    if (modality.includes('ultrason') || modality === 'usg') return 'USG';
    if (modality.includes('rayos') || modality === 'rx') return 'Rayos X';
    return explicit || '—';
  }

  function statusFor(row, historical = false) {
    const direct = text(row?.status || row?.estado);
    if (direct) return direct;
    if (row?.realizedAt || row?.completedAt || row?.doneAt) return 'Realizado';
    return historical && row?.removedAsCompleted === true ? 'Realizado' : 'Pendiente';
  }

  function firstAvailable(row, keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== null && value !== undefined && text(value)) return text(value);
    }
    return '';
  }

  function detailFields(row, historical = false) {
    const age = row?.age === null || row?.age === undefined || row?.age === '' ? '' : `${row.age} años`;
    const sex = firstAvailable(row, ['sex','sexo']);
    const doctor = firstAvailable(row, ['requestingDoctor','medicoSolicitante','doctor','physician']);
    const service = firstAvailable(row, ['service','servicio']);
    const origin = firstAvailable(row, ['originService','procedencia','provenance']);
    const serviceOrigin = [service, origin].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(' · ');
    const floorPatient = categoryFor(row) === 'Piso';
    const study = floorPatient ? firstAvailable(row, ['destination','target']) : firstAvailable(row, ['target','study']);
    const transport = firstAvailable(row, ['transport','transportType','movement']);
    const primary = [
      ['Cama / área', firstAvailable(row, ['bed','origin'])],
      ['Nombre', firstAvailable(row, ['name','patientName'])],
      ['Edad', age],
      ['Sexo', sex && sex !== 'No visible' ? sex : ''],
      [floorPatient ? 'Destino' : 'Estudio solicitado', study],
      ['Categoría', categoryFor(row)],
      ['Médico solicitante', doctor],
      ['Servicio / procedencia', serviceOrigin],
      ['Estado', statusFor(row, historical)],
      ['Diagnóstico / dato clínico', firstAvailable(row, ['diagnosis'])],
      ['Qué significa', firstAvailable(row, ['diagnosisMeaning'])],
      ['Folio', firstAvailable(row, ['folio'])],
      ['Fecha de solicitud', [firstAvailable(row, ['requestDate']), firstAvailable(row, ['requestTime'])].filter(Boolean).join(' · ')],
      ['Indicaciones de traslado', firstAvailable(row, ['transferNotes'])],
      ['Notas de boleta', firstAvailable(row, ['boletaNotes','notes'])]
    ].filter(([, value]) => value && value !== '—');

    const transfer = [
      ['Medio', transport],
      ['Razón', firstAvailable(row, ['transportReason'])]
    ].filter(([, value]) => value && value !== '—');
    if (row?.oxygenProbable) {
      transfer.push(['Oxígeno', 'Sí']);
      const why = firstAvailable(row, ['oxygenReason']);
      if (why) transfer.push(['Razón del oxígeno', why]);
    }

    const extra = [];
    if (row?.boletaExtra && typeof row.boletaExtra === 'object' && !Array.isArray(row.boletaExtra)) {
      for (const [key, value] of Object.entries(row.boletaExtra)) {
        if (['category','categoria','target','study','destination','transport','transportType','movement'].includes(plain(key))) continue;
        if (value === '' || value === null || value === undefined) continue;
        const shown = typeof value === 'object' ? JSON.stringify(value) : String(value);
        extra.push([humanizeKey(key), shown]);
      }
    }
    const review = [];
    if (row?.needsReview) review.push(['Revisión necesaria', (Array.isArray(row?.reviewFields) ? row.reviewFields : []).join(', ') || 'Campos dudosos']);
    const recognizedText = firstAvailable(row, ['recognizedText']);
    if (recognizedText) review.push(['Texto reconocido', recognizedText]);
    return { primary, transfer, extra, review };
  }

  function humanizeKey(key) {
    const known = {
      birthDate:'Fecha de nacimiento', handwrittenBed:'Cama manuscrita', formBed:'Cama impresa', waitingRoomMarked:'Sala de espera marcada'
    };
    if (known[key]) return known[key];
    return String(key || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (char) => char.toUpperCase());
  }

  function rowsHtml(entries) {
    if (!entries.length) return '<div class="v39-empty-section">Sin datos adicionales guardados.</div>';
    return entries.map(([label, value]) => `<div class="v39-detail-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  }

  function makeTransportInteractive(row, historical) {
    if (historical || !row?.id) return;
    const body = document.getElementById('v39DetailBody');
    const transferRows = [...(body?.querySelectorAll('.v39-detail-section') || [])]
      .find((section) => plain(section.querySelector('h3')?.textContent) === 'traslado')
      ?.querySelectorAll('.v39-detail-row');
    const mediumRow = [...(transferRows || [])].find((entry) => plain(entry.querySelector('span')?.textContent) === 'medio');
    const value = mediumRow?.querySelector('strong');
    if (!value) return;
    const transport = firstAvailable(row, ['transport','transportType','movement']) || 'Por definir';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v39-transport-button';
    button.dataset.quickTransport = '1';
    button.dataset.patientId = String(row.id);
    button.setAttribute('aria-label', `Cambiar traslado. Actual: ${transport}`);
    button.innerHTML = `<span aria-hidden="true">${transport === 'Silla' ? '♿' : transport === 'Camilla' ? '🛏️' : '•'}</span><b>${esc(transport)}</b>`;
    value.replaceWith(button);
  }

  function ensureDetailSheet() {
    let backdrop = document.getElementById('patientDetailV39');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'patientDetailV39';
    backdrop.className = 'v39-detail-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `<section class="v39-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="v39DetailTitle">
      <div class="v39-sheet-handle"></div>
      <div class="v39-detail-head"><div><div class="v39-kicker">PACIENTE</div><h2 id="v39DetailTitle">Detalle</h2></div><button type="button" class="v39-close" aria-label="Cerrar">×</button></div>
      <div class="v39-detail-scroll" id="v39DetailBody"></div>
      <div class="v39-detail-actions" id="v39DetailActions"><button type="button" class="v39-edit">Editar</button><button type="button" class="v39-remove">Quitar</button></div>
    </section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.v39-close')?.addEventListener('click', closeDetail);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeDetail(); });
    backdrop.querySelector('.v39-edit')?.addEventListener('click', editSelectedCurrentRow);
    backdrop.querySelector('.v39-remove')?.addEventListener('click', removeSelectedCurrentRow);
    return backdrop;
  }

  function closeDetail() {
    const backdrop = document.getElementById('patientDetailV39');
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('v39-detail-open');
    if (detailObjectUrl) URL.revokeObjectURL(detailObjectUrl);
    detailObjectUrl = null;
  }

  async function renderPhotoSection(row) {
    const host = document.getElementById('v39PhotoHost');
    if (!host) return;
    if (!row?.boletaPhotoId) {
      host.innerHTML = '<div class="v39-no-photo">Sin foto de boleta</div>';
      return;
    }
    const record = await getBoletaFile(row.boletaPhotoId);
    if (!host.isConnected) return;
    if (!record?.blob) {
      host.innerHTML = '<div class="v39-no-photo">Sin foto de boleta</div>';
      return;
    }
    if (detailObjectUrl) URL.revokeObjectURL(detailObjectUrl);
    detailObjectUrl = URL.createObjectURL(record.blob);
    host.innerHTML = `<button type="button" class="v39-photo-thumb" aria-label="Abrir boleta original"><img src="${detailObjectUrl}" alt="Boleta original del paciente"/><span>Tocar para ampliar</span></button>`;
    host.querySelector('.v39-photo-thumb')?.addEventListener('click', () => openViewer(record.blob));
  }

  async function openDetail(row, options = {}) {
    if (!row) return;
    const historical = Boolean(options.historical);
    const backdrop = ensureDetailSheet();
    const body = backdrop.querySelector('#v39DetailBody');
    const actions = backdrop.querySelector('#v39DetailActions');
    const title = firstAvailable(row, ['name','patientName']) || firstAvailable(row, ['bed','origin']) || 'Detalle';
    backdrop.querySelector('#v39DetailTitle').textContent = title;
    const fields = detailFields(row, historical);
    body.innerHTML = `<section class="v39-detail-section"><h3>Paciente</h3><div class="v39-detail-card">${rowsHtml(fields.primary)}</div></section>
      <section class="v39-detail-section"><h3>Traslado</h3><div class="v39-detail-card">${rowsHtml(fields.transfer)}</div></section>
      ${fields.review.length ? `<details class="v39-detail-section v56-detail-fold"><summary>Revisión de lectura</summary><div class="v39-detail-card">${rowsHtml(fields.review)}</div></details>` : ''}
      ${fields.extra.length ? `<details class="v39-detail-section v56-detail-fold"><summary>Otros datos de la boleta</summary><div class="v39-detail-card">${rowsHtml(fields.extra)}</div></details>` : ''}
      <details class="v39-detail-section v56-detail-fold"><summary>Boleta original</summary><div class="v39-detail-card v39-photo-card" id="v39PhotoHost"><div class="v39-photo-loading">Cargando foto…</div></div></details>`;
    actions.hidden = historical;
    selectedCurrentRowId = historical ? null : String(row?.id ?? '');
    makeTransportInteractive(row, historical);
    backdrop.hidden = false;
    document.body.classList.add('v39-detail-open');
    await renderPhotoSection(row);
  }

  function currentRowById(id) {
    const rows = readLocal(STORAGE_KEY, []);
    return Array.isArray(rows) ? rows.find((row) => String(row?.id ?? '') === String(id ?? '')) || null : null;
  }

  function editSelectedCurrentRow() {
    const id = selectedCurrentRowId;
    if (!id) return;
    const row = document.querySelector(`.patient-row[data-id="${CSS.escape(id)}"]`);
    closeDetail();
    if (!row) return;
    const wasImaging = row.classList.contains('imaging-row');
    bypassRowDetail = true;
    if (wasImaging) row.classList.remove('imaging-row');
    row.click();
    if (wasImaging) row.classList.add('imaging-row');
    bypassRowDetail = false;
  }

  function removeSelectedCurrentRow() {
    const id = selectedCurrentRowId;
    if (!id) return;
    const remove = document.querySelector(`[data-remove="${CSS.escape(id)}"]`);
    closeDetail();
    remove?.click();
  }

  function ensureViewer() {
    let viewer = document.getElementById('boletaViewerV39');
    if (viewer) return viewer;
    viewer = document.createElement('div');
    viewer.id = 'boletaViewerV39';
    viewer.className = 'v39-viewer';
    viewer.hidden = true;
    viewer.innerHTML = `<div class="v39-viewer-top"><strong>Boleta original</strong><div class="v39-viewer-controls"><button type="button" data-zoom="out" aria-label="Alejar">−</button><button type="button" data-zoom="reset" aria-label="Restablecer zoom">100%</button><button type="button" data-zoom="in" aria-label="Acercar">＋</button><button type="button" class="v39-viewer-close" aria-label="Cerrar">×</button></div></div><div class="v39-viewer-stage"><img alt="Boleta original ampliada"/></div>`;
    document.body.appendChild(viewer);
    viewer.querySelector('.v39-viewer-close')?.addEventListener('click', closeViewer);
    viewer.querySelector('[data-zoom="in"]')?.addEventListener('click', () => setViewerScale(viewerScale + 0.5));
    viewer.querySelector('[data-zoom="out"]')?.addEventListener('click', () => setViewerScale(viewerScale - 0.5));
    viewer.querySelector('[data-zoom="reset"]')?.addEventListener('click', () => setViewerScale(1));
    const img = viewer.querySelector('img');
    let lastTap = 0;
    img?.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTap < 350) setViewerScale(viewerScale > 1 ? 1 : 2);
      lastTap = now;
    });
    viewer.querySelector('.v39-viewer-stage')?.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setViewerScale(viewerScale + (event.deltaY < 0 ? 0.25 : -0.25));
    }, { passive:false });
    return viewer;
  }

  function setViewerScale(value) {
    const viewer = document.getElementById('boletaViewerV39');
    if (!viewer) return;
    viewerScale = Math.min(5, Math.max(0.5, Number(value) || 1));
    const img = viewer.querySelector('img');
    if (img) img.style.width = `${viewerScale * 100}%`;
    const reset = viewer.querySelector('[data-zoom="reset"]');
    if (reset) reset.textContent = `${Math.round(viewerScale * 100)}%`;
  }

  function openViewer(blob) {
    if (!blob) return;
    const viewer = ensureViewer();
    if (viewerObjectUrl) URL.revokeObjectURL(viewerObjectUrl);
    viewerObjectUrl = URL.createObjectURL(blob);
    const img = viewer.querySelector('img');
    if (img) img.src = viewerObjectUrl;
    setViewerScale(1);
    viewer.hidden = false;
    document.body.classList.add('v39-viewer-open');
  }

  function closeViewer() {
    const viewer = document.getElementById('boletaViewerV39');
    if (viewer) viewer.hidden = true;
    document.body.classList.remove('v39-viewer-open');
    if (viewerObjectUrl) URL.revokeObjectURL(viewerObjectUrl);
    viewerObjectUrl = null;
  }

  function snapshots() {
    const current = readLocal(SNAPSHOT_KEY, []);
    if (Array.isArray(current) && current.length) return current;
    const legacy = readLocal(HISTORY_KEY, []);
    if (!Array.isArray(legacy)) return [];
    return legacy.map((entry) => ({ id:String(entry?.shift?.id || ''), rows:Array.isArray(entry?.rows) ? entry.rows : [] }));
  }

  function wireHistoryRows() {
    historyWireScheduled = false;
    const table = document.querySelector('#v37HistoryView .v37-history-table tbody');
    if (!table || !activeHistorySnapshotId) return;
    [...table.querySelectorAll('tr')].forEach((tr, index) => {
      tr.dataset.v39HistoryIndex = String(index);
      tr.classList.add('v39-history-clickable');
    });
  }

  function scheduleHistoryWire() {
    if (historyWireScheduled) return;
    historyWireScheduled = true;
    queueMicrotask(wireHistoryRows);
  }

  document.addEventListener('change', (event) => {
    if (event.target?.id === 'galleryInput') registerSelectedFiles(event.target);
  }, true);

  document.addEventListener('click', (event) => {
    const snapshotButton = event.target.closest?.('[data-snapshot-id]');
    if (snapshotButton?.dataset?.snapshotId) {
      activeHistorySnapshotId = snapshotButton.dataset.snapshotId;
      scheduleHistoryWire();
      return;
    }

    const historyRow = event.target.closest?.('.v39-history-clickable[data-v39-history-index]');
    if (historyRow && activeHistorySnapshotId) {
      const snapshot = snapshots().find((item) => String(item?.id ?? '') === String(activeHistorySnapshotId));
      const row = snapshot?.rows?.[Number(historyRow.dataset.v39HistoryIndex)];
      if (row) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openDetail(row, { historical:true });
      }
      return;
    }

    const transport = event.target.closest?.('[data-quick-transport="1"]');
    if (transport) {
      event.stopImmediatePropagation();
      return;
    }

    if (bypassRowDetail) return;
    const patientRow = event.target.closest?.('.patient-row[data-id]');
    if (!patientRow || event.target.closest?.('[data-remove]')) return;
    const stored = currentRowById(patientRow.dataset.id);
    if (!stored) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDetail(stored, { historical:false });
  }, true);

  document.addEventListener('pendientes:transport-changed', (event) => {
    const id = String(event.detail?.id || '');
    if (!id || id !== selectedCurrentRowId || document.getElementById('patientDetailV39')?.hidden) return;
    const updated = currentRowById(id);
    if (updated) openDetail(updated, { historical:false });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!document.getElementById('boletaViewerV39')?.hidden) closeViewer();
    else if (!document.getElementById('patientDetailV39')?.hidden) closeDetail();
  });

  function start() {
    document.documentElement.classList.add('pendientes-detail-v39');
    navigator.storage?.persist?.().catch?.(() => {});
    const target = document.getElementById('app') || document.body;
    const observer = new MutationObserver(() => scheduleHistoryWire());
    observer.observe(target, { childList:true, subtree:true });
    scheduleHistoryWire();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
