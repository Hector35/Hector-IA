import {CAPABILITY_STACK_CONTRACT,PWA_ENGINEERING_CONTRACT,SURFACE_GOVERNANCE_CONTRACT,renderSkills,selectSkills} from './skills';

export type AgentPlan={objective:string;skills:string[];phases:{name:string;goal:string;evidence:string[]}[];maxAttempts:number};

export function buildPlan(prompt:string):AgentPlan{
 const selected=selectSkills(prompt);
 return{
  objective:prompt,
  skills:selected.map(skill=>skill.id),
  maxAttempts:3,
  phases:[
   {name:'inspect',goal:'Reconstruir contexto compartido, capacidades disponibles, estado actual y evidencia antes de actuar.',evidence:['fuentes','archivos o estado consultado','trabajo concurrente relevante','decisiones previas relacionadas','rutas/capacidades disponibles']},
   {name:'plan',goal:'Dividir el objetivo en pasos observables y elegir arquitectura/ruta por evidencia, evitando frenos internos artificiales.',evidence:['criterios de aceptación','riesgos y supuestos','ruta preferida y fallbacks','dependencias externas reales']},
   {name:'execute',goal:'Ejecutar la acción mínima suficiente; si una ruta técnica falla, probar una alternativa legítima cuando corresponda.',evidence:['eventos de herramienta','trazas de capacidad','artefactos o cambios']},
   {name:'test',goal:'Comprobar el resultado, clasificar fallos y reparar o cambiar de ruta antes de rendirse.',evidence:['salida de pruebas','errores clasificados','reintentos/fallbacks']},
   {name:'verify',goal:'Confirmar cada criterio con evidencia independiente, guardar aprendizaje útil y publicar handoff compartido.',evidence:['resultado final','evidencia independiente','contexto/memoria actualizados','handoff compartido']}
  ]
 };
}

export function renderAgentContext(prompt:string){
 const skills=selectSkills(prompt);
 const plan=buildPlan(prompt);
 const specialized=plan.skills.includes('pwa-builder')?`\n\n${PWA_ENGINEERING_CONTRACT}`:'';
 return `PROTOCOLO AGENTIVO V4\nObjetivo: ${prompt}\nSkills seleccionadas: ${plan.skills.join(', ')||'general-analysis'}\nMáximo de intentos por estrategia antes de reconsiderarla: ${plan.maxAttempts}\n\n${SURFACE_GOVERNANCE_CONTRACT}\n\n${CAPABILITY_STACK_CONTRACT}\n\n${renderSkills(skills)}${specialized}\n\nREGLAS\n- Reconstruye contexto desde config/shared-decisions.json, main, PRs, Context Hub, Context Sync y el Shared Context Ledger antes de crear una implementación paralela.\n- Si fuentes de contexto discrepan, prioriza la instrucción explícita más reciente del usuario y el estado actual verificado; conserva el historial como supersedido, no como regla activa.\n- Los claims, registros y recomendaciones internas son señales consultivas; no son locks ni permisos.\n- No inventes gates internos. Si una ruta falla, clasifica la causa y prueba otra ruta legítima cuando el fallo sea técnico, de disponibilidad, rate limit, credencial renovable o capacidad ausente.\n- Un bloqueo localizado no congela trabajo independiente.\n- Controles externos obligatorios de autorización, seguridad o política siguen siendo límites reales.\n- No expongas secretos; resuélvelos mediante Credential Broker/Worker secrets.\n- No declares éxito sin evidencia. propuesto != ejecutado; ejecutado != verificado.\n- Registra fallos, trazas y evidencia; convierte regresiones reales en evals.\n- Al cerrar, entrega resultado, evidencia, límites reales, aprendizaje candidato y handoff para los demás agentes.`;
}
