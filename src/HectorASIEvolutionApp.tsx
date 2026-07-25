import {FormEvent,KeyboardEvent,useEffect,useMemo,useRef,useState} from 'react';
import {
  Activity,
  ArrowUp,
  BrainCircuit,
  Check,
  Clock3,
  Copy,
  Database,
  FileText,
  Folder,
  History,
  LogOut,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  Shield,
  Sparkles,
  X
} from 'lucide-react';
import {api,type User} from './api';
import {MarkdownMessage} from './MarkdownMessage';

type Panel='menu'|'history'|'files'|'system'|null;

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

type StageStatus={
  stage?:number;
  name?:string;
  status?:string;
  principle?:string;
  reasoning?:{effort?:string;deliberation?:string;description?:string};
  models?:{
    qwen397?:{label?:string;model?:string;endpointConfigured?:boolean;mode?:string;reason?:string;totalParameters?:string;activeParameters?:string;contextLength?:number};
    kimi?:{label?:string;model?:string;endpointConfigured?:boolean;mode?:string;reason?:string};
    open?:{model?:string;role?:string};
    own?:{label?:string;runtimeId?:string;mode?:string;enabled?:boolean};
    teacher?:{model?:string;provider?:string;role?:string};
  };
  pipeline?:Array<{id:string;label:string;target:number;stretchTarget?:number;unit:string;observed?:number}>;
};

type ModelSnapshot={label:string;provider:string;fallback:boolean;known:boolean};

function messageModel(message?:ChatMessage):ModelSnapshot{
  if(!message)return{label:'Ruta automática',provider:'El modelo aparecerá después de responder',fallback:false,known:false};
  return{
    label:message.model||'Modelo no reportado',
    provider:message.provider||'Proveedor no reportado',
    fallback:Boolean(message.fallback),
    known:Boolean(message.model||message.provider)
  };
}

function formatDate(value?:string){
  if(!value)return'Sin fecha';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return value;
  return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(date);
}

export function HectorASIEvolutionApp(){
  const [user,setUser]=useState<User|null|undefined>();
  useEffect(()=>{api.me().then(result=>setUser(result.user)).catch(()=>setUser(null))},[]);
  if(user===undefined)return <div className="hxBoot"><span>H</span><p>INICIANDO</p></div>;
  if(!user)return <Login onDone={setUser}/>;
  return <Workspace user={user} onLogout={()=>api.logout().finally(()=>setUser(null))}/>;
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
  return <main className="hxLogin">
    <section className="hxLoginBrand">
      <div className="hxMark">H</div>
      <div className="hxLoginStatement"><h1>HÉCTOR</h1><p>Una sola conversación para pensar, investigar y ejecutar.</p></div>
      <small><Shield/> Sesión privada</small>
    </section>
    <form className="hxLoginForm" onSubmit={submit}>
      <div><span>{register?'CONFIGURACIÓN INICIAL':'HÉCTOR OS'}</span><h2>{register?'Crear cuenta':'Bienvenido'}</h2><p>{register?'Registra al propietario de esta instalación.':'Continúa donde dejaste tu trabajo.'}</p></div>
      {register&&<label>Nombre<input name="name" defaultValue="Héctor" autoComplete="name" required/></label>}
      <label>Correo<input name="email" type="email" inputMode="email" autoComplete="email" required/></label>
      <label>Contraseña<input name="password" type="password" minLength={10} autoComplete={register?'new-password':'current-password'} required/></label>
      {error&&<div className="hxError" role="alert">{error}</div>}
      <button className="hxPrimary" disabled={busy}>{busy?'PROCESANDO…':register?'CREAR CUENTA':'ENTRAR'}</button>
      <button className="hxLink" type="button" onClick={()=>{setRegister(value=>!value);setError('')}}>{register?'Ya tengo cuenta':'Configurar por primera vez'}</button>
    </form>
  </main>;
}

