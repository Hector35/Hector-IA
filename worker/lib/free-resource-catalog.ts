export type FreeCapability=
 |'routing'
 |'classification'
 |'extraction'
 |'planning'
 |'verification'
 |'retrieval'
 |'embedding'
 |'reranking'
 |'generation'
 |'cache'
 |'storage'
 |'orchestration'
 |'code-validation'
 |'browser-automation';

export type FreeResourceId=
 |'deterministic-rules'
 |'d1-hybrid-retrieval'
 |'workers-cache'
 |'browser-wasm-inference'
 |'browser-webgpu-inference'
 |'workers-ai-embeddings'
 |'vectorize-semantic-index'
 |'workers-ai-reranker'
 |'workers-ai-fast-generation'
 |'github-actions-public-runner'
 |'r2-object-storage'
 |'cloudflare-queues'
 |'cloudflare-browser-rendering';

export type FreeIntegrationState='active'|'ready'|'candidate';
export type FreeCostClass='zero'|'free-tier';
export type FreeExecutionLocation='worker'|'browser'|'cloudflare-service'|'github-runner';

export type FreeResourceAvailability={
 d1?:boolean;
 r2?:boolean;
 workersAi?:boolean;
 vectorize?:boolean;
 browserWasm?:boolean;
 browserWebGpu?:boolean;
 githubPublicRunners?:boolean;
 queues?:boolean;
 browserRendering?:boolean;
};

export type FreeResource={
 id:FreeResourceId;
 name:string;
 priority:number;
 capabilities:FreeCapability[];
 cost:FreeCostClass;
 location:FreeExecutionLocation;
 integration:FreeIntegrationState;
 privacy:'local'|'account'|'repository';
 requires:(keyof FreeResourceAvailability)[];
 limits:string;
 license:string;
 selectedModel?:string;
 reason:string;
};

export const FREE_FIRST_MODELS={
 generation:'@cf/zai-org/glm-4.7-flash',
 embedding:'@cf/google/embeddinggemma-300m',
 reranker:'@cf/baai/bge-reranker-base'
} as const;

export const WORKERS_AI_MODELS_REJECTED_AS_DEFAULT=[
 '@cf/meta/llama-3.1-8b-instruct',
 '@hf/meta-llama/meta-llama-3-8b-instruct',
 '@cf/meta/llama-3-8b-instruct'
] as const;

