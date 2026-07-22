import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {Activity,ArrowUp,Brain,Check,Clock3,Database,File,GitBranch,History,Lock,LogOut,Network,Paperclip,Plus,Sparkles,Target,Trophy,X,Zap} from 'lucide-react';
import {api,type User} from './api';
import {MarkdownMessage} from './MarkdownMessage';
import {AutonomousActivity,executeOperation} from './hector-asi-operations';
import modelRegistryJson from '../model/hector-asi/model-registry.json';

type ChatMessage={
  id?:string;
  role:string;
  content:string;
  provider?:string;
  model?:string;
  fallback?:boolean;
  modelTier?:string;
  attachmentName?:string;
  attachmentPreview?:string;
};

type PendingAttachment={file:File;preview?:string};
type Overlay='history'|'account'|'evolution'|null;
type EvolutionState='active'|'forming'|'locked';

type RegistryCandidate={
  id:string;
  status:string;
  baseModel?:{repository?:string;revision?:string;license?:string};
  method?:{stage?:string;adapter?:string;precision?:string};
  dataset?:{path?:string;manifest?:string;containsPrivateUserData?:boolean};
  artifacts?:{adapterPath?:string;metricsPath?:string;storage?:string;committedToGit?:boolean};
  promotionGate?:{
    minimumHeldOutImprovement?:number;
    maximumSecondaryRegression?:number;
    criticalRegressionsAllowed?:number;
    requiresReproducibleRun?:boolean;
    requiresRollbackArtifact?:boolean;
  };
};

type ModelRegistry={
  schemaVersion?:string;
  project?:string;
  champion?:string|{id?:string}|null;
  candidates?:RegistryCandidate[];
};

type SelfModel={
  identity?:{name?:string;knowledgeVersion?:string;knowledgeVerifiedAt?:string};
  runtime?:{
    memories?:number;
    workJobs?:{total?:number;completed?:number;blocked?:number};
    scheduledTasks?:{total?:number;active?:number};
    responseTraces?:number;
    activeSystemContexts?:number;
    latestEvaluation?:{score?:number;grade?:string;model?:string;created_at?:string}|null;
  };
  capabilities?:Array<{capability:string;components?:string[];evidence?:string;limit?:string}>;
};

type EvolutionModule={id:string;label:string;detail:string;state:EvolutionState};

type EvolutionModel={
  candidate:RegistryCandidate|null;
  championId:string|null;
  generation:string;
  stage:string;
  baseName:string;
  methodName:string;
  signature:string;
  modules:EvolutionModule[];
};

const modelRegistry=modelRegistryJson as ModelRegistry;

