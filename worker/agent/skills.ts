export type Skill={
 id:string;
 description:string;
 triggers:string[];
 tools:string[];
 steps:string[];
 success:string[];
 risk:'low'|'medium'|'high';
};

export const SURFACE_GOVERNANCE_CONTRACT=`GOBERNANZA CANÓNICA DE SUPERFICIES
- Fuente de verdad: config/pwa-registry.json.
- Solo hay tres PWAs instalables canónicas salvo autorización explícita de Héctor para crear otra: Héctor OS en /, Héctor Agent en /agent/ y Pendientes en /turno-rx/.
- Héctor OS posee la UI general, chat, herramientas compartidas y las superficies de Bridge/Context.
- Héctor Agent posee objetivos, jobs autónomos, aprobaciones, actividad y controles del agente.
- Pendientes es la PWA clínica protegida; no modifiques public/turno-rx/ para trabajo ajeno a Pendientes.
- /bridge.html y /bridge-core.html pertenecen al mismo Héctor Bridge; no son PWAs separadas. /api/hector-bridge es su backend.
- Context Hub es infraestructura compartida de contexto/backend, no otra PWA. Su UI, si existe, pertenece a Héctor OS o Bridge.
- Antes de crear una app, página de nivel superior, manifest o service worker, reutiliza el propietario registrado si el objetivo cabe ahí.
- Autorizar una función o corrección NO equivale a autorizar una nueva PWA. Una nueva PWA requiere permiso explícito para crear una PWA nueva y actualizar el registro en el mismo cambio.
- No dupliques una capacidad que ya esté siendo construida en main u otro PR; inspecciona y reconcilia trabajo concurrente.
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
  steps:['Inspeccionar repositorio y trabajo concurrente','Consultar la gobernanza de superficies antes de crear UI nueva','Crear rama','Editar cambios mínimos','Ejecutar typecheck, tests y build','Crear PR','Verificar despliegue'],
  success:['Pruebas aprobadas','Diff revisable','Sin superficies duplicadas','Evidencia de producción'],
  risk:'medium'
 },
 {
  id:'pwa-builder',
  description:'Diseñar, extender, generar, versionar, probar y publicar PWAs instalables respetando el registro canónico.',
  triggers:['pwa','aplicacion web progresiva','aplicacion instalable','app instalable','app para iphone','instalar en iphone','service worker','manifest web','offline first','pantalla de inicio'],
  tools:['pwa-factory','github','runner','browser'],
  steps:[
   'Consultar config/pwa-registry.json y decidir primero qué PWA existente es propietaria del objetivo',
   'Reutilizar Héctor OS, Héctor Agent o Pendientes cuando corresponda; una nueva PWA requiere autorización explícita',
   'Convertir el objetivo en especificación funcional, modelo de datos y criterios observables',
   'Elegir arquitectura cliente, persistencia local y backend según los riesgos del caso',
   'Generar fuente completa con diseño responsive y accesible',
   'Configurar manifest, iconos, metadatos de iPhone y estrategia de instalación sin solapar scopes',
   'Implementar service worker, actualización y experiencia offline cuando corresponda',
   'Ejecutar typecheck, pruebas y build reproducible',
   'Verificar instalación, navegación, offline y viewport iPhone con navegador aislado',
   'Publicar una versión trazable y conservar rollback'
  ],
  success:[
   'Propietario canónico identificado y sin PWA paralela innecesaria',
   'Fuente completa y versionada',
   'Manifest e instalación validados',
   'Política offline comprobada o explícitamente deshabilitada',
   'Typecheck, pruebas y build aprobados',
   'Interfaz usable en 390x844 y safe areas',
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
  description:'Guardar, actualizar o invalidar memoria estructurada.',
  triggers:['recuerda','olvida','preferencia','memoria'],
  tools:['d1'],
  steps:['Clasificar dato','Determinar vigencia y confianza','Detectar contradicciones','Guardar o invalidar'],
  success:['Memoria trazable','Sin duplicados contradictorios'],
  risk:'medium'
 },
 {
  id:'self-analysis',
  description:'Autoevaluar capacidades, fallos y siguiente mejora.',
  triggers:['autoanaliza','limitaciones','que falta','mejorate','problemas'],
  tools:['evals','d1'],
  steps:['Ejecutar pruebas','Leer errores recientes','Agrupar fallos repetidos','Priorizar por impacto','Generar prompt de mejora'],
  success:['Puntuación reproducible','Problemas concretos'],
  risk:'low'
 }
];

function normalize(value:string){
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

export function selectSkills(input:string,limit=4){
 const q=normalize(input);
 return SKILLS
  .map(skill=>({skill,score:skill.triggers.reduce((n,trigger)=>n+(q.includes(normalize(trigger))?1:0),0)}))
  .filter(item=>item.score>0)
  .sort((a,b)=>b.score-a.score)
  .slice(0,limit)
  .map(item=>item.skill);
}

export function renderSkills(skills:Skill[]){
 return skills.map(skill=>`SKILL ${skill.id}\nObjetivo: ${skill.description}\nHerramientas: ${skill.tools.join(', ')}\nPasos:\n${skill.steps.map((step,index)=>`${index+1}. ${step}`).join('\n')}\nÉxito:\n${skill.success.map(item=>`- ${item}`).join('\n')}\nRiesgo: ${skill.risk}`).join('\n\n');
}