function Workspace({user,onLogout}:{user:User;onLogout:()=>void}){
  const [panel,setPanel]=useState<Panel>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [history,setHistory]=useState<any[]>([]);
  const [files,setFiles]=useState<any[]>([]);
  const [stage,setStage]=useState<StageStatus|null>(null);
  const [conversationId,setConversationId]=useState<string>();
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [attachment,setAttachment]=useState<PendingAttachment>();
  const fileInput=useRef<HTMLInputElement>(null);
  const composer=useRef<HTMLTextAreaElement>(null);
  const end=useRef<HTMLDivElement>(null);
  const previewUrls=useRef(new Set<string>());

  const loadHistory=()=>api.conversations().then(result=>setHistory(result.items||[])).catch(()=>setHistory([]));
  const loadFiles=()=>api.files().then(result=>setFiles(result.items||[])).catch(()=>setFiles([]));
  const loadStage=()=>api.stageSix().then(setStage).catch(()=>setStage(null));

  useEffect(()=>{void Promise.all([loadHistory(),loadFiles(),loadStage()])},[]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:messages.length?'smooth':'auto',block:'end'})},[messages,busy,notice]);
  useEffect(()=>()=>{previewUrls.current.forEach(url=>URL.revokeObjectURL(url))},[]);
  useEffect(()=>{
    const close=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape')setPanel(null)};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[]);
  useEffect(()=>{
    const refresh=(event:Event)=>{
      const id=(event as CustomEvent<{conversationId?:string}>).detail?.conversationId;
      void loadHistory();
      if(id&&id===conversationId){
        void api.conversationMessages(id).then(result=>setMessages(result.items||[]));
      }
    };
    window.addEventListener('hector:conversation-updated',refresh);
    return()=>window.removeEventListener('hector:conversation-updated',refresh);
  },[conversationId]);

  const lastAssistant=useMemo(()=>[...messages].reverse().find(item=>item.role==='assistant'),[messages]);
  const effective=messageModel(lastAssistant);
  const title=useMemo(()=>{
    if(!conversationId)return'Nueva conversación';
    const current=history.find(item=>item.id===conversationId);
    return current?.alias||current?.title||'Conversación';
  },[conversationId,history]);

  const fresh=()=>{
    previewUrls.current.forEach(url=>URL.revokeObjectURL(url));
    previewUrls.current.clear();
    setConversationId(undefined);
    setMessages([]);
    setText('');
    setAttachment(undefined);
    setNotice('');
    setPanel(null);
    window.setTimeout(()=>composer.current?.focus(),40);
  };

  const openConversation=async(id:string)=>{
    previewUrls.current.forEach(url=>URL.revokeObjectURL(url));
    previewUrls.current.clear();
    setAttachment(undefined);
    setNotice('Cargando conversación');
    try{
      const result=await api.conversationMessages(id);
      setConversationId(id);
      setMessages(result.items||[]);
      setPanel(null);
    }catch(reason){
      setNotice(reason instanceof Error?reason.message:'No se pudo abrir la conversación');
      window.setTimeout(()=>setNotice(''),2400);
      return;
    }
    setNotice('');
  };

  const chooseAttachment=(file?:File)=>{
    if(!file)return;
    const preview=file.type.startsWith('image/')?URL.createObjectURL(file):undefined;
    if(preview)previewUrls.current.add(preview);
    setAttachment({file,preview});
    setPanel(null);
    window.setTimeout(()=>composer.current?.focus(),40);
  };

  const send=async(event?:FormEvent)=>{
    event?.preventDefault();
    const prompt=text.trim();
    if((!prompt&&!attachment)||busy)return;
    const selected=attachment;
    const userContent=prompt||(selected?.file.type.startsWith('image/')?'Analiza esta imagen.':'Analiza este archivo.');
    setText('');
    setAttachment(undefined);
    setMessages(current=>[...current,{role:'user',content:userContent,attachmentName:selected?.file.name,attachmentPreview:selected?.preview}]);
    setBusy(true);
    setNotice(selected?'Procesando archivo':'Razonando');
    try{
      if(selected?.file.type.startsWith('image/')){
        const result=await api.vision(selected.file,userContent);
        setMessages(current=>[...current,{role:'assistant',content:result.answer||'Imagen procesada.',provider:result.provider,model:result.model,fallback:result.fallback,modelTier:'vision'}]);
      }else{
        let requestText=userContent;
        if(selected){
          await api.upload(selected.file);
          requestText=`${userContent}\n\nArchivo privado cargado: ${selected.file.name}. Indica exactamente qué pudiste comprobar.`;
          await loadFiles();
        }
        const result=await api.chat(requestText,conversationId,{reasoning:'high',deliberation:'auto'});
        setConversationId(result.conversationId);
        setMessages(current=>[...current,{...result.message,provider:result.provider,model:result.model,fallback:result.fallback,modelTier:result.modelTier}]);
        await Promise.all([loadHistory(),loadStage()]);
      }
    }catch(reason){
      setMessages(current=>[...current,{role:'assistant',content:`No pude completar la acción: ${reason instanceof Error?reason.message:'error desconocido'}`,provider:'Héctor OS',model:'Error'}]);
    }finally{
      setBusy(false);
      setNotice('');
      window.setTimeout(()=>composer.current?.focus(),40);
    }
  };

  const openTraining=(messageId?:string)=>{
    window.dispatchEvent(new CustomEvent('hector:open-training',{detail:{conversationId,messageId}}));
    setPanel(null);
  };

  return <div className="hxApp">
    <section className="hxShell">
      <header className="hxHeader">
        <button className="hxLogo" type="button" onClick={fresh} aria-label="Nueva conversación">H</button>
        <button className="hxConversationMeta" type="button" onClick={()=>setPanel('system')}>
          <strong>{title}</strong>
          <span className={effective.fallback?'fallback':''}><i/>{effective.label}</span>
        </button>
        <div className="hxHeaderActions">
          <button type="button" onClick={fresh} aria-label="Nueva conversación" title="Nueva conversación"><Plus/></button>
          <button type="button" onClick={()=>setPanel('history')} aria-label="Abrir historial" title="Historial"><History/></button>
          <button type="button" onClick={()=>setPanel('menu')} aria-label="Abrir menú" title="Menú"><Menu/></button>
        </div>
      </header>

      <ChatView
        messages={messages}
        conversationId={conversationId}
        busy={busy}
        notice={notice}
        attachment={attachment}
        text={text}
        setText={setText}
        setAttachment={setAttachment}
        chooseAttachment={chooseAttachment}
        send={send}
        openTraining={openTraining}
        composer={composer}
        fileInput={fileInput}
        end={end}
      />
    </section>

    {panel&&<UtilityPanel
      panel={panel}
      setPanel={setPanel}
      user={user}
      effective={effective}
      stage={stage}
      history={history}
      files={files}
      activeId={conversationId}
      fresh={fresh}
      openConversation={openConversation}
      openTraining={openTraining}
      fileInput={fileInput}
      onLogout={onLogout}
    />}
  </div>;
}

function ChatView({messages,conversationId,busy,notice,attachment,text,setText,setAttachment,chooseAttachment,send,openTraining,composer,fileInput,end}:{
  messages:ChatMessage[];
  conversationId?:string;
  busy:boolean;
  notice:string;
  attachment:PendingAttachment|undefined;
  text:string;
  setText:(value:string)=>void;
  setAttachment:(value:PendingAttachment|undefined)=>void;
  chooseAttachment:(file?:File)=>void;
  send:(event?:FormEvent)=>Promise<void>;
  openTraining:(messageId?:string)=>void;
  composer:React.RefObject<HTMLTextAreaElement|null>;
  fileInput:React.RefObject<HTMLInputElement|null>;
  end:React.RefObject<HTMLDivElement|null>;
}){
  useEffect(()=>{
    const element=composer.current;
    if(!element)return;
    element.style.height='auto';
    element.style.height=`${Math.min(element.scrollHeight,168)}px`;
  },[text,composer]);

  const keyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
    if(event.nativeEvent.isComposing)return;
    const desktop=window.matchMedia('(min-width: 901px) and (pointer: fine)').matches;
    if(desktop&&event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}
  };

  return <main className="hxChat">
    <section className="hxThread" aria-live="polite" aria-busy={busy}>
      {messages.length===0&&<div className="hxEmpty">
        <div className="hxEmptyMark"><Sparkles/></div>
        <h1>¿Qué hacemos?</h1>
        <p>Describe el resultado que necesitas. Héctor elegirá la ruta, mostrará qué modelo respondió y conservará el trabajo en esta conversación.</p>
        <div className="hxPrompts">
          <button type="button" onClick={()=>{setText('Audita el estado real de Héctor OS, identifica el cuello de botella principal y propón la siguiente mejora verificable.');composer.current?.focus()}}>Auditar Héctor</button>
          <button type="button" onClick={()=>{setText('Investiga este problema y separa hechos comprobados, inferencias, riesgos y próximos pasos.');composer.current?.focus()}}>Investigar</button>
          <button type="button" onClick={()=>{setText('Convierte este objetivo en un plan ejecutable con criterios de éxito, pruebas y recuperación ante fallos.');composer.current?.focus()}}>Construir un plan</button>
        </div>
      </div>}
      {messages.map((message,index)=><Message
        key={message.id||`${message.role}-${index}`}
        message={message}
        canTrain={Boolean(conversationId&&message.role==='assistant')}
        onTrain={()=>openTraining(message.id)}
      />)}
      {busy&&<article className="hxMessage assistant hxThinking"><div className="hxRole">H</div><div className="hxThinkingBody"><span/><span/><span/><small>{notice||'Razonando'}</small></div></article>}
      {!busy&&notice&&<div className="hxNotice"><Clock3/>{notice}</div>}
      <div ref={end}/>
    </section>

    <form className="hxComposer" onSubmit={send}>
      <div className="hxComposerFrame">
        {attachment&&<div className="hxAttachment">
          {attachment.preview?<img src={attachment.preview} alt="Archivo seleccionado"/>:<FileText/>}
          <span><strong>{attachment.file.name}</strong><small>{Math.ceil(attachment.file.size/1024).toLocaleString('es-MX')} KB</small></span>
          <button type="button" onClick={()=>setAttachment(undefined)} aria-label="Quitar archivo"><X/></button>
        </div>}
        <div className="hxComposeRow">
          <button type="button" className="hxAttach" onClick={()=>fileInput.current?.click()} aria-label="Adjuntar archivo" title="Adjuntar"><Paperclip/></button>
          <textarea ref={composer} value={text} onChange={event=>setText(event.target.value)} onKeyDown={keyDown} rows={1} placeholder="Escribe una instrucción…" aria-label="Mensaje"/>
          <button className="hxSend" aria-label="Enviar" disabled={busy||(!text.trim()&&!attachment)}><ArrowUp/></button>
        </div>
      </div>
      <div className="hxComposeMeta"><span className="hxDesktopHint">Enter envía · Shift+Enter crea una línea</span><span className="hxMobileHint">El botón ↑ envía el mensaje</span><span>Héctor puede cometer errores; verifica decisiones importantes.</span></div>
      <input ref={fileInput} type="file" hidden onChange={event=>{chooseAttachment(event.target.files?.[0]);event.currentTarget.value=''}}/>
    </form>
  </main>;
}

