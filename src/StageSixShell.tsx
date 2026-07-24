import {useEffect,useState,type ReactNode} from 'react';
import {BrainCircuit,Check,Clock3,Cpu,Database,Network,Sparkles,Target,X,Zap} from 'lucide-react';

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
    kimi:{provider:string;model:string;label:string;role:string;mode:string;enabled:boolean;endpointConfigured:boolean;totalParameters:string;activeParameters:string;contextLength:number;multimodal:boolean;thinking:boolean;reason:string;trainingTarget:{repository:string;label:string;role:string;totalParameters:string;activeParameters:string;contextLength:number;customWeights:boolean}};
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
  reasoning:{effort:'high',deliberation:'force',description:'Kimi K2.5 es el cerebro abierto operativo; cualquier fallback se identifica.'},
  models:{
    teacher:{provider:'openai',model:'GPT-5.6 reasoning',role:'maestro y verificador'},
    balanced:{provider:'openai',model:'GPT-5.6 balanced',role:'respaldo equilibrado'},
    fast:{provider:'openai',model:'GPT-5.6 fast',role:'ruta rápida disponible'},
    kimi:{
      provider:'moonshot-open-weights',model:'moonshotai/Kimi-K2.5',label:'Héctor Kimi K2.5',role:'cerebro operativo multimodal y agentivo',mode:'pending-endpoint',enabled:true,endpointConfigured:false,totalParameters:'1T',activeParameters:'32B',contextLength:262144,multimodal:true,thinking:true,reason:'Integrado en la PWA; falta conectar el endpoint.',
      trainingTarget:{repository:'moonshotai/Kimi-K2-Base',label:'Kimi K2 Base · objetivo entrenable',role:'trainable-foundation',totalParameters:'1T',activeParameters:'32B',contextLength:131072,customWeights:false}
    },
    open:{provider:'huggingface',model:'Qwen/Qwen3-8B',role:'fallback abierto de transición'},
    own:{runtimeId:'hector-asi-qwen15-v41',label:'Héctor Qwen15 V41',role:'campeón propio vigente',mode:'verificando',enabled:false}
  },
  pipeline:[
    {id:'data',label:'Corpus verificable',target:10000,unit:'ejemplos'},
    {id:'benchmark',label:'Benchmark V2',target:500,stretchTarget:1000,unit:'casos ocultos'},
    {id:'failures',label:'Fallos entrenables de V41',target:100,unit:'casos'},
    {id:'autonomy',label:'Autonomía del modelo propio',target:90,unit:'%'}
  ],
  promotion:{minimumAbsoluteBenchmarkGain:.03,requiresMultipleCapabilityGains:true,requiresReproducibility:true,requiresRollback:true},
  principle:'Kimi K2.5 mejora la PWA desde el uso diario; Kimi K2 Base permanece como fundamento entrenable para pesos propios.'
};

function normalizeStatus(value:unknown):StageSixStatus{
  const next=value&&typeof value==='object'?value as Partial<StageSixStatus>:{};
  const models=next.models&&typeof next.models==='object'?next.models as Partial<StageSixStatus['models']>:{};
  const kimi=models.kimi&&typeof models.kimi==='object'?models.kimi:{};
  return{
    ...fallback,
    ...next,
    reasoning:{...fallback.reasoning,...(next.reasoning||{})},
    models:{
      teacher:{...fallback.models.teacher,...(models.teacher||{})},
      balanced:{...fallback.models.balanced,...(models.balanced||{})},
      fast:{...fallback.models.fast,...(models.fast||{})},
      kimi:{...fallback.models.kimi,...kimi,trainingTarget:{...fallback.models.kimi.trainingTarget,...((kimi as Partial<StageSixStatus['models']['kimi']>).trainingTarget||{})}},
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

  const kimiReady=status.models.kimi.endpointConfigured;

  return <>
    {children}
    <button className="s6Badge" type="button" onClick={()=>setOpen(true)} aria-label="Abrir estado de Kimi K2.5">
      <span className="s6Pulse"/>
      <strong>KIMI K2.5</strong>
      <small>{kimiReady?'ACTIVO':'PREPARADO'}</small>
    </button>
    {open&&<div className="s6Overlay" role="dialog" aria-modal="true" aria-label="Estado de Kimi K2.5">
      <button className="s6Backdrop" type="button" onClick={()=>setOpen(false)} aria-label="Cerrar estado de Kimi K2.5"/>
      <section className="s6Panel">
        <header>
          <div><span>CEREBRO OPERATIVO ABIERTO</span><h2>{status.models.kimi.label}</h2><p>{status.models.kimi.model}</p></div>
          <button type="button" onClick={()=>setOpen(false)} aria-label="Cerrar"><X/></button>
        </header>

        <article className="s6Hero">
          <div className="s6HeroIcon"><BrainCircuit/></div>
          <div><span>MULTIMODAL · THINKING · AGENTES</span><strong>{status.models.kimi.totalParameters} totales · {status.models.kimi.activeParameters} activos</strong><small>{status.models.kimi.reason}</small></div>
          <em>{kimiReady?<><Sparkles/>ACTIVO</>:<><Clock3/>PENDIENTE</>}</em>
        </article>

        <section className="s6Section">
          <h3>Arquitectura elegida</h3>
          <div className="s6Brains">
            <article><Network/><div><span>USO DIARIO</span><strong>{status.models.kimi.label}</strong><small>{kimiReady?'Endpoint conectado · 256K de contexto':'Integrado; endpoint y secreto pendientes'}</small></div>{kimiReady?<Check/>:<Clock3/>}</article>
            <article><Cpu/><div><span>ENTRENAMIENTO PROPIO</span><strong>{status.models.kimi.trainingTarget.label}</strong><small>{status.models.kimi.trainingTarget.repository} · requiere infraestructura multi-GPU</small></div><Target/></article>
            <article><Zap/><div><span>MAESTRO</span><strong>{status.models.teacher.model}</strong><small>Verificación, generación de datos y respaldo de alta precisión</small></div><Check/></article>
            <article><Cpu/><div><span>FALLBACK ABIERTO</span><strong>{status.models.open.model}</strong><small>Transición cuando Kimi no esté disponible</small></div><Check/></article>
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
