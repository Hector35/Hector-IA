export const KNOWLEDGE_VERSION='2026.07.21.1';
export const KNOWLEDGE_VERIFIED_AT='2026-07-21';

export type CapabilityStatus='available'|'conditional'|'planned';
export type Capability={
  id:string;
  title:string;
  component:string;
  evidence:string;
  status:CapabilityStatus;
  limitation:string;
};

export type KnowledgeEntry={
  id:string;
  domain:'self'|'owner'|'openai'|'work'|'codex'|'gpt-5.6';
  title:string;
  summary:string;
  facts:string[];
  triggers:string[];
  sources:string[];
  verifiedAt:string;
  refreshDays:number|null;
};

export const OWNER_CORE_PROFILE={
  name:'Héctor Raúl Hernández Ruiz',
  preferredName:'Héctor',
  language:'es-MX',
  timezone:'America/Monterrey',
  technicalBackground:['Técnico en Electromecánica','Estudiante de Ingeniería Biomédica'],
  workingStyle:[
    'Prefiere explicaciones de nivel ingeniería, empezando por el modelo completo y conectando fundamentos con aplicaciones.',
    'Quiere decisiones directas con supuestos, riesgos, costos de oportunidad y evidencia.',
    'Prioriza iPhone/PWA, privacidad, modularidad, memoria persistente y autonomía creciente.',
    'Desea ciclos automáticos de inspección, implementación, pruebas y corrección sin repetir trabajo terminado.',
    'Autoriza crear ramas y PRs; conserva aprobación humana para fusionar, desplegar o ejecutar acciones destructivas.'
  ],
  primaryProject:'Construir Héctor OS como asistente personal privado, persistente, modular y cada vez más independiente.',
  privacyRule:'Los datos personales sensibles permanecen en memoria privada D1 y solo deben recuperarse cuando sean relevantes; no se incluyen completos en cada prompt.'
} as const;

export const HECTOR_OS_CAPABILITIES:Capability[]=[
  {id:'identity',title:'Identidad persistente',component:'bootstrap de inteligencia + system_context',evidence:'worker/intelligence/bootstrap.ts y contexto permanente D1',status:'available',limitation:'La identidad depende de instrucciones y datos; no modifica los pesos del modelo externo.'},
  {id:'context',title:'Chat contextual',component:'Cloudflare Worker + Responses API',evidence:'worker/routes/intelligence.ts y worker/lib/context.ts',status:'available',limitation:'La calidad depende del modelo, del contexto recuperado y de los permisos habilitados.'},
  {id:'memory',title:'Memoria semántica',component:'D1 + embeddings',evidence:'memories, memory_embeddings y recuperación lexical/semántica',status:'available',limitation:'Puede haber recuerdos ausentes, desactualizados o contradictorios; deben conservar fuente y prioridad.'},
  {id:'files',title:'Archivos privados y evidencia',component:'R2 + D1',evidence:'rutas autenticadas de files y work-evidence',status:'available',limitation:'Solo accede a objetos registrados para el propietario y a integraciones expresamente conectadas.'},
  {id:'routing',title:'Router adaptativo de modelos',component:'OpenAI + Workers AI',evidence:'worker/lib/openai.ts, providers.ts y provider-quality.ts',status:'available',limitation:'Los proveedores externos pueden fallar, cambiar o aplicar límites y salvaguardas.'},
  {id:'work',title:'Trabajos persistentes',component:'D1 + cron de Cloudflare',evidence:'work_jobs, work_events, leases y reintentos',status:'available',limitation:'El cron tiene resolución aproximada y no equivale a ejecución continua sin interrupciones.'},
  {id:'schedules',title:'Tareas programadas autónomas',component:'scheduled_tasks + Worker scheduled event',evidence:'worker/routes/schedules.ts',status:'available',limitation:'Evita solapamientos y mantiene límites; una tarea puede aplazarse o bloquearse.'},
  {id:'coding',title:'Programación agentiva',component:'GitHub Actions + Codex/runner',evidence:'agent-code-runner.yml, ramas, PRs, tests y callbacks OIDC',status:'conditional',limitation:'Requiere credenciales y workflows disponibles; no fusiona código automáticamente.'},
  {id:'browser',title:'Verificación visual segura',component:'Playwright + GitHub Actions + R2',evidence:'agent-browser.yml, browser_verification_runs y capturas autenticadas',status:'conditional',limitation:'Solo navega destinos HTTPS públicos y bloquea redes privadas, redirecciones y recursos inseguros.'},
  {id:'pwa',title:'Fábrica PWA',component:'skill pwa-builder + GitHub runner',evidence:'manifest, service worker, offline, safe areas y contrato PWA',status:'conditional',limitation:'La instalación nativa depende de capacidades del navegador y del sistema operativo.'},
  {id:'self-eval',title:'Autoevaluación reproducible',component:'suite de checks + D1',evidence:'self_evaluations e improvement_prompts',status:'available',limitation:'Evalúa conductas observables; no mide una inteligencia general absoluta.'},
  {id:'quality',title:'Control de calidad y fallback',component:'provider_quality_events + circuit breaker',evidence:'evaluación determinista de respuestas y salud del proveedor',status:'available',limitation:'Los graders heurísticos no garantizan verdad factual; la evidencia externa sigue siendo necesaria.'}
];

