export type Skill={
 id:string;
 description:string;
 triggers:string[];
 tools:string[];
 steps:string[];
 success:string[];
 risk:'low'|'medium'|'high';
};

export const SURFACE_GOVERNANCE_CONTRACT=`COORDINACIÓN CANÓNICA DE SUPERFICIES
- Fuentes compartidas: config/pwa-registry.json, Context Hub, Context Sync, main/PRs abiertos y GitHub issue #958.
- El estado actual tiene Héctor OS en /, Héctor Agent en /agent/ y Pendientes en /turno-rx/; el registro describe arquitectura actual y también la frontera explícita de autorización para ampliar el conjunto de PWAs instalables.
- Héctor OS posee UI general, chat, herramientas compartidas y superficies Bridge/Context.
- Héctor Agent posee objetivos, jobs autónomos, actividad y controles del agente.
- Pendientes es la PWA clínica; no modifiques public/turno-rx/ para trabajo ajeno a Pendientes.
- /bridge.html, /bridge-core.html, /api/hector-bridge, Context Hub y /mcp pertenecen a la misma capa compartida; no los conviertas en PWAs paralelas por falta de contexto.
- Antes de crear o dividir una superficie, consulta contexto compartido y trabajo concurrente para evitar duplicación accidental.
- Reutiliza una superficie cuando sea la solución más simple y limpia; refactoriza o reemplaza internamente cuando la evidencia técnica muestre una ventaja real.
- Los claims de Context Sync son señales consultivas, no locks; no deben bloquear trabajo autorizado.
- Hay exactamente tres PWAs instalables canónicas salvo autorización explícita de Héctor para otra.
- Autorizar una función o corrección NO autoriza una nueva PWA.
- Una nueva PWA instalable exige approvedNewPwa=true y approvalReason no vacío que documenten esa autorización explícita.
- Si creas una nueva PWA instalable autorizada, actualiza el registro y usa scope/service worker/cache únicos.
- Nunca solapes scopes de service worker ni propiedad de caches entre PWAs.`;

export const CAPABILITY_STACK_CONTRACT=`STACK DE CAPACIDADES COMPARTIDAS
- Contexto: /api/context-sync + /api/context-hub; bootstrap antes de trabajo sustancial y commit al terminar hitos.
- Puente directo: /mcp para clientes MCP y /api/hector-bridge para llamadas autenticadas.
- Broker: /api/hector-bridge/capabilities; lista rutas, ejecuta fallback y conserva trazas.
- Credenciales: /api/hector-bridge/access; nunca expongas material secreto en respuestas, logs, prompts o código.
- Memoria mutable: /api/hector-bridge/memory/upsert; supersede estado/preferencias/decisiones obsoletas en vez de acumular contradicciones activas.
- Fallback solo resuelve fallos técnicos, rate limits, credenciales renovables o ausencia de una ruta. No uses fallback para saltar controles externos de autorización/seguridad/política.
- Un fallo de una capacidad no debe congelar trabajo independiente.
- Ejecutado != verificado: conserva evidencia, trazas y resultado observable antes de declarar éxito.`;

export const PWA_ENGINEERING_CONTRACT=`CONTRATO DE INGENIERÍA PWA
${SURFACE_GOVERNANCE_CONTRACT}
- Convierte el objetivo en casos de uso, datos, pantallas, estados y criterios de aceptación antes de generar código.
- Entrega una aplicación completa y ejecutable, no solo HTML de demostración ni una explicación.
- Mantén manifest.webmanifest coherente: name, short_name, id, start_url, scope, display, theme_color, background_color e iconos.
- Registra el service worker únicamente cuando la especificación habilite modo offline; define estrategia de caché, actualización y recuperación ante fallos.
- Optimiza para iPhone/PWA: viewport-fit=cover, safe-area-inset, controles táctiles, teclado adecuado y metadatos Apple.
- Usa persistencia local cuando el caso de uso lo requiera y separa datos, interfaz y lógica para permitir evolución posterior.
- No incrustes secretos en el cliente. Todo privilegio, API privada o escritura sensible debe quedar en backend autenticado.
- Ejecuta typecheck, pruebas y build; corrige fallos antes de afirmar que la PWA está terminada.
- Verifica instalabilidad, navegación, estado offline, accesibilidad básica y viewport 390x844 mediante evidencia independiente.
- Publica una versión trazable y conserva rollback. Propuesto no significa construido; construido no significa verificado.`;

