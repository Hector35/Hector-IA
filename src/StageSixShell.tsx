import {useEffect,useState,type ReactNode} from 'react';
import {BrainCircuit,Check,Clock3,Cpu,Database,Network,Sparkles,Target,X,Zap} from 'lucide-react';

type TrainingTarget={repository:string;label:string;role:string;totalParameters:string;activeParameters:string;contextLength:number;customWeights:boolean};
type Qwen397Model={provider:string;model:string;label:string;role:string;mode:string;enabled:boolean;endpointConfigured:boolean;totalParameters:string;activeParameters:string;contextLength:number;extendedContextLength:number;multimodal:boolean;thinking:boolean;trainable:boolean;license:string;reason:string};

export type StageSixStatus={
  stage:number;
  name:string;
  status:string;
  active:boolean;
  experienceMode:string;
  reasoning:{effort:string;deliberation:string;description:string};
  models:{
    teacher:{provider:string;model:string;role:string};
    balanced:{provider:string;model:string;role:string};
    fast:{provider:string;model:string;role:string};
    qwen397:Qwen397Model;
    kimi:{provider:string;model:string;label:string;role:string;mode:string;enabled:boolean;endpointConfigured:boolean;totalParameters:string;activeParameters:string;contextLength:number;multimodal:boolean;thinking:boolean;reason:string;trainingTarget:TrainingTarget};
    open:{provider:string;model:string;role:string};
    own:{runtimeId:string;label:string;role:string;mode:string;enabled:boolean};
  };
  pipeline:Array<{id:string;label:string;target:number;stretchTarget?:number;unit:string}>;
  promotion:{minimumAbsoluteBenchmarkGain:number;requiresMultipleCapabilityGains:boolean;requiresReproducibility:boolean;requiresRollback:boolean};
  principle:string;
};

const fallback:StageSixStatus={
  stage:6,
  name:'Inteligencia híbrida autoevolutiva',
  status:'loading',
  active:true,
  experienceMode:'maximum-intelligence',
  reasoning:{effort:'high',deliberation:'force',description:'Qwen3.5-397B-A17B es el cerebro principal; cualquier fallback se identifica.'},
  models:{
    teacher:{provider:'openai',model:'GPT-5.6 reasoning',role:'maestro y verificador'},
    balanced:{provider:'openai',model:'GPT-5.6 balanced',role:'respaldo equilibrado'},
    fast:{provider:'openai',model:'GPT-5.6 fast',role:'ruta rápida disponible'},
    qwen397:{provider:'qwen-open-weights',model:'Qwen/Qwen3.5-397B-A17B',label:'Héctor Qwen 397B',role:'cerebro principal multimodal, thinking y agentivo',mode:'pending-endpoint',enabled:true,endpointConfigured:false,totalParameters:'397B',activeParameters:'17B',contextLength:262144,extendedContextLength:1010000,multimodal:true,thinking:true,trainable:true,license:'Apache-2.0',reason:'Integrado en la PWA; falta conectar el endpoint y su secreto.'},
    kimi:{
      provider:'moonshot-open-weights',model:'moonshotai/Kimi-K2.5',label:'Héctor Kimi K2.5',role:'respaldo MoE multimodal',mode:'pending-endpoint',enabled:true,endpointConfigured:false,totalParameters:'1T',activeParameters:'32B',contextLength:262144,multimodal:true,thinking:true,reason:'Respaldo integrado; endpoint pendiente.',
      trainingTarget:{repository:'moonshotai/Kimi-K2-Base',label:'Kimi K2 Base',role:'secondary-trainable-foundation',totalParameters:'1T',activeParameters:'32B',contextLength:131072,customWeights:false}
    },
    open:{provider:'huggingface',model:'Qwen/Qwen3-8B',role:'fallback abierto ligero de transición'},
    own:{runtimeId:'hector-asi-qwen15-v41',label:'Héctor Qwen15 V41',role:'campeón propio vigente',mode:'verificando',enabled:false}
  },
  pipeline:[
    {id:'data',label:'Corpus verificable',target:10000,unit:'ejemplos'},
    {id:'benchmark',label:'Benchmark V2',target:500,stretchTarget:1000,unit:'casos ocultos'},
    {id:'failures',label:'Fallos entrenables de V41',target:100,unit:'casos'},
    {id:'autonomy',label:'Autonomía del modelo propio',target:90,unit:'%'}
  ],
  promotion:{minimumAbsoluteBenchmarkGain:.03,requiresMultipleCapabilityGains:true,requiresReproducibility:true,requiresRollback:true},
  principle:'Qwen3.5-397B-A17B es el cerebro principal y fundamento entrenable abierto; sólo se marca activo cuando responde su endpoint.'
};