async function jsonFetch(path:string,init?:RequestInit){
  const response=await fetch(path,{credentials:'include',...init,headers:{'Content-Type':'application/json',...(init?.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'No disponible');
  return data;
}

function asksForModel(value:string){
  return /(?:qué|que|cuál|cual).{0,30}(?:modelo|proveedor)|modelo.{0,20}(?:usas|usaste|utilizaste)|quién me respondió|quien me respondio/i.test(value);
}

function asksForSystemReport(value:string){
  return /actualizaci[oó]n|qu[eé] cambi[oó]|qu[eé] puedes hacer ahora|limitaciones|autoanal[ií]za|autoeval[uú]a|problemas por resolver|estado del sistema/i.test(value);
}

function championId(value:ModelRegistry['champion']){
  if(typeof value==='string')return value;
  return value?.id||null;
}

function shortModelName(repository?:string){
  if(!repository)return'Modelo base sin registrar';
  return repository.split('/').filter(Boolean).at(-1)||repository;
}

function statusLabel(status?:string){
  const labels:Record<string,string>={
    planned:'Preparando primer candidato',
    data_ready:'Datos listos para entrenamiento',
    training:'Entrenando candidato',
    trained:'Entrenamiento terminado',
    evaluating:'Comprobando capacidades',
    evaluated:'Candidato evaluado',
    promoted:'Nueva generación promovida',
    rejected:'Candidato descartado sin degradar al campeón'
  };
  return labels[status||'']||'Construyendo la primera generación';
}

function buildEvolution(selfModel?:SelfModel|null):EvolutionModel{
  const candidates=modelRegistry.candidates||[];
  const candidate=candidates[0]||null;
  const champion=championId(modelRegistry.champion);
  const status=candidate?.status||'planned';
  const trainingActive=['training','trained','evaluating','evaluated','promoted'].includes(status);
  const trainingLocked=status==='rejected';
  const systemCapabilities=selfModel?.capabilities?.length||0;
  const baseName=shortModelName(candidate?.baseModel?.repository);
  const methodName=[candidate?.method?.adapter?.toUpperCase(),candidate?.method?.stage?.toUpperCase()].filter(Boolean).join(' + ')||'Método por definir';
  const modules:EvolutionModule[]=[
    {id:'core',label:'Núcleo',detail:baseName,state:candidate?.baseModel?.repository?'active':'locked'},
    {id:'data',label:'Datos',detail:candidate?.dataset?.manifest?'Dataset versionado':'Sin dataset registrado',state:candidate?.dataset?.manifest?'active':'locked'},
    {id:'training',label:'Entrenamiento',detail:methodName,state:trainingLocked?'locked':trainingActive?'active':'forming'},
    {id:'evaluation',label:'Evaluación',detail:candidate?.promotionGate?'Puertas de promoción definidas':'Sin reglas registradas',state:candidate?.promotionGate?'active':'locked'},
    {id:'system',label:'Sistema cognitivo',detail:selfModel?`${systemCapabilities} capacidades documentadas`:'Leyendo estado real',state:selfModel?'active':'forming'},
    {id:'champion',label:'Campeón',detail:champion||'Aún no existe una versión promovida',state:champion?'active':'locked'}
  ];
  return{
    candidate,
    championId:champion,
    generation:champion?champion:'Generación de origen',
    stage:champion?`Campeón activo · ${statusLabel(status)}`:statusLabel(status),
    baseName,
    methodName,
    signature:JSON.stringify({schema:modelRegistry.schemaVersion,champion:modelRegistry.champion,candidates:candidates.map(item=>({id:item.id,status:item.status,base:item.baseModel?.repository,method:item.method}))}),
    modules
  };
}

export function HectorASIEvolutionApp(){
  const [user,setUser]=useState<User|null|undefined>();
  useEffect(()=>{api.me().then(result=>setUser(result.user)).catch(()=>setUser(null))},[]);

  if(user===undefined)return <Splash/>;
  if(!user)return <Login onDone={setUser}/>;
  return <EvolutionWorkspace user={user} onLogout={()=>api.logout().finally(()=>setUser(null))}/>;
}

function Splash(){
  return <div className="haSplash eaSplash" aria-label="Iniciando Hector ASI">
    <NeuralOrganism modules={buildEvolution(null).modules} compact/>
    <h1>Hector ASI</h1>
    <p>Leyendo su estado evolutivo</p>
  </div>;
}

function Login({onDone}:{onDone:(user:User)=>void}){
  const [register,setRegister]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    setBusy(true);
    setError('');
    const form=new FormData(event.currentTarget);
    try{
      const result=register
        ?await api.register(String(form.get('name')),String(form.get('email')),String(form.get('password')))
        :await api.login(String(form.get('email')),String(form.get('password')));
      onDone(result.user);
    }catch(reason){
      setError(reason instanceof Error?reason.message:'No se pudo iniciar sesión');
    }finally{
      setBusy(false);
    }
  };

  return <main className="haLogin eaLogin">
    <section className="haLoginIdentity eaLoginIdentity">
      <NeuralOrganism modules={buildEvolution(null).modules} compact/>
      <h1>Hector ASI</h1>
      <p>Observa cómo se construye, comprueba qué aprende y habla con él desde el mismo lugar.</p>
    </section>
    <form className="haLoginForm" onSubmit={submit}>
      {register&&<label>Nombre<input name="name" defaultValue="Héctor" autoComplete="name" required/></label>}
      <label>Correo<input name="email" type="email" autoComplete="email" required/></label>
      <label>Contraseña<input name="password" type="password" minLength={10} autoComplete={register?'new-password':'current-password'} required/></label>
      {error&&<div className="haError" role="alert">{error}</div>}
      <button className="haLoginButton" disabled={busy}>{busy?'Procesando…':register?'Crear acceso':'Entrar'}</button>
      <button type="button" className="haTextButton" onClick={()=>setRegister(value=>!value)}>{register?'Ya tengo acceso':'Configurar por primera vez'}</button>
    </form>
  </main>;
}

function EvolutionWorkspace({user,onLogout}:{user:User;onLogout:()=>void}){
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [history,setHistory]=useState<any[]>([]);
  const [conversationId,setConversationId]=useState<string>();
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [overlay,setOverlay]=useState<Overlay>(null);
  const [attachment,setAttachment]=useState<PendingAttachment>();
  const [notice,setNotice]=useState('');
  const [activityRefresh,setActivityRefresh]=useState(0);
  const [selfModel,setSelfModel]=useState<SelfModel|null>(null);
  const [evolutionNotice,setEvolutionNotice]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);
  const composerInput=useRef<HTMLTextAreaElement>(null);
  const end=useRef<HTMLDivElement>(null);

  const evolution=useMemo(()=>buildEvolution(selfModel),[selfModel]);
  const loadHistory=()=>api.conversations().then(result=>setHistory(result.items||[]));
  const loadSelfModel=()=>jsonFetch('/api/intelligence/self-model').then(result=>setSelfModel(result as SelfModel)).catch(()=>setSelfModel(null));

  useEffect(()=>{void Promise.all([loadHistory(),loadSelfModel()])},[]);
  useEffect(()=>{
    try{
      const key='hector-asi-evolution-signature';
      const previous=window.localStorage.getItem(key);
      if(previous&&previous!==evolution.signature){
        setEvolutionNotice('Hector ASI cambió desde tu última visita.');
        navigator.vibrate?.(18);
      }
      window.localStorage.setItem(key,evolution.signature);
    }catch{}
  },[evolution.signature]);
  useEffect(()=>{
    if(!conversationId)return;
    const timer=window.setInterval(()=>{
      if(busy)return;
      api.conversationMessages(conversationId).then(result=>setMessages(result.items||[])).catch(()=>{});
    },8000);
    return()=>window.clearInterval(timer);
  },[conversationId,busy]);
  useEffect(()=>{
    end.current?.scrollIntoView({behavior:messages.length?'smooth':'auto',block:'end'});
  },[messages,busy,notice,activityRefresh]);

  const title=useMemo(()=>{
    if(!conversationId)return 'Nueva conversación';
    const current=history.find(item=>item.id===conversationId);
    return current?.alias||current?.title||'Conversación';
  },[conversationId,history]);

  const focusComposer=()=>{
    setOverlay(null);
    window.setTimeout(()=>composerInput.current?.focus(),60);
  };

  const fresh=()=>{
    setConversationId(undefined);
    setMessages([]);
    setText('');
    setAttachment(undefined);
    setNotice('');
    setOverlay(null);
  };

  const openConversation=async(id:string)=>{
    setNotice('Abriendo conversación…');
    try{
      const result=await api.conversationMessages(id);
      setConversationId(id);
      setMessages(result.items||[]);
      setOverlay(null);
    }finally{
      setNotice('');
    }
  };

  const chooseAttachment=(file?:File)=>{
    if(!file)return;
    setAttachment({file,preview:file.type.startsWith('image/')?URL.createObjectURL(file):undefined});
  };

  const send=async(event?:FormEvent)=>{
    event?.preventDefault();
    const prompt=text.trim();
    if((!prompt&&!attachment)||busy)return;

    const selected=attachment;
    const userContent=prompt||(selected?.file.type.startsWith('image/')?'Analiza esta imagen.':'Registra y analiza este archivo.');
    setText('');
    setAttachment(undefined);
    setMessages(current=>[...current,{role:'user',content:userContent,attachmentName:selected?.file.name,attachmentPreview:selected?.preview}]);
    setBusy(true);
    setNotice(selected?'Procesando archivo y solicitud…':'Pensando y ejecutando…');

    try{
      if(selected?.file.type.startsWith('image/')){
        const result=await api.vision(selected.file,userContent);
        setMessages(current=>[...current,{role:'assistant',content:result.answer||'La imagen fue procesada.',provider:result.provider||'openai',model:result.model,modelTier:'vision'}]);
      }else{
        let requestText=userContent;
        if(selected){
          await api.upload(selected.file);
          requestText=`${userContent}\n\nArchivo privado disponible: ${selected.file.name}. Trabaja con él cuando la capacidad correspondiente esté disponible y confirma qué pudiste comprobar.`;
        }

        const operation=!selected?await executeOperation(requestText):null;
        if(operation){
          setMessages(items=>[...items,{role:'assistant',...operation}]);
          setActivityRefresh(value=>value+1);
        }else if(asksForModel(requestText)){
          const result=await jsonFetch('/api/system/model');
          const current=result.current||{};
          const content=current.model
            ?`## Modelo real de la respuesta anterior\n- **Proveedor:** ${current.provider}\n- **Modelo:** ${current.model}\n- **Nivel:** ${current.tier||'no registrado'}\n- **Motivo:** ${current.reason||'no registrado'}\n- **Fallback:** ${current.fallback?'sí':'no'}`
            :'Aún no hay una respuesta de IA registrada.';
          setMessages(items=>[...items,{role:'assistant',content,provider:current.provider?.toLowerCase()||'system',model:current.model,modelTier:current.tier,fallback:current.fallback}]);
        }else if(asksForSystemReport(requestText)){
          if(/autoanal[ií]za|autoeval[uú]a/i.test(requestText))await jsonFetch('/api/intelligence/self-evaluate',{method:'POST',body:'{}'});
          const result=await jsonFetch('/api/system/report');
          setMessages(items=>[...items,{role:'assistant',content:result.text,provider:'system',model:`Hector ASI ${result.version||''}`.trim(),modelTier:'verified'}]);
          void loadSelfModel();
        }else{
          const result=await api.chat(requestText,conversationId,{reasoning:'high',deliberation:'auto'});
          setConversationId(result.conversationId);
          setMessages(items=>[...items,{...result.message,provider:result.provider,model:result.model,fallback:result.fallback,modelTier:result.modelTier}]);
          await loadHistory();
          void loadSelfModel();
        }
      }
    }catch(reason){
      setMessages(current=>[...current,{role:'assistant',content:`No pude completar la acción: ${reason instanceof Error?reason.message:'error desconocido'}`,provider:'system',model:'error-report'}]);
    }finally{
      setBusy(false);
      setNotice('');
    }
  };

  return <div className="haApp eaApp">
    <header className="haTopbar">
      <button className="haIconButton" onClick={()=>setOverlay('history')} aria-label="Abrir historial"><History/></button>
      <button className="haTopIdentity eaTopIdentity" onClick={()=>setOverlay('evolution')} aria-label="Ver evolución de Hector ASI">
        <strong>Hector ASI</strong>
        <span><i className={busy?'busy':''}/>{busy?'Trabajando':evolution.stage}</span>
      </button>
      <button className="haAvatar" onClick={()=>setOverlay('account')} aria-label="Abrir cuenta">{user.name.slice(0,1).toUpperCase()}</button>
    </header>

    <main className="haConversation eaConversation" aria-label={title}>
      {messages.length===0
        ?<EvolutionHome evolution={evolution} selfModel={selfModel} busy={busy} notice={evolutionNotice} talk={focusComposer} details={()=>setOverlay('evolution')}/>
        :<EvolutionStrip evolution={evolution} busy={busy} open={()=>setOverlay('evolution')}/>} 

      <section className="haMessages" aria-live="polite">
        {messages.map((message,index)=><Message key={message.id||`${message.role}-${index}`} message={message}/>)}
        {busy&&<article className="haMessage assistant thinking" aria-label="Hector ASI está trabajando"><div><span/><span/><span/></div></article>}
        {notice&&<div className="haNotice"><Clock3/>{notice}</div>}
      </section>
      <AutonomousActivity refreshToken={activityRefresh}/>
      <div ref={end}/>
    </main>

    <form className="haComposer" onSubmit={send}>
      {attachment&&<div className="haAttachmentPreview">
        {attachment.preview?<img src={attachment.preview} alt="Vista previa del archivo"/>:<File/>}
        <span>{attachment.file.name}</span>
        <button type="button" onClick={()=>setAttachment(undefined)} aria-label="Quitar archivo"><X/></button>
      </div>}
      <div className="haComposerInner">
        <button className="haAttach" type="button" onClick={()=>fileInput.current?.click()} aria-label="Adjuntar archivo"><Paperclip/></button>
        <textarea ref={composerInput} value={text} onChange={event=>setText(event.target.value)} onKeyDown={event=>{
          if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}
        }} rows={1} placeholder="Habla con Hector ASI…" aria-label="Mensaje para Hector ASI"/>
        <button className="haSend" aria-label="Enviar" disabled={busy||(!text.trim()&&!attachment)}><ArrowUp/></button>
      </div>
      <input ref={fileInput} type="file" hidden onChange={event=>{chooseAttachment(event.target.files?.[0]);event.currentTarget.value=''}}/>
      <small>La evolución solo cambia cuando existe evidencia real.</small>
    </form>

    {overlay==='history'&&<HistorySheet history={history} activeId={conversationId} close={()=>setOverlay(null)} fresh={fresh} open={openConversation}/>} 
    {overlay==='account'&&<AccountSheet user={user} close={()=>setOverlay(null)} logout={onLogout}/>} 
    {overlay==='evolution'&&<EvolutionSheet evolution={evolution} selfModel={selfModel} close={()=>setOverlay(null)} talk={focusComposer}/>} 
  </div>;
}