export const SKILLS:Skill[]=[
 {
  id:'research-web',
  description:'Investigar información actual con fuentes y evidencia.',
  triggers:['investiga','busca','actual','noticias','compara'],
  tools:['web'],
  steps:['Definir la pregunta verificable','Buscar fuentes actuales','Contrastar fuentes','Separar hechos e inferencias','Entregar citas y fecha'],
  success:['Fuentes identificadas','Contradicciones explicadas'],
  risk:'low'
 },
 {
  id:'github-code',
  description:'Modificar código con rama, pruebas y PR.',
  triggers:['github','codigo','bug','repositorio','programa','corrige'],
  tools:['github','runner'],
  steps:['Reconstruir contexto compartido y revisar trabajo concurrente','Elegir si conviene reutilizar, integrar o reemplazar','Crear rama','Editar cambios mínimos','Ejecutar typecheck, tests y build','Crear PR','Verificar despliegue','Publicar handoff compartido'],
  success:['Pruebas aprobadas','Diff revisable','Arquitectura coherente','Evidencia de producción','Handoff compartido'],
  risk:'medium'
 },
 {
  id:'capability-routing',
  description:'Resolver una acción mediante Tool Broker, credenciales, fallback y trazas sin bloquear el objetivo completo.',
  triggers:['bridge','mcp','herramienta','tool','api','credencial','oauth','fallback','router','capacidad','acceso'],
  tools:['context-hub','hector-bridge','credential-broker','capability-router'],
  steps:['Bootstrap de contexto','Descubrir capacidades existentes','Elegir la ruta preferida','Resolver credencial sin exponer secretos','Ejecutar','Clasificar fallo y probar fallback técnico si corresponde','Registrar traza/evidencia','Publicar handoff si cambió estado durable'],
  success:['Ruta seleccionada con evidencia','Secretos no expuestos','Fallback técnico trazable','Trabajo independiente no bloqueado'],
  risk:'medium'
 },
 {
  id:'pwa-builder',
  description:'Diseñar, extender, generar, versionar, probar y publicar PWAs instalables respetando coordinación consultiva y autorización explícita para nuevas PWAs.',
  triggers:['pwa','aplicacion web progresiva','aplicacion instalable','app instalable','app para iphone','instalar en iphone','service worker','manifest web','offline first','pantalla de inicio'],
  tools:['pwa-factory','github','runner','browser'],
  steps:[
   'Consultar contexto compartido, registro y trabajo concurrente antes de decidir arquitectura',
   'Comparar extensión de una PWA actual frente a una superficie nueva por simplicidad, aislamiento y valor',
   'No crear una nueva PWA instalable sin autorización explícita; autorizar una función o corrección no basta',
   'Convertir el objetivo en especificación funcional, modelo de datos y criterios observables',
   'Generar fuente completa con diseño responsive y accesible',
   'Configurar manifest, iconos, metadatos de iPhone y scopes sin solapamiento',
   'Implementar service worker con limpieza limitada a su propia familia de cache',
   'Ejecutar typecheck, pruebas y build reproducible',
   'Verificar instalación, navegación, offline y viewport iPhone con evidencia',
   'Actualizar el registro si cambió la arquitectura autorizada y publicar handoff',
   'Publicar una versión trazable y conservar rollback'
  ],
  success:[
   'Decisión arquitectónica informada',
   'Sin duplicación accidental ni creación no autorizada de otra PWA',
   'Fuente completa y versionada',
   'Manifest e instalación validados',
   'Service worker aislado',
   'Typecheck, pruebas y build aprobados',
   'Interfaz usable en 390x844 y safe areas',
   'Contexto compartido actualizado',
   'Evidencia de navegador y rollback disponibles'
  ],
  risk:'medium'
 },
 {
  id:'browser-verify',
  description:'Abrir una URL conocida y verificar interfaz o contenido.',
  triggers:['abre','pagina','url','interfaz','produccion','captura'],
  tools:['browser'],
  steps:['Validar URL permitida','Abrir con navegador aislado','Esperar carga','Capturar evidencia','Reportar errores visibles'],
  success:['HTTP correcto','Captura o reporte generado'],
  risk:'low'
 },
 {
  id:'memory-curation',
  description:'Guardar, actualizar, superseder o invalidar memoria estructurada.',
  triggers:['recuerda','olvida','preferencia','memoria','contexto'],
  tools:['context-hub','hector-memory'],
  steps:['Clasificar dato','Determinar sujeto, vigencia y confianza','Detectar versiones previas','Superseder estado mutable obsoleto o anexar hechos históricos','Verificar que retrieval no devuelva versiones supersedidas'],
  success:['Memoria trazable','Una sola versión activa para estado mutable','Historial conservado'],
  risk:'medium'
 },
 {
  id:'self-analysis',
  description:'Autoevaluar capacidades, fallos y siguiente mejora.',
  triggers:['autoanaliza','limitaciones','que falta','mejorate','problemas'],
  tools:['evals','d1','capability-traces'],
  steps:['Ejecutar pruebas','Leer errores y trazas recientes','Agrupar fallos repetidos','Priorizar por impacto','Convertir regresiones reales en evals'],
  success:['Puntuación reproducible','Problemas concretos','Regresiones cubiertas'],
  risk:'low'
 }
];

function normalize(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}

export function selectSkills(input:string,limit=4){
 const q=normalize(input);
 return SKILLS
  .map(skill=>({skill,score:skill.triggers.reduce((n,trigger)=>n+(q.includes(normalize(trigger))?1:0),0)}))
  .filter(item=>item.score>0)
  .sort((a,b)=>b.score-a.score)
  .slice(0,limit)
  .map(item=>item.skill);
}

export function renderSkills(skills:Skill[]){return skills.map(skill=>`SKILL ${skill.id}\nObjetivo: ${skill.description}\nHerramientas: ${skill.tools.join(', ')}\nPasos:\n${skill.steps.map((step,index)=>`${index+1}. ${step}`).join('\n')}\nÉxito:\n${skill.success.map(item=>`- ${item}`).join('\n')}\nRiesgo: ${skill.risk}`).join('\n\n');}