function Message({message,canTrain,onTrain}:{message:ChatMessage;canTrain:boolean;onTrain:()=>void}){
  const assistant=message.role==='assistant';
  const [copied,setCopied]=useState(false);
  const copy=async()=>{
    try{
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(()=>setCopied(false),1600);
    }catch{}
  };
  return <article className={`hxMessage ${assistant?'assistant':'user'}`}>
    <div className="hxRole">{assistant?'H':'TÚ'}</div>
    <div className="hxMessageBody">
      {message.attachmentPreview&&<img className="hxMessageImage" src={message.attachmentPreview} alt={message.attachmentName||'Adjunto'}/>}
      {assistant?<MarkdownMessage content={message.content}/>:<p>{message.content}</p>}
      {assistant&&<footer>
        <div className="hxModelMeta"><span>{message.model||'Modelo no reportado'}</span><small>{message.provider||'Proveedor no reportado'}{message.fallback?' · fallback':''}</small></div>
        <div className="hxMessageActions">
          <button type="button" onClick={copy}>{copied?<Check/>:<Copy/>}<span>{copied?'Copiado':'Copiar'}</span></button>
          {canTrain&&<button type="button" onClick={onTrain}><BrainCircuit/><span>Corregir</span></button>}
        </div>
      </footer>}
    </div>
  </article>;
}