function EvolutionHome({evolution,selfModel,busy,notice,talk,details}:{evolution:EvolutionModel;selfModel:SelfModel|null;busy:boolean;notice:string;talk:()=>void;details:()=>void}){
  const completed=selfModel?.runtime?.workJobs?.completed||0;
  return <section className="eaHome">
    {notice&&<button className="eaEvolutionNotice" onClick={details}><Sparkles/>{notice}</button>}
    <NeuralOrganism modules={evolution.modules} busy={busy}/>
    <div className="eaIdentity">
      <span>{evolution.generation}</span>
      <h1>Hector ASI</h1>
      <p>{evolution.stage}</p>
    </div>
    <div className="eaPrimaryActions">
      <button className="eaTalk" onClick={talk}><Zap/>Hablar con Héctor</button>
      <button className="eaDetails" onClick={details}><Network/>Ver cómo está creciendo</button>
    </div>
    <div className="eaTruthRail" aria-label="Estado real del modelo">
      <div><Brain/><span>Núcleo</span><strong>{evolution.baseName}</strong></div>
      <div><GitBranch/><span>Candidato</span><strong>{evolution.candidate?.status||'sin registrar'}</strong></div>
      <div><Trophy/><span>Campeón</span><strong>{evolution.championId||'aún no promovido'}</strong></div>
      <div><Check/><span>Trabajos comprobados</span><strong>{completed}</strong></div>
    </div>
  </section>;
}