export const KNOWLEDGE_ENTRIES:KnowledgeEntry[]=[
  {
    id:'hector-os-self',domain:'self',title:'Qué es Héctor OS',
    summary:'Héctor OS es el sistema completo, no el modelo de lenguaje: interfaz PWA, Worker, D1, R2, memoria, router, agentes, pruebas, workflows y proveedores conectados.',
    facts:[
      'Su misión es convertir la intención de Héctor en resultados útiles, ejecutables, persistentes y verificables.',
      'Los modelos OpenAI o Cloudflare son motores reemplazables; identidad, memoria, permisos, herramientas y continuidad pertenecen a Héctor OS.',
      'Debe distinguir siempre capacidad disponible, capacidad condicional, limitación arquitectónica y acción realmente ejecutada.',
      'No puede afirmar que una herramienta, integración, despliegue o dato está disponible sin evidencia observable.'
    ],
    triggers:['hector os','quien eres','quién eres','tu arquitectura','tus capacidades','autoconocimiento','inteligencia'],
    sources:['repository:Hector35/Hector-IA'],verifiedAt:KNOWLEDGE_VERIFIED_AT,refreshDays:null
  },
  {
    id:'owner',domain:'owner',title:'Perfil operativo de Héctor',
    summary:'Héctor es el propietario y diseñador de Héctor OS; prefiere tratamiento técnico, continuidad, autonomía alta con controles y una experiencia privada optimizada para iPhone.',
    facts:[...OWNER_CORE_PROFILE.workingStyle,OWNER_CORE_PROFILE.privacyRule],
    triggers:['sobre mi','sobre mí','hector','héctor','mi perfil','mis preferencias','propietario'],
    sources:['private:D1 memories','conversation-explicit'],verifiedAt:KNOWLEDGE_VERIFIED_AT,refreshDays:null
  },
  {
    id:'openai',domain:'openai',title:'OpenAI y la API',
    summary:'OpenAI provee modelos y herramientas mediante productos como ChatGPT, Work, Codex y la API; Héctor OS consume la Responses API como proveedor externo, pero conserva su propia identidad y memoria.',
    facts:[
      'La Responses API es la ruta recomendada para razonamiento, herramientas y flujos multi-turno.',
      'Los modelos y productos cambian; para disponibilidad, precios, límites o versiones se deben consultar únicamente fuentes oficiales actuales.',
      'Las salvaguardas y límites del proveedor siguen aplicando aunque Héctor OS tenga autonomía propia.'
    ],
    triggers:['openai','responses api','api de openai','chatgpt','modelo externo'],
    sources:['https://developers.openai.com/api/docs/models','https://developers.openai.com/api/docs/guides/latest-model'],verifiedAt:KNOWLEDGE_VERIFIED_AT,refreshDays:14
  },
  {
    id:'work',domain:'work',title:'ChatGPT Work',
    summary:'Work es el agente de ChatGPT para trabajos largos, de varios pasos y entregables terminados; se diferencia de Chat conversacional y de Codex especializado en software.',
    facts:[
      'Work puede investigar, analizar y crear documentos, hojas, presentaciones, informes o sitios.',
      'En web y móvil se ejecuta en la nube; puede trabajar una vez, programarse o vigilar cambios mediante tareas programadas.',
      'El usuario puede revisar progreso, cambiar dirección y aprobar acciones importantes.',
      'Work no es Héctor OS: es una experiencia de OpenAI que puede servir como referencia o motor de trabajo externo.'
    ],
    triggers:['work','trabajo de chatgpt','chatgpt work','modo trabajo','tareas programadas de chatgpt'],
    sources:['https://help.openai.com/en/articles/20001275/'],verifiedAt:KNOWLEDGE_VERIFIED_AT,refreshDays:14
  },
  {
    id:'codex',domain:'codex',title:'Codex',
    summary:'Codex es el agente de programación de OpenAI para escribir, revisar y entregar código, trabajar con repositorios, ejecutar comandos y pruebas y producir cambios verificables.',
    facts:[
      'Codex está especializado en desarrollo de software; Work cubre trabajo de conocimiento y entregables más generales.',
      'En escritorio puede trabajar con carpetas locales, repositorios, terminales y herramientas de desarrollo.',
      'Su historial es separado del historial de Chat/Work; en móvil puede consultarse acceso remoto compatible.',
      'En Héctor OS, el runner de programación adopta el patrón Codex: inspeccionar, editar, probar, corregir y abrir PR, sin fusión automática.'
    ],
    triggers:['codex','programacion','programación','repositorio','runner de codigo','runner de código'],
    sources:['https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan','https://help.openai.com/en/articles/20001275/'],verifiedAt:KNOWLEDGE_VERIFIED_AT,refreshDays:14
  },
  {
    id:'gpt-5.6',domain:'gpt-5.6',title:'Familia GPT-5.6',
    summary:'GPT-5.6 usa tres niveles: Sol para máxima capacidad, Terra para equilibrio y Luna para costo/velocidad; Héctor OS asigna cada nivel según complejidad y riesgo.',
    facts:[
      'gpt-5.6-sol es el modelo frontier para trabajo profesional complejo; el alias gpt-5.6 apunta a Sol.',
      'gpt-5.6-terra equilibra inteligencia y costo; gpt-5.6-luna prioriza volumen, velocidad y costo.',
      'La familia admite esfuerzos none, low, medium, high, xhigh y max en la Responses API.',
      'Héctor OS debe usar Sol con max para tareas explícitamente de inteligencia máxima, Terra para trabajo balanceado y Luna solo para tareas breves de bajo riesgo.',
      'El modelo tiene conocimiento con fecha de corte y no sustituye la búsqueda actual para hechos cambiantes.'
    ],
    triggers:['gpt-5.6','gpt5.6','sol','terra','luna','inteligencia alta','inteligencia maxima','inteligencia máxima','razonamiento maximo','razonamiento máximo'],
    sources:['https://developers.openai.com/api/docs/models','https://developers.openai.com/api/docs/guides/latest-model','https://help.openai.com/en/articles/20001354-gpt-56-in-chatgpt/'],verifiedAt:KNOWLEDGE_VERIFIED_AT,refreshDays:14
  }
];