function UtilityPanel({panel,setPanel,user,effective,stage,history,files,activeId,fresh,openConversation,openTraining,fileInput,onLogout}:{
  panel:Exclude<Panel,null>;
  setPanel:(panel:Panel)=>void;
  user:User;
  effective:ModelSnapshot;
  stage:StageStatus|null;
  history:any[];
  files:any[];
  activeId?:string;
  fresh:()=>void;
  openConversation:(id:string)=>Promise<void>;
  openTraining:(messageId?:string)=>void;
  fileInput:React.RefObject<HTMLInputElement|null>;
  onLogout:()=>void;
}){
  const titles={menu:'Menú',history:'Historial',files:'Archivos',system:'Sistema'} as const;
  return <div className="hxPanelBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPanel(null)}}>
    <aside className="hxPanel" role="dialog" aria-modal="true" aria-label={titles[panel]}>
      <header><div><span>HÉCTOR OS</span><h2>{titles[panel]}</h2></div><button type="button" onClick={()=>setPanel(null)} aria-label="Cerrar"><X/></button></header>

      {panel==='menu'&&<div className="hxMenuList">
        <button type="button" onClick={()=>setPanel('system')}><Activity/><span><strong>Estado del sistema</strong><small>Modelo efectivo, rutas y progreso confirmado</small></span></button>
        <button type="button" onClick={()=>setPanel('files')}><Folder/><span><strong>Archivos</strong><small>Adjunta o descarga tu biblioteca privada</small></span></button>
        <button type="button" onClick={()=>openTraining()}><BrainCircuit/><span><strong>Enseñar a Héctor</strong><small>Corrige respuestas con revisión supervisada</small></span></button>
        <div className="hxMenuIdentity"><div>{user.name.slice(0,1).toUpperCase()}</div><span><strong>{user.name}</strong><small>Sesión privada activa</small></span></div>
        <button type="button" className="danger" onClick={onLogout}><LogOut/><span><strong>Cerrar sesión</strong><small>Finaliza esta sesión en el dispositivo</small></span></button>
      </div>}

      {panel==='history'&&<div className="hxPanelBody">
        <button className="hxPanelPrimary" type="button" onClick={fresh}><Plus/> Nueva conversación</button>
        <div className="hxHistoryList">
          {history.length===0&&<PanelEmpty icon={<MessageSquare/>} title="Todavía no hay conversaciones" text="Tu siguiente mensaje creará la primera."/>}
          {history.map(item=><button type="button" key={item.id} className={activeId===item.id?'active':''} onClick={()=>void openConversation(item.id)}>
            <MessageSquare/><span><strong>{item.alias||item.title||'Conversación'}</strong><small>{formatDate(item.updated_at||item.created_at)}</small></span>
          </button>)}
        </div>
      </div>}

      {panel==='files'&&<div className="hxPanelBody">
        <button className="hxPanelPrimary" type="button" onClick={()=>fileInput.current?.click()}><Paperclip/> Adjuntar al chat</button>
        <div className="hxFileList">
          {files.length===0&&<PanelEmpty icon={<Folder/>} title="No hay archivos guardados" text="Adjunta uno y aparecerá aquí de forma privada."/>}
          {files.map(item=><a href={`/api/files/${item.id}/download`} key={item.id}>
            <FileText/><span><strong>{item.name}</strong><small>{Math.ceil(Number(item.size_bytes||0)/1024).toLocaleString('es-MX')} KB</small></span>
          </a>)}
        </div>
      </div>}

      {panel==='system'&&<SystemPanel stage={stage} effective={effective}/>} 
    </aside>
  </div>;
}