function EvolutionStrip({evolution,busy,open}:{evolution:EvolutionModel;busy:boolean;open:()=>void}){
  return <button className="eaStrip" onClick={open}>
    <NeuralOrganism modules={evolution.modules} busy={busy} compact/>
    <span><strong>{evolution.generation}</strong><small>{busy?'Pensando y actuando':evolution.stage}</small></span>
    <Network/>
  </button>;
}

function NeuralOrganism({modules,busy=false,compact=false}:{modules:EvolutionModule[];busy?:boolean;compact?:boolean}){
  const state=(id:string)=>modules.find(module=>module.id===id)?.state||'locked';
  return <div className={`eaOrganism ${compact?'compact':''} ${busy?'busy':''}`} aria-label="Organismo evolutivo de Hector ASI">
    <svg className="eaConnections" viewBox="0 0 300 300" aria-hidden="true">
      <line x1="150" y1="150" x2="150" y2="34" className={state('data')}/>
      <line x1="150" y1="150" x2="252" y2="92" className={state('training')}/>
      <line x1="150" y1="150" x2="252" y2="208" className={state('evaluation')}/>
      <line x1="150" y1="150" x2="150" y2="266" className={state('champion')}/>
      <line x1="150" y1="150" x2="48" y2="208" className={state('system')}/>
      <line x1="150" y1="150" x2="48" y2="92" className={state('core')}/>
    </svg>
    <div className="eaCore"><span>H</span><i/></div>
    <EvolutionNode id="data" state={state('data')} label="Datos" icon={<Database/>}/>
    <EvolutionNode id="training" state={state('training')} label="Entrenamiento" icon={<Activity/>}/>
    <EvolutionNode id="evaluation" state={state('evaluation')} label="Evaluación" icon={<Target/>}/>
    <EvolutionNode id="champion" state={state('champion')} label="Campeón" icon={<Trophy/>}/>
    <EvolutionNode id="system" state={state('system')} label="Sistema" icon={<Network/>}/>
    <EvolutionNode id="core" state={state('core')} label="Núcleo" icon={<Brain/>}/>
  </div>;
}

