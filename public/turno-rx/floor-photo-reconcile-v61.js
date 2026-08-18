(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const originalFetch = window.fetch.bind(window);

  const clean = (value) => String(value ?? '').trim();
  const plain = (value) => clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function normalizeOrigin(value) {
    const text = clean(value).replace(/^C\/\s*(?=CE\s*\d+)/i, '').toUpperCase().replace(/\s+/g, '').replace(/#/g, '');
    if (!text || /SALADEESPERA/.test(text)) return '';
    let match = text.match(/^CAMA0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^UA0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^C0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^(CE|UP|UI)0*(\d+)$/); if (match) return `${match[1]}:${Number(match[2])}`;
    return '';
  }

  function incomingOrigin(patient) {
    return normalizeOrigin(patient?.handwrittenBed) || normalizeOrigin(patient?.formBed) || normalizeOrigin(patient?.bed);
  }

  function destination(patient) {
    const value = clean(patient?.destination || patient?.target);
    if (/^UEH$/i.test(value)) return 'UEH';
    const match = value.match(/^(?:CAMA(?: DE PISO)?\s*)?#?\s*(\d{1,3})$/i);
    if (!match) return '';
    const number = Number(match[1]);
    return Number.isFinite(number) && number > 0 ? String(number) : '';
  }

  function isFloorPatient(patient) {
    const category = plain(patient?.category);
    return category === 'piso' || /subir\s+a\s+piso|traslado\s+a\s+piso/.test(category);
  }

  function isExistingFloor(row) {
    return plain(row?.category) === 'piso';
  }

  function parsePayload(value) {
    if (value && typeof value === 'object') return value;
    const raw = clean(value);
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

  function getVisionPayload(data) {
    if (!data || typeof data !== 'object') return { payload: null, field: '' };
    for (const field of ['text', 'answer', 'output_text']) {
      if (field in data) return { payload: parsePayload(data[field]), field };
    }
    return { payload: parsePayload(data), field: '__root__' };
  }

  function enrichIncoming(incoming, existing) {
    if (!existing) return incoming;
    const incomingTransport = clean(incoming?.transport);
    const existingTransport = clean(existing?.transport);
    const sex = clean(incoming?.sex);
    return {
      ...incoming,
      name: clean(incoming?.name) || clean(existing?.name),
      age: incoming?.age ?? existing?.age ?? null,
      sex: sex && !/^no visible$/i.test(sex) ? sex : (clean(existing?.sex) || sex || 'No visible'),
      service: clean(incoming?.service) || clean(existing?.service),
      originService: clean(incoming?.originService) || clean(existing?.originService),
      transport: incomingTransport && !/por definir|pendiente/i.test(incomingTransport) ? incomingTransport : (existingTransport || incomingTransport || 'Por definir'),
      transportReason: clean(incoming?.transportReason) || clean(existing?.transportReason),
      oxygenProbable: Boolean(incoming?.oxygenProbable || existing?.oxygenProbable),
      oxygenReason: clean(incoming?.oxygenReason) || clean(existing?.oxygenReason)
    };
  }

  function reconcileFloorBoard(payload) {
    const patients = Array.isArray(payload?.patients) ? payload.patients : [];
    const floorCandidates = patients.filter((patient) => isFloorPatient(patient) && incomingOrigin(patient) && destination(patient));

    /* Un solo renglón puede ser una boleta aislada; la reconciliación especial es solo para pizarrones. */
    if (floorCandidates.length < 2) return { payload, changed: false };

    let rows;
    try {
      rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(rows)) rows = [];
    } catch {
      rows = [];
    }

    const counts = new Map();
    for (const patient of floorCandidates) {
      const key = incomingOrigin(patient);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const existingByOrigin = new Map();
    for (const row of rows) {
      if (!isExistingFloor(row) || plain(row?.status) === 'realizado') continue;
      const key = normalizeOrigin(row?.bed);
      if (key && !existingByOrigin.has(key)) existingByOrigin.set(key, row);
    }

    const replaceIds = new Set();
    const mergedPatients = patients.map((patient) => {
      if (!isFloorPatient(patient)) return patient;
      const key = incomingOrigin(patient);
      if (!key || counts.get(key) !== 1 || !destination(patient)) return patient;
      const existing = existingByOrigin.get(key);
      if (!existing) return patient;
      replaceIds.add(String(existing.id ?? ''));
      return enrichIncoming(patient, existing);
    });

    if (!replaceIds.size) return { payload, changed: false };

    const nextRows = rows.filter((row) => !replaceIds.has(String(row?.id ?? '')));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRows));

    try {
      document.dispatchEvent(new CustomEvent('pendientes:status-changed', {
        detail: { source: 'floor-photo-reconcile-v61', replaced: replaceIds.size }
      }));
    } catch {}

    return { payload: { ...payload, patients: mergedPatients }, changed: true };
  }

  function isVisionRequest(input) {
    const url = typeof input === 'string' ? input : input?.url;
    return typeof url === 'string' && url.includes('/api/turno-rx/vision');
  }

  window.fetch = async function patchedFetch(input, init) {
    const response = await originalFetch(input, init);
    if (!isVisionRequest(input) || !response.ok) return response;

    try {
      const data = await response.clone().json();
      const { payload, field } = getVisionPayload(data);
      if (!payload) return response;

      const reconciled = reconcileFloorBoard(payload);
      if (!reconciled.changed) return response;

      let nextData;
      if (field === '__root__') nextData = reconciled.payload;
      else nextData = { ...data, [field]: JSON.stringify(reconciled.payload) };

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      headers.delete('content-length');
      headers.delete('content-encoding');
      return new Response(JSON.stringify(nextData), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch {
      return response;
    }
  };
})();
