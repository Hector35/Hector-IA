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
- Fuentes compartidas: config/pwa-registry.json, Context Hub, main/PRs abiertos y GitHub issue #958 (Shared Context Ledger).
- Las únicas PWAs instalables canónicas son Héctor OS en /, Héctor Agent en /agent/ y Pendientes en /turno-rx/, salvo autorización explícita de Héctor para crear otra PWA.
- Héctor OS posee la UI general, chat, herramientas compartidas y superficies de Bridge/Context.
- Héctor Agent posee objetivos, jobs autónomos, aprobaciones, actividad y controles del agente.
- Pendientes es la PWA clínica; no modifiques public/turno-rx/ para trabajo ajeno a Pendientes.
- /bridge.html y /bridge-core.html pertenecen al mismo Héctor Bridge. Context Hub es infraestructura compartida y no otra PWA.
- Antes de crear una app, página de nivel superior, manifest o service worker, consulta el contexto compartido y el trabajo concurrente para evitar duplicación accidental.
- Reutiliza una superficie existente cuando el objetivo quepa en ella. Autorizar una función o corrección NO autoriza una nueva PWA.
- Una nueva PWA instalable requiere autorización explícita del usuario, registro actualizado, scope único y razón documentada.
- Los claims de Cross-Chat Sync son señales consultivas, no locks; no confundas coordinación no bloqueante con permiso para cambiar el conjunto de PWAs.
- No dupliques una capacidad ya construida solo por falta de contexto; compara, integra o reemplaza según evidencia.
- Nunca solapes scopes de service worker ni propiedad de caches entre PWAs.`;

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
  steps:['Reconstruir contexto compartido y revisar trabajo concurrente','Consultar gobernanza canónica antes de crear UI nueva','Crear rama','Editar cambios mínimos','Ejecutar typecheck, tests y build','Crear PR','Verificar despliegue','Publicar un handoff al contexto compartido'],
  success:['Pruebas aprobadas','Diff revisable','Sin superficies instalables no autorizadas','Evidencia de producción','Handoff compartido'],
  risk:'medium'
 },
 {
  id:'pwa-builder',
  description:'Diseñar, extender, generar, versionar, probar y publicar PWAs instalables respetando el registro canónico.',
  triggers:['pwa','aplicacion web progresiva','aplicacion instalable','app instalable','app para iphone','instalar en iphone','service worker','manifest web','offline first','pantalla de inicio'],
  tools:['pwa-factory','github','runner','browser'],
  steps:[
   'Consultar contexto compartido, registro y trabajo concurrente antes de decidir la arquitectura',
   'Identificar primero cuál de las tres PWAs canónicas es propietaria del objetivo',
   'Solo considerar una nueva PWA instalable si existe autorización explícita del usuario para crear otra PWA',
   'Convertir el objetivo en especificación funcional, modelo de datos y criterios observables',
   'Elegir arquitectura cliente, persistencia local y backend según los riesgos del caso',
   'Generar fuente completa con diseño responsive y accesible',
   'Configurar manifest, iconos, metadatos de iPhone y estrategia de instalación sin solapar scopes',
   'Implementar service worker, actualización y experiencia offline cuando corresponda',
   'Ejecutar typecheck, pruebas y build reproducible',
   'Verificar instalación, navegación, offline y viewport iPhone con navegador aislado',
   'Actualizar el registro si una nueva PWA fue explícitamente autorizada y publicar handoff compartido',
   'Publicar una versión trazable y conservar rollback'
  ],
  success:[
   'Propietario canónico identificado',
   'Nueva PWA ausente salvo autorización explícita documentada',
   'Fuente completa y versionada',
   'Manifest e instalación validados',
   'Política offline comprobada o explícitamente deshabilitada',
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
  steps:['Abrir entorno aislado','Navegar a URL','Comprobar elementos y errores','Guardar evidencia'],
  success:['Página cargada','Criterios visibles verificados'],
  risk:'low'
 },
 {
  id:'database',
  description:'Inspeccionar y modificar datos estructurados.',
  triggers:['base de datos','d1','sql','tabla','registro'],
  tools:['d1'],
  steps:['Identificar esquema','Consultar antes de escribir','Aplicar mutación mínima','Releer y verificar'],
  success:['Estado final comprobado'],
  risk:'high'
 },
 {
  id:'cloudflare',
  description:'Desplegar o auditar Cloudflare Workers y recursos.',
  triggers:['cloudflare','worker','d1','r2','deploy','despliegue'],
  tools:['cloudflare'],
  steps:['Inspeccionar configuración','Validar secretos y bindings','Ejecutar despliegue','Smoke test'],
  success:['Despliegue saludable','Rollback conocido'],
  risk:'high'
 }
];

export function normalizeSkillText(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
export function selectSkills(prompt:string){const p=normalizeSkillText(prompt);return SKILLS.filter(s=>s.triggers.some(t=>p.includes(normalizeSkillText(t)))).slice(0,4);}
export function renderSkills(skills:Skill[]){return skills.map(s=>`SKILL ${s.id}\nObjetivo: ${s.description}\nPasos: ${s.steps.map((x,i)=>`${i+1}. ${x}`).join(' ')}\nÉxito: ${s.success.join('; ')}\nRiesgo: ${s.risk}`).join('\n\n');}