function EvolutionNode({id,state,label,icon}:{id:string;state:EvolutionState;label:string;icon:React.ReactNode}){
  return <div className={`eaNode node-${id} ${state}`} aria-label={`${label}: ${state}`}><span>{state==='locked'?<Lock/>:icon}</span><small>{label}</small></div>;
}

function EvolutionSheet({evolution,selfModel,close,talk}:{evolution:EvolutionModel;selfModel:SelfModel|null;close:()=>void;talk:()=>void}){
  const runtime=selfModel?.runtime;
  return <div className="haOverlay" role="dialog" aria-modal="true" aria-label="Evolución de Hector ASI">
    <button className="haOverlayBackdrop" onClick={close} aria-label="Cerrar evolución"/>
    <section className="haSheet eaEvolutionSheet">
      <header><div><span>Estado verificable</span><h2>Evolución</h2></div><button onClick={close} aria-label="Cerrar"><X/></button></header>
      <div className="eaSheetHero">
        <NeuralOrganism modules={evolution.modules} compact/>
        <div><span>{evolution.generation}</span><strong>{evolution.stage}</strong><small>Base: {evolution.baseName} · {evolution.methodName}</small></div>
      </div>

      <section className="eaSheetSection">
        <h3>Qué existe ahora</h3>
        <div className="eaModuleList">
          {evolution.modules.map(module=><article key={module.id} className={module.state}>
            <span>{module.state==='active'?<Check/>:module.state==='forming'?<Sparkles/>:<Lock/>}</span>
            <div><strong>{module.label}</strong><small>{module.detail}</small></div>
            <em>{module.state==='active'?'Activo':module.state==='forming'?'Formándose':'Pendiente'}</em>
          </article>)}
        </div>
      </section>

      <section className="eaSheetSection">
        <h3>Evidencia acumulada por el sistema</h3>
        <div className="eaRuntimeGrid">
          <div><strong>{runtime?.memories||0}</strong><span>memorias registradas</span></div>
          <div><strong>{runtime?.workJobs?.completed||0}</strong><span>trabajos completados</span></div>
          <div><strong>{runtime?.responseTraces||0}</strong><span>respuestas trazadas</span></div>
          <div><strong>{runtime?.latestEvaluation?.score??'—'}</strong><span>última evaluación</span></div>
        </div>
      </section>

      {(selfModel?.capabilities?.length||0)>0&&<section className="eaSheetSection">
        <h3>Capacidades operativas comprobables</h3>
        <div className="eaCapabilityList">
          {selfModel!.capabilities!.map(item=><details key={item.capability}>
            <summary><strong>{item.capability}</strong><span>{item.evidence||'Ver evidencia'}</span></summary>
            <p>{item.limit||'Sin límite documentado.'}</p>
          </details>)}
        </div>
      </section>}

      <button className="eaSheetTalk" onClick={talk}><Zap/>Hablar con Hector ASI</button>
      {!evolution.championId&&<p className="eaHonesty"><Lock/>La comparación entre generaciones se activará cuando exista el primer campeón entrenado y promovido.</p>}
    </section>
  </div>;
}

