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
    kimi:{provider:string;model:string;label:string;role:string;mode:string;enabled:boolean;endpointConfigured:boolean;totalParameters:string;activeParameters:string;reason:string};
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
  reasoning:{effort:'high',deliberation:'force',description:'Kimi K2 Base es el objetivo abierto del chat; cualquier fallback se identifica.'},
  models:{
    teacher:{provider:'openai',model:'GPT-5.6 reasoning',role:'cerebro maestro'},
    balanced:{provider:'openai',model:'GPT-5.6 balanced',role:'respaldo equilibrado'},
    fast:{provider:'openai',model:'GPT-5.6 fast',role:'ruta rápida disponible'},
    kimi:{provider:'moonshot-open-weights',model:'moonshotai/Kimi-K2-Base',label:'Héctor Kimi K2 Base',role:'base MoE principal',mode:'pending-endpoint',enabled:true,endpointConfigured:false,totalParameters:'1T',activeParameters:'32B',reason:'Preparado en la PWA; falta conectar el endpoint GPU.'},
    open:{provider:'huggingface',model:'Qwen/Qwen3-8B',role:'fallback abierto de transición'},
    own:{runtimeId:'hector-asi-qwen15-v41',label:'Héctor Qwen15 V41',role:'cerebro propio en crecimiento',mode:'verificando',enabled:false}
  },
  pipeline:[
    {id:'data',label:'Corpus verificable',target:10000,unit:'ejemplos'},
    {id:'benchmark',label:'Benchmark V2',target:500,stretchTarget:1000,unit:'casos ocultos'},
    {id:'failures',label:'Fallos entrenables de V41',target:100,unit:'casos'},
    {id:'autonomy',label:'Autonomía del modelo propio',target:90,unit:'%'}
  ],
  promotion:{minimumAbsoluteBenchmarkGain:.03,requiresMultipleCapabilityGains:true,requiresReproducibility:true,requiresRollback:true},
  principle:'Kimi K2 Base es la base MoE objetivo; solo se marcará activa cuando el endpoint GPU responda.'
};

export function StageSixShell({children}:{children:ReactNode}){
  const [status,setStatus]=useState<StageSixStatus>(fallback);
  const [open,setOpen]=useState(false);

  useEffect(()=>{
    fetch('/api/system/stage-6',{credentials:'include'})
      .then(async response=>response.ok?response.json():Promise.reject(new Error('stage-6 unavailable')))
      .then(data=>setStatus(data as StageSixStatus))
      .catch(()=>setStatus(fallback));
  },[]);

  const kimiReady=status.models.kimi.endpointConfigured;

  return <>
    {children}
    <button className="s6Badge" type="button" onClick={()=>setOpen(true)} aria-label="Abrir estado de Kimi K2 Base">
      <span className="s6Pulse"/>
      <strong>KIMI K2</strong>
      <small>{kimiReady?'BASE ACTIVA':'BASE PREPARADA'}</small>
    </button>
    {open&&<div className="s6Overlay" role="dialog" aria-modal="true" aria-label="Estado de Kimi K2 Base">
      <button className="s6Backdrop" type="button" onClick={()=>setOpen(false)} aria-label="Cerrar estado de Kimi K2 Base"/>
      <section className="s6Panel">
        <header>
          <div><span>ARQUITECTURA ABIERTA OBJETIVO</span><h2>{status.models.kimi.label}</h2><p>{status.models.kimi.model}</p></div>
          <button type="button" onClick={()=>setOpen(false)} aria-label="Cerrar"><X/></button>
        </header>

        <article className="s6Hero">
          <div className="s6HeroIcon"><BrainCircuit/></div>
          <div><span>MODELO MoE</span><strong>{status.models.kimi.totalParameters} totales · {status.models.kimi.activeParameters} activos</strong><small>{status.models.kimi.reason}</small></div>
          <em>{kimiReady?<><Sparkles/>ACTIVA</>:<><Clock3/>PENDIENTE</>}</em>
        </article>

        <section className="s6Section">
          <h3>Cerebros conectados</h3>
          <div className="s6Brains">
            <article><Network/><div><span>BASE PRINCIPAL</span><strong>{status.models.kimi.label}</strong><small>{kimiReady?'Endpoint GPU conectado':'Visible en PWA; endpoint GPU pendiente'}</small></div>{kimiReady?<Check/>:<Clock3/>}</article>
            <article><Zap/><div><span>MAESTRO</span><strong>{status.models.teacher.model}</strong><small>Entrenamiento, evaluación y síntesis autorizada</small></div><Check/></article>
            <article><Cpu/><div><span>TRANSICIÓN</span><strong>{status.models.open.model}</strong><small>Fallback abierto mientras Kimi se conecta</small></div><Check/></article>
            <article><Network/><div><span>PROPIO</span><strong>{status.models.own.label}</strong><small>{status.models.own.mode} · autonomía en crecimiento</small></div><Check/></article>
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
