import {PWA_ENGINEERING_CONTRACT,SURFACE_GOVERNANCE_CONTRACT,renderSkills,selectSkills} from './skills';

export type AgentPlan={objective:string;skills:string[];phases:{name:string;goal:string;evidence:string[]}[];maxAttempts:number};

export function buildPlan(prompt:string):AgentPlan{
 const selected=selectSkills(prompt);
 return{
  objective:prompt,
  skills:selected.map(skill=>skill.id),
  maxAttempts:3,
  phases:[
   {name:'inspect',goal:'Reconstruir contexto compartido, estado actual y evidencia antes de actuar.',evidence:['fuentes','archivos o estado consultado','trabajo concurrente relevante','decisiones previas relacionadas']},
   {name:'plan',goal:'Dividir el objetivo en pasos observables y elegir arquitectura por evidencia, no por inercia ni falta de contexto.',evidence:['criterios de aceptación','riesgos y supuestos','opciones de reutilización o separación consideradas']},
   {name:'execute',goal:'Ejecutar la acción mínima suficiente mediante herramientas autorizadas.',evidence:['eventos de herramienta','artefactos o cambios']},
   {name:'test',goal:'Comprobar el resultado y reparar fallos hasta el límite.',evidence:['salida de pruebas','errores y reintentos']},
   {name:'verify',goal:'Confirmar cada criterio con evidencia independiente y publicar un handoff compartido.',evidence:['resultado final','limitaciones pendientes','contexto compartido actualizado']}
  ]
 };
}

export function renderAgentContext(prompt:string){
 const skills=selectSkills(prompt);
 const plan=buildPlan(prompt);
 const specialized=plan.skills.includes('pwa-builder')?`\n\n${PWA_ENGINEERING_CONTRACT}`:'';
 return `PROTOCOLO AGENTIVO V3\nObjetivo: ${prompt}\nSkills seleccionadas: ${plan.skills.join(', ')||'general-analysis'}\nMáximo de intentos: ${plan.maxAttempts}\n\n${SURFACE_GOVERNANCE_CONTRACT}\n\n${renderSkills(skills)}${specialized}\n\nREGLAS\n- Reconstruye contexto desde main, PRs, Context Hub y el Shared Context Ledger antes de crear una implementación paralela.\n- El contexto compartido informa decisiones; no es un permiso ni un freno.\n- No declares éxito sin evidencia.\n- propuesto != ejecutado; ejecutado != verificado.\n- Registra cada fallo y cambia de estrategia antes de reintentar.\n- No inventes acceso a herramientas que no estén disponibles.\n- Al cerrar, entrega resultado, evidencia, límites, aprendizaje candidato y handoff para los demás agentes.`;
}