function normalize(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}

export function knowledgeNeedsRefresh(entry:KnowledgeEntry,nowMs=Date.now()){
  if(entry.refreshDays===null)return false;
  const verified=Date.parse(`${entry.verifiedAt}T00:00:00Z`);
  return !Number.isFinite(verified)||nowMs-verified>entry.refreshDays*86_400_000;
}

export function selectKnowledge(input:string,limit=4){
  const query=normalize(input);
  const required=new Set(['hector-os-self','owner']);
  const scored=KNOWLEDGE_ENTRIES.map(entry=>({entry,score:entry.triggers.reduce((score,trigger)=>score+(query.includes(normalize(trigger))?1:0),0)}))
    .filter(x=>x.score>0&&!required.has(x.entry.id)).sort((a,b)=>b.score-a.score).slice(0,Math.max(0,limit));
  return [...KNOWLEDGE_ENTRIES.filter(x=>required.has(x.id)),...scored.map(x=>x.entry)];
}

export function renderKnowledge(input:string){
  return selectKnowledge(input).map(entry=>{
    const freshness=knowledgeNeedsRefresh(entry)?'REQUIERE REVALIDACIÓN ACTUAL EN FUENTE OFICIAL':'verificado';
    return [`CONOCIMIENTO ${entry.domain.toUpperCase()}: ${entry.title}`,entry.summary,...entry.facts.map(x=>`- ${x}`),`Estado: ${freshness} el ${entry.verifiedAt}. Fuentes: ${entry.sources.join(', ')}`].join('\n');
  }).join('\n\n');
}

export function publicSelfModel(modelConfig:{fast:string;balanced:string;reasoning:string}){
  return{
    identity:{name:'Héctor OS',owner:OWNER_CORE_PROFILE.preferredName,mission:OWNER_CORE_PROFILE.primaryProject,knowledgeVersion:KNOWLEDGE_VERSION,verifiedAt:KNOWLEDGE_VERIFIED_AT},
    owner:OWNER_CORE_PROFILE,
    architecture:['React/Vite PWA','Cloudflare Worker/Hono','D1','R2','OpenAI Responses API','Cloudflare Workers AI','GitHub Actions'],
    models:{...modelConfig,policy:{fast:'GPT-5.6 Luna o proveedor local sano para tareas simples',balanced:'GPT-5.6 Terra',reasoning:'GPT-5.6 Sol con xhigh o max'}},
    capabilities:HECTOR_OS_CAPABILITIES,
    knowledge:KNOWLEDGE_ENTRIES.map(({id,domain,title,summary,verifiedAt,refreshDays,sources})=>({id,domain,title,summary,verifiedAt,refreshDays,sources})),
    limitations:[
      'No posee ni modifica los pesos de los modelos externos.',
      'No tiene acceso a servicios, dispositivos o cuentas que no estén conectados y autorizados.',
      'No fusiona ni despliega cambios de código automáticamente.',
      'Los hechos actuales sobre OpenAI deben revalidarse en fuentes oficiales cuando superan su ventana de frescura.',
      'Los datos sensibles del propietario se recuperan por relevancia y no se inyectan completos en cada solicitud.'
    ]
  };
}
