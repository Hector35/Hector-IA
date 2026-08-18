(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const ORIGINAL_FETCH = window.fetch.bind(window);
  const ROLLBACK_MS = 900;

  const FLOOR_PROMPT_ADDENDUM = `

RELECTURA ESPECIAL DE PIZARRONES ORIGEN → DESTINO:
- Si la imagen es un pizarrón de traslados a Piso con renglones tipo "14 - 72", "11 - UEH", "CE1 - 30", "CE2 - 14", léelo de ARRIBA HACIA ABAJO y devuelve UN objeto por cada par legible.
- El valor de la izquierda es la cama/área de ORIGEN y va en bed/handwrittenBed. El valor de la derecha es el DESTINO y va en destination y target.
- "OK", palomitas, rayas negras y tachones son ANOTACIONES; nunca son cama ni destino. Si son visibles, consérvalos solo en transferNotes/recognizedText. No deduzcas por tu cuenta que significan Pendiente o Realizado.
- No omitas un renglón únicamente porque esté tachado o tenga "OK": transcribe el par legible y conserva la anotación para revisión operativa.
- Haz una segunda pasada visual antes de responder para comprobar que no saltaste renglones. No te detengas al encontrar algunas camas; devuelve todos los pares legibles.
- No inventes pares para completar un total y no uses el nombre escrito en el encabezado como paciente.`;

  const clean = (value) => String(value ?? '').trim();
  const plain = (value) => clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function normalizeOrigin(value) {
    const text = clean(value)
      .replace(/^C\/\s*(?=CE\s*\d+)/i, '')
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/#/g, '');
    if (!text || /SALADEESPERA/.test(text)) return '';
    let match = text.match(/^CAMA0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^UA0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^C0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^0*(\d+)$/); if (match) return `N:${Number(match[1])}`;
    match = text.match(/^(CE|UP|UI)0*(\d+)$/); if (match) return `${match[1]}:${Number(match[2])}`;
    return '';
  }

  function incomingOrigin(patient) {
    return normalizeOrigin(patient?.handwrittenBed) ||
      normalizeOrigin(patient?.formBed) ||
      normalizeOrigin(patient?.bed);
  }

  function destination(patient) {
    const value = clean(patient?.destination || patient?.target).toUpperCase().replace(/\s+/g, ' ');
    if (/^UEH\b/.test(value)) return 'UEH';
    const match = value.match(/^(?:CAMA(?: DE PISO)?\s*)?#?\s*(\d{1,3})$/i);
    if (!match) return '';
    const number = Number(match[1]);
    return Number.isFinite(number) && number > 0 ? String(number) : '';
  }

  function rowDestination(row) {
    return destination({destination: row?.destination, target: row?.target});
  }

  function isFloorPatient(patient) {
    const category = plain(patient?.category);
    return category === 'piso' || /subir\s+a\s+piso|traslado\s+a\s+piso/.test(category);
  }

  function isExistingFloor(row) {
    return plain(row?.category) === 'piso';
  }

  function isRealized(row) {
    return plain(row?.status) === 'realizado';
  }

  function readRows() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeRows(rows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }

  function syncApp(source, detail = {}) {
    try {
      document.dispatchEvent(new CustomEvent('pendientes:status-changed', {
        detail: {source, ...detail}
      }));
    } catch {}
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
    if (!data || typeof data !== 'object') return {payload: null, field: ''};
    for (const field of ['text', 'answer', 'output_text']) {
      if (field in data) return {payload: parsePayload(data[field]), field};
    }
    return {payload: parsePayload(data), field: '__root__'};
  }

  function cloneVisionInit(init) {
    if (!(init?.body instanceof FormData)) return init;
    const prompt = init.body.get('prompt');
    if (typeof prompt !== 'string' || prompt.includes('RELECTURA ESPECIAL DE PIZARRONES ORIGEN')) return init;

    const body = new FormData();
    for (const [key, value] of init.body.entries()) {
      if (key === 'prompt') body.append(key, `${prompt}${FLOOR_PROMPT_ADDENDUM}`);
      else body.append(key, value);
    }
    return {...init, body};
  }

  function isVisionRequest(input) {
    const url = typeof input === 'string' ? input : input?.url;
    return typeof url === 'string' && url.includes('/api/turno-rx/vision');
  }

  function enrichIncoming(incoming, existing) {
    if (!existing || isRealized(existing)) return incoming;
    const incomingTransport = clean(incoming?.transport);
    const existingTransport = clean(existing?.transport);
    const incomingSex = clean(incoming?.sex);
    return {
      ...incoming,
      name: clean(incoming?.name) || clean(existing?.name),
      age: incoming?.age ?? existing?.age ?? null,
      sex: incomingSex && !/^no visible$/i.test(incomingSex)
        ? incomingSex
        : (clean(existing?.sex) || incomingSex || 'No visible'),
      service: clean(incoming?.service) || clean(existing?.service),
      originService: clean(incoming?.originService) || clean(existing?.originService),
      transport: incomingTransport && !/por definir|pendiente/i.test(incomingTransport)
        ? incomingTransport
        : (existingTransport || incomingTransport || 'Por definir'),
      transportReason: clean(incoming?.transportReason) || clean(existing?.transportReason),
      oxygenProbable: Boolean(incoming?.oxygenProbable || existing?.oxygenProbable),
      oxygenReason: clean(incoming?.oxygenReason) || clean(existing?.oxygenReason)
    };
  }

  function reviewObject(message, patient = {}) {
    return {
      category: 'Piso',
      handwrittenBed: '',
      formBed: '',
      bed: '',
      name: '',
      sex: clean(patient?.sex) || 'No visible',
      target: '',
      destination: '',
      service: clean(patient?.service),
      originService: clean(patient?.originService),
      transferNotes: message,
      recognizedText: [clean(patient?.recognizedText), message].filter(Boolean).join(' · '),
      confidence: {bed: 'low', sex: 'medium'}
    };
  }

  function restoreAfterCommit(removedPending, removedRealized, expectedByOrigin) {
    if (!removedPending.length && !removedRealized.length) return;
    setTimeout(() => {
      const current = readRows();
      const ids = new Set(current.map((row) => String(row?.id ?? '')));
      let changed = false;

      for (const old of removedPending) {
        const key = normalizeOrigin(old?.bed);
        const expected = expectedByOrigin.get(key) || '';
        const replacementExists = current.some((row) =>
          isExistingFloor(row) &&
          !isRealized(row) &&
          normalizeOrigin(row?.bed) === key &&
          (!expected || rowDestination(row) === expected)
        );
        if (!replacementExists && !ids.has(String(old?.id ?? ''))) {
          current.push(old);
          ids.add(String(old?.id ?? ''));
          changed = true;
        }
      }

      for (const old of removedRealized) {
        if (!ids.has(String(old?.id ?? ''))) {
          current.push(old);
          ids.add(String(old?.id ?? ''));
          changed = true;
        }
      }

      if (changed) {
        writeRows(current);
        syncApp('floor-photo-reconcile-v62-restore');
      }
    }, ROLLBACK_MS);
  }

  function reconcileFloorBoard(payload) {
    const patients = Array.isArray(payload?.patients) ? payload.patients : [];
    const originGroups = new Map();

    patients.forEach((patient, index) => {
      if (!isFloorPatient(patient)) return;
      const key = incomingOrigin(patient);
      const target = destination(patient);
      if (!key || !target) return;
      const group = originGroups.get(key) || [];
      group.push({index, patient, target});
      originGroups.set(key, group);
    });

    if (!originGroups.size) return {payload, changed: false};

    const ambiguous = new Set();
    const duplicateReview = [];
    for (const [key, group] of originGroups) {
      if (group.length <= 1) continue;
      const targets = [...new Set(group.map((item) => item.target))];
      ambiguous.add(key);
      duplicateReview.push(reviewObject(
        targets.length === 1
          ? `Origen duplicado en la lectura: ${key.replace(/^N:/, '')} → ${targets[0]}. Revisa el pizarrón.`
          : `Origen ambiguo en la lectura: ${key.replace(/^N:/, '')} → ${targets.join(' / ')}. Revisa el pizarrón.`,
        group[0].patient
      ));
    }

    const rows = readRows();
    const existingByOrigin = new Map();
    for (const row of rows) {
      if (!isExistingFloor(row)) continue;
      const key = normalizeOrigin(row?.bed);
      if (!key) continue;
      const group = existingByOrigin.get(key) || [];
      group.push(row);
      existingByOrigin.set(key, group);
    }

    const removedPending = [];
    const removedRealized = [];
    const removeIds = new Set();
    const expectedByOrigin = new Map();

    const nextPatients = patients.map((patient) => {
      if (!isFloorPatient(patient)) return patient;
      const key = incomingOrigin(patient);
      const target = destination(patient);
      if (!key || !target || ambiguous.has(key)) return patient;

      const existing = existingByOrigin.get(key) || [];
      const pending = existing.filter((row) => !isRealized(row));
      const realized = existing.filter(isRealized);

      if (pending.length > 1) {
        ambiguous.add(key);
        duplicateReview.push(reviewObject(
          `Hay más de un pendiente existente para el origen ${key.replace(/^N:/, '')}. No se reemplazó automáticamente.`,
          patient
        ));
        return patient;
      }

      expectedByOrigin.set(key, target);

      for (const old of realized) {
        removeIds.add(String(old?.id ?? ''));
        removedRealized.push(old);
      }

      if (pending.length === 1) {
        const old = pending[0];
        removeIds.add(String(old?.id ?? ''));
        removedPending.push(old);
        return enrichIncoming(patient, old);
      }

      return patient;
    });

    const filteredPatients = nextPatients.filter((patient) => {
      if (!isFloorPatient(patient)) return true;
      const key = incomingOrigin(patient);
      return !key || !ambiguous.has(key);
    });

    if (duplicateReview.length) filteredPatients.push(...duplicateReview);

    if (!removeIds.size && !duplicateReview.length && filteredPatients.length === patients.length) {
      return {payload, changed: false};
    }

    if (removeIds.size) {
      const nextRows = rows.filter((row) => !removeIds.has(String(row?.id ?? '')));
      writeRows(nextRows);
      syncApp('floor-photo-reconcile-v62-stage', {removed: removeIds.size});
      restoreAfterCommit(removedPending, removedRealized, expectedByOrigin);
    }

    return {
      payload: {...payload, patients: filteredPatients},
      changed: true
    };
  }

  window.fetch = async function patchedFetch(input, init) {
    const vision = isVisionRequest(input);
    const requestInit = vision ? cloneVisionInit(init) : init;
    const response = await ORIGINAL_FETCH(input, requestInit);
    if (!vision || !response.ok) return response;

    try {
      const data = await response.clone().json();
      const {payload, field} = getVisionPayload(data);
      if (!payload) return response;

      const reconciled = reconcileFloorBoard(payload);
      if (!reconciled.changed) return response;

      const nextData = field === '__root__'
        ? reconciled.payload
        : {...data, [field]: JSON.stringify(reconciled.payload)};

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
