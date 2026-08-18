(() => {
  const ORIGINAL_FETCH = window.fetch.bind(window);
  const PROMPT_MARKER = 'DESTINO OPERATIVO DE PISO V64';
  const FLOOR_PROMPT_ADDENDUM = `

DESTINO OPERATIVO DE PISO V64:
- En un pizarrón o solicitud para subir a Piso, la cama/área donde está AHORA el paciente es el ORIGEN. Un nombre de servicio al que subirá es información de DESTINO, nunca debe convertirse en origen.
- Si un renglón dice que el paciente "sube", "va", "ingresa" o se dirige a un servicio, conserva ese servicio en service y úsalo como pista de destino. No copies ese servicio a originService salvo que la imagen lo rotule explícitamente como procedencia/origen actual.
- Convierte estos servicios a destino operativo: Nefrología/Nefro -> Primero; Cirugía/Cirugía General/Traumatología/Trauma/CX GRAL -> Segundo; Medicina Interna/M.I./MI -> Tercero; Obstetricia -> Segundo de la otra unidad; Pediatría -> Tercero de la otra unidad; Ginecología/Gineco -> Quinto de la otra unidad.
- Si el destino visible es una cama numérica, conserva esa cama exacta como destination/target; la aplicación determinará el piso por rango. No sustituyas una cama destino visible por el nombre del servicio.
- Si solo se ve el servicio de destino y no una cama destino, usa como destination y target el destino operativo anterior (Primero, Segundo, Tercero, Segundo de la otra unidad, Tercero de la otra unidad o Quinto de la otra unidad) y conserva el servicio literal en service.
- Si no se alcanza a identificar ni cama destino ni un servicio de destino conocido, conserva la cama/área de origen y deja destination/target vacío para que la aplicación muestre Por confirmar.
- Relectura de pizarrón: pares como "14 - 72", "11 - UEH", "CE1 - 30" y "CE2 - 14" se leen de ARRIBA HACIA ABAJO, izquierda=ORIGEN y derecha=DESTINO. "OK", palomitas, rayas o tachones son anotaciones, no camas ni destinos. No deduzcas por tu cuenta que significan Pendiente o Realizado.
- Haz una segunda pasada visual y devuelve todos los renglones legibles. No inventes filas para completar un total.`;

  const clean = (value) => String(value ?? '').trim();
  const plain = (value) => clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const SERVICE_RULES = [
    {match:/\b(nefro|nefrologia)\b/,label:'Primero',floor:'1',block:'B'},
    {match:/\b(cirugia general|cirugia|cx gral|traumatologia|trauma)\b/,label:'Segundo',floor:'2',block:'B'},
    {match:/\b(medicina interna|m i|mi)\b/,label:'Tercero',floor:'3',block:'B'},
    {match:/\b(obstetricia|obst)\b/,label:'Segundo de la otra unidad',floor:'2',block:'A'},
    {match:/\b(pediatria|pediatrico|pediatrica)\b/,label:'Tercero de la otra unidad',floor:'3',block:'A'},
    {match:/\b(ginecologia|gineco)\b/,label:'Quinto de la otra unidad',floor:'5',block:'A'}
  ];

  const LABEL_RULES = [
    {match:/^primero$/,label:'Primero',floor:'1',block:'B'},
    {match:/^segundo$/,label:'Segundo',floor:'2',block:'B'},
    {match:/^tercero$/,label:'Tercero',floor:'3',block:'B'},
    {match:/^segundo de la otra unidad$/,label:'Segundo de la otra unidad',floor:'2',block:'A'},
    {match:/^tercero de la otra unidad$/,label:'Tercero de la otra unidad',floor:'3',block:'A'},
    {match:/^quinto de la otra unidad$/,label:'Quinto de la otra unidad',floor:'5',block:'A'}
  ];

  function floorDestinationFromService(value) {
    const text = plain(value);
    if (!text) return null;
    const rule = SERVICE_RULES.find((item) => item.match.test(text));
    return rule ? {label:rule.label,floor:rule.floor,block:rule.block} : null;
  }

  function floorDestinationFromLabel(value) {
    const text = plain(value);
    if (!text) return null;
    const rule = LABEL_RULES.find((item) => item.match.test(text));
    return rule ? {label:rule.label,floor:rule.floor,block:rule.block} : null;
  }

  function floorDestinationFromBed(value) {
    const text = clean(value).toUpperCase().replace(/#/g, '').replace(/\s+/g, ' ');
    const match = text.match(/^(?:CAMA(?: DE PISO)?\s*)?(\d{1,3})$/);
    if (!match) return null;
    const bed = Number(match[1]);
    if (!Number.isFinite(bed) || bed <= 0) return null;
    if (bed <= 44) return {label:'Primero',floor:'1',block:'B',bed:String(bed)};
    if (bed <= 88) return {label:'Segundo',floor:'2',block:'B',bed:String(bed)};
    if (bed <= 132) return {label:'Tercero',floor:'3',block:'B',bed:String(bed)};
    if (bed <= 165) return {label:'Segundo de la otra unidad',floor:'2',block:'A',bed:String(bed)};
    if (bed <= 189) return {label:'Tercero de la otra unidad',floor:'3',block:'A',bed:String(bed)};
    if (bed <= 204) return {label:'Quinto de la otra unidad',floor:'5',block:'A',bed:String(bed)};
    return {label:'Destino por ubicar',floor:'',block:'',bed:String(bed)};
  }

  function isFloorPatient(patient) {
    const category = plain(patient?.category);
    return category === 'piso' || /\b(subir a piso|traslado a piso)\b/.test(category);
  }

  function isMissingDestination(value) {
    const text = plain(value);
    return !text || /^(por confirmar|por definir|pendiente|desconocido|sin destino)$/.test(text);
  }

  function normalizeFloorPatient(patient) {
    if (!patient || typeof patient !== 'object' || !isFloorPatient(patient)) return patient;

    const rawDestination = clean(patient.destination || patient.target);
    const byBed = floorDestinationFromBed(rawDestination);
    if (byBed) {
      return {
        ...patient,
        destinationFloor: clean(patient.destinationFloor) || byBed.floor,
        destinationBlock: clean(patient.destinationBlock) || byBed.block
      };
    }

    const byLabel = floorDestinationFromLabel(rawDestination);
    if (byLabel) {
      return {
        ...patient,
        destination: byLabel.label,
        target: byLabel.label,
        destinationFloor: clean(patient.destinationFloor) || byLabel.floor,
        destinationBlock: clean(patient.destinationBlock) || byLabel.block
      };
    }

    const serviceInDestination = floorDestinationFromService(rawDestination);
    const serviceFromField = isMissingDestination(rawDestination) ? floorDestinationFromService(patient.service) : null;
    const serviceHint = serviceInDestination || serviceFromField;
    if (!serviceHint) return patient;

    const literalService = serviceInDestination ? rawDestination : clean(patient.service);
    return {
      ...patient,
      service: clean(patient.service) || literalService,
      destination: serviceHint.label,
      target: serviceHint.label,
      destinationFloor: clean(patient.destinationFloor) || serviceHint.floor,
      destinationBlock: clean(patient.destinationBlock) || serviceHint.block,
      destinationService: clean(patient.destinationService) || literalService
    };
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

  function normalizePayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (Array.isArray(payload.patients)) {
      return {...payload, patients:payload.patients.map(normalizeFloorPatient)};
    }
    return normalizeFloorPatient(payload);
  }

  function normalizeVisionData(data) {
    if (!data || typeof data !== 'object') return data;
    for (const field of ['text','answer','output_text']) {
      if (!(field in data)) continue;
      const payload = parsePayload(data[field]);
      if (!payload) return data;
      const normalized = normalizePayload(payload);
      return {...data, [field]:typeof data[field] === 'string' ? JSON.stringify(normalized) : normalized};
    }
    return normalizePayload(data);
  }

  function isVisionRequest(input) {
    const url = typeof input === 'string' ? input : input?.url;
    return typeof url === 'string' && url.includes('/api/turno-rx/vision');
  }

  function withFloorPrompt(init) {
    if (!(init?.body instanceof FormData)) return init;
    const prompt = init.body.get('prompt');
    if (typeof prompt !== 'string' || prompt.includes(PROMPT_MARKER)) return init;
    const body = new FormData();
    for (const [key, value] of init.body.entries()) {
      body.append(key, key === 'prompt' ? `${prompt}${FLOOR_PROMPT_ADDENDUM}` : value);
    }
    return {...init, body};
  }

  window.fetch = async function turnoRxFloorIntelligenceV64(input, init) {
    const vision = isVisionRequest(input);
    const response = await ORIGINAL_FETCH(input, vision ? withFloorPrompt(init) : init);
    if (!vision || !response?.ok || typeof response.json !== 'function') return response;

    const upstreamJson = response.json.bind(response);
    try {
      Object.defineProperty(response, 'json', {
        configurable: true,
        value: async (...args) => normalizeVisionData(await upstreamJson(...args))
      });
    } catch {}
    return response;
  };

  window.__pendientesFloorIntelligenceV64 = {
    floorDestinationFromService,
    floorDestinationFromLabel,
    floorDestinationFromBed,
    normalizeFloorPatient,
    normalizeVisionData
  };
})();
