import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {BOOTSTRAP_VERSION,OWNER_PROFILE} from '../intelligence/bootstrap';
import {CAPABILITY_MATRIX,PRODUCT_FACTS,PRODUCT_KNOWLEDGE_VERIFIED_AT,PRODUCT_KNOWLEDGE_VERSION} from '../intelligence/product-knowledge';
import {CONTEXTUAL_ENGINE_VERSION} from '../lib/openai';

export type SelfModelRuntime={memories:number;workJobs:{total:number;completed:number;blocked:number};scheduledTasks:{total:number;active:number};activeSystemContexts:number;latestEvaluation:unknown};

export function buildSelfModel(models:{fast:string;balanced:string;reasoning:string},runtime:SelfModelRuntime){return{
 identity:{name:'Héctor OS',owner:OWNER_PROFILE.name,mission:'Asistente personal privado, persistente, modular y cada vez más independiente.',bootstrapVersion:BOOTSTRAP_VERSION,knowledgeVersion:PRODUCT_KNOWLEDGE_VERSION,knowledgeVerifiedAt:PRODUCT_KNOWLEDGE_VERIFIED_AT,contextualEngineVersion:CONTEXTUAL_ENGINE_VERSION},
 owner:{name:OWNER_PROFILE.name,roles:OWNER_PROFILE.roles,technicalLevel:OWNER_PROFILE.technicalLevel,learningStyle:OWNER_PROFILE.learningStyle,autonomyPreference:OWNER_PROFILE.autonomyPreference,intelligencePreference:OWNER_PROFILE.intelligencePreference,responsePreferences:OWNER_PROFILE.responsePreferences},
 architecture:['React/Vite PWA','Cloudflare Worker/Hono','D1','R2','OpenAI Responses API','Cloudflare Workers AI','GitHub Actions'],
 models:{...models,policy:{fast:'GPT-5.6 Luna o proveedor local sano para tareas simples',balanced:'GPT-5.6 Terra para trabajo general',reasoning:'GPT-5.6 Sol con xhigh o max para tareas complejas, autoconocimiento y programación'}},
 capabilities:CAPABILITY_MATRIX,
 knowledge:PRODUCT_FACTS.map(({id,subject,statement,stability,source})=>({id,subject,statement,stability,source})),
 runtime,
 limitations:['Héctor OS no posee ni modifica los pesos de los modelos externos.','No tiene acceso a cuentas, dispositivos o servicios que no estén conectados y autorizados.','No fusiona ni despliega cambios de código automáticamente.','Los datos actuales de OpenAI, Work, Codex y GPT-5.6 requieren revalidación oficial.','La configuración de un modelo no demuestra por sí sola el modelo efectivo de una ejecución.']
};}

export const selfModel=new Hono<{Bindings:Bindings;Variables:Variables}>();
selfModel.use('*',requireAuth);
selfModel.get('/self-model',async c=>{
 const userId=c.get('userId');
 const [memory,work,schedules,evaluation,contexts]=await Promise.all([
  c.env.DB.prepare('SELECT COUNT(*) count FROM memories WHERE user_id=?').bind(userId).first<{count:number}>(),
  c.env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) blocked FROM work_jobs WHERE user_id=?").bind(userId).first<any>(),
  c.env.DB.prepare('SELECT COUNT(*) total,SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) active FROM scheduled_tasks WHERE user_id=?').bind(userId).first<any>(),
  c.env.DB.prepare('SELECT score,grade,model,created_at FROM self_evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(userId).first(),
  c.env.DB.prepare('SELECT COUNT(*) count FROM system_context WHERE active=1').first<{count:number}>()
 ]);
 const runtime:SelfModelRuntime={memories:Number(memory?.count||0),workJobs:{total:Number(work?.total||0),completed:Number(work?.completed||0),blocked:Number(work?.blocked||0)},scheduledTasks:{total:Number(schedules?.total||0),active:Number(schedules?.active||0)},activeSystemContexts:Number(contexts?.count||0),latestEvaluation:evaluation||null};
 return c.json(buildSelfModel({fast:c.env.OPENAI_MODEL_FAST||c.env.OPENAI_MODEL,balanced:c.env.OPENAI_MODEL_BALANCED||c.env.OPENAI_MODEL,reasoning:c.env.OPENAI_MODEL_REASONING||c.env.OPENAI_MODEL},runtime));
});