export const FREE_RESOURCE_CATALOG:readonly FreeResource[]=[
 {id:'deterministic-rules',name:'Reglas, Zod y verificadores deterministas',priority:0,capabilities:['routing','classification','extraction','planning','verification'],cost:'zero',location:'worker',integration:'active',privacy:'local',requires:[],limits:'Limitado a patrones y criterios explícitos; debe escalar cuando la confianza sea insuficiente.',license:'Código propio + dependencias ya instaladas',reason:'Evita inferencia para trabajo conocido y produce evidencia objetiva.'},
 {id:'d1-hybrid-retrieval',name:'D1 indexado + similitud léxica',priority:10,capabilities:['retrieval','cache','storage'],cost:'free-tier',location:'cloudflare-service',integration:'active',privacy:'account',requires:['d1'],limits:'Workers Free: 5 millones de filas leídas/día, 100 mil escritas/día y 5 GB totales.',license:'Servicio Cloudflare',reason:'Es la primera recuperación porque ya está enlazado, tiene aislamiento por usuario y no consume neuronas.'},
 {id:'workers-cache',name:'Cloudflare Workers Cache API',priority:15,capabilities:['cache','retrieval'],cost:'zero',location:'cloudflare-service',integration:'ready',privacy:'account',requires:[],limits:'En Free comparte hasta 50 llamadas Cache API/subrequests por solicitud; no usar para datos privados sin claves por usuario.',license:'Servicio Cloudflare',reason:'Permite cachear resultados públicos, modelos y respuestas idempotentes antes de consultar D1 o IA.'},
 {id:'browser-wasm-inference',name:'ONNX Runtime Web / Transformers.js sobre WASM',priority:20,capabilities:['classification','extraction','embedding'],cost:'zero',location:'browser',integration:'candidate',privacy:'local',requires:['browserWasm'],limits:'Requiere descargar y cachear modelos cuantizados; memoria y batería del iPhone son el límite práctico.',license:'MIT (ONNX Runtime) / Apache-2.0 (Transformers.js); verificar además la licencia de cada modelo',reason:'Es el respaldo universal para inferencia privada y offline sin llamadas de red.'},
 {id:'browser-webgpu-inference',name:'ONNX Runtime Web / Transformers.js sobre WebGPU',priority:21,capabilities:['classification','extraction','embedding','generation'],cost:'zero',location:'browser',integration:'candidate',privacy:'local',requires:['browserWebGpu'],limits:'Safari 26+; usar detección de capacidad, modelos pequeños cuantizados y fallback WASM.',license:'MIT (ONNX Runtime) / Apache-2.0 (Transformers.js); verificar además la licencia de cada modelo',reason:'Descarga clasificación, embeddings y generación pequeña al GPU del iPhone.'},
 {id:'workers-ai-embeddings',name:'Workers AI EmbeddingGemma 300M',priority:30,capabilities:['embedding','classification','retrieval'],cost:'free-tier',location:'cloudflare-service',integration:'ready',privacy:'account',requires:['workersAi'],limits:'Comparte la asignación de 10,000 neuronas/día; 768 dimensiones y 512 tokens por entrada.',license:'Servicio Cloudflare; términos de EmbeddingGemma',selectedModel:FREE_FIRST_MODELS.embedding,reason:'Modelo multilingüe de 100+ idiomas apropiado para los objetivos en español de Héctor OS.'},
 {id:'vectorize-semantic-index',name:'Cloudflare Vectorize',priority:35,capabilities:['retrieval','cache','embedding'],cost:'free-tier',location:'cloudflare-service',integration:'candidate',privacy:'account',requires:['vectorize'],limits:'Free: 30 millones de dimensiones consultadas/mes y 5 millones almacenadas; máximo 1,536 dimensiones/vector.',license:'Servicio Cloudflare',reason:'Se añade después del filtro léxico para no gastar dimensiones en consultas que D1 resuelve solo.'},
 {id:'workers-ai-reranker',name:'Workers AI BGE reranker base',priority:40,capabilities:['reranking','retrieval','verification'],cost:'free-tier',location:'cloudflare-service',integration:'ready',privacy:'account',requires:['workersAi'],limits:'Comparte neuronas diarias; ejecutar únicamente sobre un conjunto pequeño prefiltrado.',license:'Servicio Cloudflare; términos del modelo BAAI',selectedModel:FREE_FIRST_MODELS.reranker,reason:'Mejora precisión del RAG sin generar texto y evita enviar contexto irrelevante al modelo avanzado.'},
 {id:'workers-ai-fast-generation',name:'Workers AI GLM 4.7 Flash',priority:50,capabilities:['routing','classification','extraction','planning','generation'],cost:'free-tier',location:'cloudflare-service',integration:'ready',privacy:'account',requires:['workersAi'],limits:'Comparte 10,000 neuronas/día; 131,072 tokens de contexto, tool calling y salida acotada por presupuesto.',license:'Servicio Cloudflare; términos del modelo Zhipu AI',selectedModel:FREE_FIRST_MODELS.generation,reason:'Cloudflare lo recomienda como modelo rápido multilingüe moderno y evita una llamada avanzada en tareas rutinarias.'},
 {id:'github-actions-public-runner',name:'GitHub Actions estándar para repositorio público',priority:60,capabilities:['code-validation','verification','planning'],cost:'zero',location:'github-runner',integration:'active',privacy:'repository',requires:['githubPublicRunners'],limits:'Los runners estándar son gratuitos e ilimitados en repositorios públicos; artefactos y caché conservan límites.',license:'Servicio GitHub; las acciones usadas deben fijarse por SHA y tener licencia compatible',reason:'Compilación, pruebas, auditorías y generación de artefactos no necesitan una llamada de modelo.'},
 {id:'r2-object-storage',name:'Cloudflare R2 Standard',priority:70,capabilities:['storage','cache','retrieval'],cost:'free-tier',location:'cloudflare-service',integration:'active',privacy:'account',requires:['r2'],limits:'10 GB-mes, 1 millón de operaciones A y 10 millones B al mes sin costo; egreso gratuito.',license:'Servicio Cloudflare',reason:'Almacena modelos ONNX, snapshots, evidencias y artefactos sin inflar D1.'},
 {id:'cloudflare-queues',name:'Cloudflare Queues',priority:75,capabilities:['orchestration','planning','verification'],cost:'free-tier',location:'cloudflare-service',integration:'candidate',privacy:'account',requires:['queues'],limits:'Free: 10,000 operaciones/día y retención máxima de 24 horas.',license:'Servicio Cloudflare',reason:'Desacopla trabajos largos y permite batching sin multiplicar invocaciones ni bloquear el Worker.'},
 {id:'cloudflare-browser-rendering',name:'Cloudflare Browser Rendering',priority:80,capabilities:['browser-automation','verification','extraction'],cost:'free-tier',location:'cloudflare-service',integration:'candidate',privacy:'account',requires:['browserRendering'],limits:'Workers Free: 10 minutos de navegador/día y hasta 3 navegadores concurrentes.',license:'Servicio Cloudflare',reason:'Reservar para páginas que no pueden resolverse con fetch, HTML o APIs; no usar como crawler general.'}
] as const;

function isAvailable(resource:FreeResource,availability:FreeResourceAvailability){
 return resource.requires.every(requirement=>availability[requirement]===true);
}

export function selectFreeResourcePlan(capabilities:readonly FreeCapability[],availability:FreeResourceAvailability={}){
 const requested=new Set(capabilities);
 return FREE_RESOURCE_CATALOG
  .filter(resource=>resource.capabilities.some(capability=>requested.has(capability)))
  .filter(resource=>isAvailable(resource,availability))
  .sort((left,right)=>left.priority-right.priority);
}

export function firstFreeResource(capability:FreeCapability,availability:FreeResourceAvailability={}){
 return selectFreeResourcePlan([capability],availability)[0]??null;
}

export function canAvoidPaidApi(capabilities:readonly FreeCapability[],availability:FreeResourceAvailability={}){
 return capabilities.every(capability=>selectFreeResourcePlan([capability],availability).length>0);
}

export function isRejectedWorkersAiDefault(model:string){
 return(WORKERS_AI_MODELS_REJECTED_AS_DEFAULT as readonly string[]).includes(model);
}
