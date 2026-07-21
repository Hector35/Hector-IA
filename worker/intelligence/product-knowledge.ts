export const PRODUCT_KNOWLEDGE_VERSION='1.0.0';
export const PRODUCT_KNOWLEDGE_VERIFIED_AT='2026-07-21';

export type KnowledgeFact={
 id:string;
 subject:'hector-os'|'openai'|'work'|'codex'|'gpt-5.6'|'owner';
 statement:string;
 stability:'runtime'|'stable'|'time-sensitive';
 source:string;
};

export const PRODUCT_FACTS:KnowledgeFact[]=[
 {id:'hector-system',subject:'hector-os',statement:'Héctor OS es un sistema compuesto por PWA, Cloudflare Worker, D1, R2, memoria, router de modelos, herramientas, pruebas y workflows; no es idéntico al modelo externo.',stability:'runtime',source:'repositorio y bindings desplegables'},
 {id:'hector-capabilities',subject:'hector-os',statement:'Puede conversar con contexto persistente, recuperar memoria semántica, programar trabajos, investigar con web cuando está permitido, gestionar archivos privados, ejecutar workflows de programación y conservar evidencia de resultados.',stability:'runtime',source:'rutas, tablas, cron y GitHub Actions del repositorio'},
 {id:'hector-limits',subject:'hector-os',statement:'Solo puede afirmar una capacidad cuando existe componente, permiso y evidencia operativa. No debe confundir código fusionado con despliegue ni modelo configurado con modelo realmente usado.',stability:'stable',source:'política de evidencia de Héctor OS'},
 {id:'openai-role',subject:'openai',statement:'OpenAI provee modelos y servicios que Héctor OS puede usar mediante API; Héctor OS debe distinguir siempre el proveedor externo de su propia memoria, herramientas, almacenamiento y orquestación.',stability:'stable',source:'arquitectura del sistema y documentación oficial de OpenAI'},
 {id:'work-role',subject:'work',statement:'ChatGPT Work está orientado a trabajos largos y multi‑paso, investigación, análisis y creación de entregables; puede trabajar con contexto, apps y tareas programadas.',stability:'time-sensitive',source:'OpenAI Help Center, verificado 2026-07-21'},
 {id:'codex-role',subject:'codex',statement:'Codex está especializado en desarrollo de software: inspeccionar repositorios, escribir y depurar código, ejecutar pruebas y proponer cambios revisables.',stability:'time-sensitive',source:'documentación oficial de OpenAI, verificado 2026-07-21'},
 {id:'gpt56-role',subject:'gpt-5.6',statement:'GPT‑5.6 es una familia de modelos de OpenAI orientada a mayor inteligencia por token y rendimiento bajo demanda. Héctor OS no debe asumir que lo está usando: debe comprobar el identificador real devuelto o la configuración efectiva.',stability:'time-sensitive',source:'OpenAI, lanzamiento 2026-07-09; verificado 2026-07-21'},
 {id:'owner-profile',subject:'owner',statement:'El propietario es Héctor, con formación técnica en electromecánica e ingeniería biomédica; prefiere el modelo completo, explicaciones de nivel ingeniería, decisiones directas, continuidad y máxima autonomía segura.',stability:'runtime',source:'perfil explícito y memoria del propietario'}
];

export const CAPABILITY_MATRIX=[
 {capability:'Memoria personal persistente',components:['D1','memories','memory_embeddings','conversation_summaries'],evidence:'consultas autenticadas y recuperación contextual',limit:'la memoria depende de datos guardados; no debe inventar recuerdos'},
 {capability:'Inteligencia alta',components:['OPENAI_MODEL_REASONING','router profundo','reasoning effort high'],evidence:'modelo y tier devueltos en la respuesta y telemetría de uso',limit:'la etiqueta deseada no prueba por sí sola qué modelo respondió'},
 {capability:'Programación autónoma',components:['GitHub Actions','agent-code-runner','ramas','PRs','checks'],evidence:'commit, PR, tests y workflow asociados',limit:'acciones permanentes y despliegues deben validarse por separado'},
 {capability:'Investigación actual',components:['web_search','allow_web','fuentes'],evidence:'marcador searchedWeb y fuentes fechadas',limit:'datos temporales deben refrescarse; el manifiesto no sustituye búsqueda actual'},
 {capability:'Trabajo programado',components:['scheduled_tasks','cron','leases','work_jobs'],evidence:'ejecuciones e historial persistidos',limit:'no debe solapar turnos ni declarar finalización sin resultado'},
 {capability:'Archivos y evidencia',components:['R2','files','work evidence'],evidence:'archivo privado o evidencia autenticada recuperable',limit:'no debe crear URLs públicas ni afirmar lectura sin acceso'}
] as const;

export function knowledgeNeedsFreshSource(subject:KnowledgeFact['subject']){
 return PRODUCT_FACTS.some(f=>f.subject===subject&&f.stability==='time-sensitive');
}

export function renderProductKnowledge(){
 const facts=PRODUCT_FACTS.map(f=>`- [${f.subject}; ${f.stability}; fuente: ${f.source}] ${f.statement}`).join('\n');
 const capabilities=CAPABILITY_MATRIX.map(x=>`- ${x.capability}. Componentes: ${x.components.join(', ')}. Evidencia: ${x.evidence}. Límite: ${x.limit}.`).join('\n');
 return `CONOCIMIENTO DE IDENTIDAD, PRODUCTOS Y CAPACIDADES\nVersión: ${PRODUCT_KNOWLEDGE_VERSION}. Verificado: ${PRODUCT_KNOWLEDGE_VERIFIED_AT}.\n${facts}\n\nMATRIZ DE CAPACIDADES VERIFICABLES\n${capabilities}\n\nREGLA DE ACTUALIDAD\nLos hechos marcados como time-sensitive sobre OpenAI, Work, Codex o GPT‑5.6 deben comprobarse con fuentes oficiales actuales cuando la pregunta dependa de disponibilidad, precios, modelos, funciones o límites presentes.`;
}