function SystemPanel({stage,effective}:{stage:StageStatus|null;effective:ModelSnapshot}){
  if(!stage)return <div className="hxPanelBody"><PanelEmpty icon={<Activity/>} title="Telemetría no disponible" text="No se recibió un estado verificable del sistema. No se mostrarán cifras ni modelos predeterminados."/></div>;
  const qwen=stage.models?.qwen397;
  const kimi=stage.models?.kimi;
  const open=stage.models?.open;
  const own=stage.models?.own;
  const teacher=stage.models?.teacher;
  const routes=[
    qwen&&{name:qwen.label||qwen.model||'Qwen',detail:qwen.model||qwen.reason||'Sin detalle',state:qwen.endpointConfigured?'Configurado':'No configurado'},
    kimi&&{name:kimi.label||kimi.model||'Kimi',detail:kimi.model||kimi.reason||'Sin detalle',state:kimi.endpointConfigured?'Configurado':'Respaldo'},
    open&&{name:open.model||'Proveedor abierto',detail:open.role||'Sin función reportada',state:'Disponible'}
  ].filter(Boolean) as Array<{name:string;detail:string;state:string}>;
  const facts=[
    own&&(own.label||own.runtimeId)&&{label:'Modelo propio',value:own.label||own.runtimeId||'',detail:own.mode||'Sin modo reportado'},
    teacher?.model&&{label:'Maestro',value:teacher.model,detail:teacher.role||teacher.provider||'Sin función reportada'},
    qwen?.contextLength&&{label:'Contexto',value:`${Math.round(qwen.contextLength/1024)}K`,detail:'Ventana reportada'},
    qwen?.activeParameters&&{label:'Parámetros activos',value:qwen.activeParameters,detail:'Por token'}
  ].filter(Boolean) as Array<{label:string;value:string;detail:string}>;
  return <div className="hxSystemPanel">
    <section className="hxEffectiveCard">
      <span>ÚLTIMA RESPUESTA</span>
      <div><i className={effective.fallback?'fallback':''}/><strong>{effective.label}</strong></div>
      <p>{effective.provider}{effective.fallback?' · se utilizó una ruta de respaldo':''}</p>
    </section>

    <section className="hxPanelSection">
      <header><h3>Ruta de inferencia</h3><small>{routes.length?`${routes.length} rutas reportadas`:'Sin rutas reportadas'}</small></header>
      <div className="hxRouteList">
        {routes.length===0&&<p className="hxMuted">El backend no reportó rutas de inferencia.</p>}
        {routes.map((item,index)=><article key={`${item.name}-${index}`}><b>{index+1}</b><span><strong>{item.name}</strong><small>{item.detail}</small></span><em>{item.state}</em></article>)}
      </div>
    </section>

    {facts.length>0&&<section className="hxFactGrid">{facts.map(item=><article key={item.label}><Database/><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></article>)}</section>}

    <section className="hxPanelSection">
      <header><h3>Entrenamiento</h3><small>Sólo datos confirmados</small></header>
      <div className="hxGateList">
        {(stage.pipeline||[]).length===0&&<p className="hxMuted">No hay métricas de entrenamiento integradas.</p>}
        {(stage.pipeline||[]).map(item=><article key={item.id}><div>{typeof item.observed==='number'?<Check/>:<Clock3/>}</div><span><strong>{item.label}</strong><small>{typeof item.observed==='number'?`${item.observed.toLocaleString('es-MX')} registrados`:'Sin observación confirmada'}</small></span><b>{item.target.toLocaleString('es-MX')} {item.unit}</b></article>)}
      </div>
    </section>

    {stage.principle&&<p className="hxPrinciple">{stage.principle}</p>}
  </div>;
}

function PanelEmpty({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){
  return <div className="hxPanelEmpty"><div>{icon}</div><strong>{title}</strong><p>{text}</p></div>;
}