function Message({message}:{message:ChatMessage}){
  const isAssistant=message.role==='assistant';
  return <article className={`haMessage ${message.role}`}>
    <div className="haMessageBody">
      {message.attachmentPreview&&<img className="haMessageImage" src={message.attachmentPreview} alt={message.attachmentName||'Archivo adjunto'}/>} 
      {message.attachmentName&&!message.attachmentPreview&&<div className="haMessageFile"><File/><span>{message.attachmentName}</span></div>}
      {isAssistant?<MarkdownMessage content={message.content}/>:<p>{message.content}</p>}
      {isAssistant&&(message.provider||message.model)&&<details className="haEvidence">
        <summary><Check/><span>Respuesta registrada</span></summary>
        <div>
          {message.provider&&<span>Proveedor <strong>{message.provider}</strong></span>}
          {message.model&&<span>Modelo <strong>{message.model}</strong></span>}
          {message.modelTier&&<span>Nivel <strong>{message.modelTier}</strong></span>}
          <span>Fallback <strong>{message.fallback?'sí':'no'}</strong></span>
        </div>
      </details>}
    </div>
  </article>;
}

function HistorySheet({history,activeId,close,fresh,open}:{history:any[];activeId?:string;close:()=>void;fresh:()=>void;open:(id:string)=>Promise<void>}){
  return <div className="haOverlay" role="dialog" aria-modal="true" aria-label="Historial de conversaciones">
    <button className="haOverlayBackdrop" onClick={close} aria-label="Cerrar historial"/>
    <section className="haSheet">
      <header><div><span>Hector ASI</span><h2>Conversaciones</h2></div><button onClick={close} aria-label="Cerrar"><X/></button></header>
      <button className="haNewChat" onClick={fresh}><Plus/>Nueva conversación</button>
      <div className="haHistoryList">
        {history.length===0?<p className="haEmptyHistory">Aún no hay conversaciones guardadas.</p>:history.map(item=><button key={item.id} className={activeId===item.id?'active':''} onClick={()=>void open(item.id)}>
          <span>{item.alias||item.title||'Sin título'}</span><small>{item.updated_at?'Guardada':'Conversación'}</small>
        </button>)}
      </div>
    </section>
  </div>;
}

function AccountSheet({user,close,logout}:{user:User;close:()=>void;logout:()=>void}){
  return <div className="haOverlay" role="dialog" aria-modal="true" aria-label="Cuenta">
    <button className="haOverlayBackdrop" onClick={close} aria-label="Cerrar cuenta"/>
    <section className="haSheet haAccountSheet">
      <header><div><span>Cuenta privada</span><h2>{user.name}</h2></div><button onClick={close} aria-label="Cerrar"><X/></button></header>
      <div className="haAccountStatus"><Sparkles/><div><strong>Hector ASI</strong><span>Sesión activa y protegida</span></div></div>
      <button className="haLogout" onClick={logout}><LogOut/>Cerrar sesión</button>
    </section>
  </div>;
}