function normalizeStatus(value:unknown):StageSixStatus{
  const next=value&&typeof value==='object'?value as Partial<StageSixStatus>:{};
  const models=next.models&&typeof next.models==='object'?next.models as Partial<StageSixStatus['models']>:{};
  const kimi=models.kimi&&typeof models.kimi==='object'?models.kimi as Partial<StageSixStatus['models']['kimi']>:{};
  return{
    ...fallback,
    ...next,
    reasoning:{...fallback.reasoning,...(next.reasoning||{})},
    models:{
      teacher:{...fallback.models.teacher,...(models.teacher||{})},
      balanced:{...fallback.models.balanced,...(models.balanced||{})},
      fast:{...fallback.models.fast,...(models.fast||{})},
      qwen397:{...fallback.models.qwen397,...(models.qwen397||{})},
      kimi:{...fallback.models.kimi,...kimi,trainingTarget:{...fallback.models.kimi.trainingTarget,...(kimi.trainingTarget||{})}},
      open:{...fallback.models.open,...(models.open||{})},
      own:{...fallback.models.own,...(models.own||{})}
    },
    pipeline:Array.isArray(next.pipeline)?next.pipeline:fallback.pipeline,
    promotion:{...fallback.promotion,...(next.promotion||{})}
  };
}

export function StageSixShell({children}:{children:ReactNode}){
  const [status,setStatus]=useState<StageSixStatus>(fallback);
  const [open,setOpen]=useState(false);

  useEffect(()=>{
    fetch('/api/system/stage-6',{credentials:'include'})
      .then(async response=>response.ok?response.json():Promise.reject(new Error('stage-6 unavailable')))
      .then(data=>setStatus(normalizeStatus(data)))
      .catch(()=>setStatus(fallback));
  },[]);

  const qwenReady=status.models.qwen397.endpointConfigured;
  const kimiReady=status.models.kimi.endpointConfigured;

  return <>
    {children}
    <button className="s6Badge" type="button" onClick={()=>setOpen(true)} aria-label="Abrir estado de Qwen 397B">
      <span className="s6Pulse"/>
      <strong>QWEN 397B</strong>
      <small>{qwenReady?'ACTIVO':'PREPARADO'}</small>
    </button>
    {open&&<div className="s6Overlay" role="dialog" aria-modal="true" aria-label="Estado de Qwen 397B">
      <button className="s6Backdrop" type="button" onClick={()=>setOpen(false)} aria-label="Cerrar estado de Qwen 397B"/>
      <section className="s6Panel">
        <header>
          <div><span>CEREBRO PRINCIPAL ABIERTO</span><h2>{status.models.qwen397.label}</h2><p>{status.models.qwen397.model}</p></div>
          <button type="button" onClick={()=>setOpen(false)} aria-label="Cerrar"><X/></button>
        </header>

        <article className="s6Hero">
          <div className="s6HeroIcon"><BrainCircuit/></div>
          <div><span>MULTIMODAL · THINKING · MoE</span><strong>{status.models.qwen397.totalParameters} totales · {status.models.qwen397.activeParameters} activos</strong><small>{status.models.qwen397.reason}</small></div>
          <em>{qwenReady?<><Sparkles/>ACTIVO</>:<><Clock3/>PENDIENTE</>}</em>
        </article>

        <section className="s6Section">
          <h3>Arquitectura elegida</h3>
          <div className="s6Brains">
            <article><Network/><div><span>USO DIARIO</span><strong>{status.models.qwen397.label}</strong><small>{qwenReady?'Endpoint conectado · 262K de contexto nativo':'Integrado; endpoint y secreto pendientes'}</small></div>{qwenReady?<Check/>:<Clock3/>}</article>
            <article><Cpu/><div><span>ENTRENAMIENTO PROPIO</span><strong>{status.models.qwen397.model}</strong><small>Pesos Apache 2.0 · adaptación distribuida cuando exista cómputo suficiente</small></div><Target/></article>
            <article><Network/><div><span>RESPALDO MoE</span><strong>{status.models.kimi.label}</strong><small>{kimiReady?'Kimi K2.5 conectado':'Kimi K2.5 preparado como segundo nivel'}</small></div>{kimiReady?<Check/>:<Clock3/>}</article>
            <article><Zap/><div><span>MAESTRO</span><strong>{status.models.teacher.model}</strong><small>Verificación, datos y respaldo de alta precisión</small></div><Check/></article>
            <article><Cpu/><div><span>FALLBACK LIGERO</span><strong>{status.models.open.model}</strong><small>Workers AI cuando los endpoints grandes no estén disponibles</small></div><Check/></article>
            <article><Network/><div><span>CAMPEÓN PROPIO</span><strong>{status.models.own.label}</strong><small>{status.models.own.mode} · permanece hasta ser superado</small></div><Check/></article>
          </div>
        </section>

        <section className="s6Section">
          <h3>Fábrica de autonomía</h3>
          <div className="s6Targets">
            {status.pipeline.map(item=><article key={item.id}>
              <span>{item.id==='data'?<Database/>:<Target/>}</span>
              <div><strong>{item.target.toLocaleString('es-MX')}{item.stretchTarget?`–${item.stretchTarget.toLocaleString('es-MX')}`:''}</strong><small>{item.label}</small></div>
              <em>{item.unit}</em>
            </article>)}
          </div>
        </section>

        <p className="s6Principle">{status.principle}</p>
      </section>
    </div>}
  </>;
}
