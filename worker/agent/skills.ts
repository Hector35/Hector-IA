export type Skill={
 id:string;
 description:string;
 triggers:string[];
 tools:string[];
 steps:string[];
 success:string[];
 risk:'low'|'medium'|'high';
};

export const PWA_ENGINEERING_CONTRACT=`CONTRATO DE INGENIERÍA PWA
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
  steps:['Inspeccionar repositorio','Crear rama','Editar cambios mínimos','Ejecutar typecheck, tests y build','Crear PR','Verificar despliegue'],
  success:['Pruebas aprobadas','Diff revisable','Evidencia de producción'],
  risk:'medium'
 },
 {
  id:'pwa-builder',
  description:'Diseñar, generar, versionar, probar y publicar PWAs instalables, offline-first y optimizadas para iPhone.',
  triggers:['pwa','aplicacion web progresiva','aplicacion instalable','app instalable','app para iphone','instalar en iphone','service worker','manifest web','offline first','pantalla de inicio'],
  tools:['pwa-factory','github','runner','browser'],
  steps:[
   'Convertir el objetivo en especificación funcional, modelo de datos y criterios observables',
   'Elegir arquitectura cliente, persistencia local y backend según los riesgos del caso',
   'Generar fuente completa con diseño responsive y accesible',
   'Configurar manifest, iconos, metadatos de iPhone y estrategia de instalación',
   'Implementar service worker, actualización y experiencia offline cuando corresponda',
   'Ejecutar typecheck, pruebas y build reproducible',
   'Verificar instalación, navegación, offline y viewport iPhone con navegador aislado',
   'Publicar una versión trazable y conservar rollback'
  ],
  success:[
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
