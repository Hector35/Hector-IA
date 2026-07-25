import {FormEvent,KeyboardEvent,useEffect,useMemo,useRef,useState} from 'react';
import {
  Activity,
  ArrowUp,
  BrainCircuit,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  History,
  Image as ImageIcon,
  Lightbulb,
  LogOut,
  Menu,
  Mic,
  Paperclip,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X
} from 'lucide-react';
import {api,type User} from './api';
import {MarkdownMessage} from './MarkdownMessage';

type Panel='menu'|'history'|'files'|'system'|'account'|null;
type ReasoningMode='auto'|'high';

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
  models?:Record<string,{label?:string;model?:string;provider?:string;role?:string;runtimeId?:string;enabled?:boolean;endpointConfigured?:boolean;mode?:string;reason?:string}>;
};

const quickActions=[
  {label:'Crear imagen',icon:ImageIcon,prompt:'Crea una imagen elegante y profesional de '},
  {label:'Investigar',icon:Search,prompt:'Investiga a fondo este tema, separa hechos, inferencias, riesgos y fuentes: '},
  {label:'Escribir',icon:PenLine,prompt:'Escribe una versión clara, elegante y convincente de '},
  {label:'Resolver',icon:Lightbulb,prompt:'Resuelve este problema desde el modelo completo, verifica el resultado y explica la decisión: '}
] as const;

function formatDate(value?:string){
  if(!value)return'Sin fecha';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return value;
  return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(date);
}

function modelName(message?:ChatMessage){
  return message?.model||message?.provider||'Héctor';
}

export function HectorChatApp(){
  const [user,setUser]=useState<User|null|undefined>();
  useEffect(()=>{api.me().then(result=>setUser(result.user)).catch(()=>setUser(null))},[]);

  if(user===undefined)return <div className="hcBoot" aria-label="Iniciando Héctor"><div className="hcBrandOrb">H</div><div className="hcBootDots"><i/><i/><i/></div></div>;
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

  return <main className="hcLogin">
    <section className="hcLoginIntro">
      <div className="hcBrandOrb large">H</div>
      <div><span>HÉCTOR OS</span><h1>Una inteligencia.<br/>Una conversación.</h1><p>Piensa, investiga, crea y ejecuta desde una interfaz privada diseñada para iPhone.</p></div>
      <small><ShieldCheck/> Sesión privada y cifrada</small>
    </section>
    <form className="hcLoginCard" onSubmit={submit}>
      <header><span>{register?'CONFIGURACIÓN INICIAL':'ACCESO PRIVADO'}</span><h2>{register?'Crear propietario':'Bienvenido'}</h2><p>{register?'Configura la cuenta principal de esta instalación.':'Continúa exactamente donde dejaste tu trabajo.'}</p></header>
      {register&&<label>Nombre<input name="name" defaultValue="Héctor" autoComplete="name" required/></label>}
      <label>Correo<input name="email" type="email" inputMode="email" autoComplete="email" required/></label>
      <label>Contraseña<input name="password" type="password" minLength={10} autoComplete={register?'new-password':'current-password'} required/></label>
      {error&&<div className="hcError" role="alert">{error}</div>}
      <button className="hcLoginSubmit" disabled={busy}>{busy?'PROCESANDO…':register?'CREAR CUENTA':'ENTRAR'}</button>
      <button className="hcLoginSwitch" type="button" onClick={()=>{setRegister(value=>!value);setError('')}}>{register?'Ya tengo cuenta':'Configurar por primera vez'}</button>
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
  const [reasoning,setReasoning]=useState<ReasoningMode>('high');
  const [listening,setListening]=useState(false);
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

  const lastAssistant=useMemo(()=>[...messages].reverse().find(message=>message.role==='assistant'),[messages]);
  const title=useMemo(()=>{
    if(!conversationId)return'Nueva conversación';
    const current=history.find(item=>item.id===conversationId);
    return current?.alias||current?.title||'Conversación';
  },[conversationId,history]);
  const runtimeLabel=busy?'HÉCTOR • RAZONANDO':`${modelName(lastAssistant)} • LISTO`;

  const clearPreview=(preview?:string)=>{
    if(!preview)return;
    URL.revokeObjectURL(preview);
    previewUrls.current.delete(preview);
  };

  const fresh=()=>{
    previewUrls.current.forEach(url=>URL.revokeObjectURL(url));
    previewUrls.current.clear();
    setConversationId(undefined);
    setMessages([]);
    setText('');
    setAttachment(undefined);
    setNotice('');
    setPanel(null);
    window.setTimeout(()=>composer.current?.focus(),50);
  };

  const openConversation=async(id:string)=>{
    setNotice('Cargando conversación');
    try{
      const result=await api.conversationMessages(id);
      setConversationId(id);
      setMessages(result.items||[]);
      setPanel(null);
    }catch(reason){
      setNotice(reason instanceof Error?reason.message:'No se pudo abrir la conversación');
      window.setTimeout(()=>setNotice(''),2200);
      return;
    }
    setNotice('');
  };

  const chooseAttachment=(file?:File)=>{
    if(!file)return;
    if(attachment?.preview)clearPreview(attachment.preview);
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
          requestText=`${userContent}\n\nArchivo privado cargado: ${selected.file.name}. Distingue claramente lo comprobado de lo inferido.`;
          await loadFiles();
        }
        const result=await api.chat(requestText,conversationId,{reasoning,deliberation:reasoning==='high'?'force':'auto'});
        setConversationId(result.conversationId||conversationId);
        setMessages(current=>[...current,{...result.message,provider:result.provider,model:result.model,fallback:result.fallback,modelTier:result.modelTier}]);
        await Promise.all([loadHistory(),loadStage()]);
      }
    }catch(reason){
      setMessages(current=>[...current,{role:'assistant',content:`No pude completar la acción: ${reason instanceof Error?reason.message:'error desconocido'}`,provider:'Héctor OS',model:'Error'}]);
    }finally{
      setBusy(false);
      setNotice('');
      window.setTimeout(()=>composer.current?.focus(),50);
    }
  };

  const startVoice=()=>{
    const SpeechRecognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SpeechRecognition){
      setNotice('El dictado no está disponible en este navegador');
      window.setTimeout(()=>setNotice(''),2200);
      return;
    }
    const recognition=new SpeechRecognition();
    recognition.lang='es-MX';
    recognition.interimResults=true;
    recognition.continuous=false;
    let finalText='';
    recognition.onstart=()=>setListening(true);
    recognition.onresult=(event:any)=>{
      let interim='';
      for(let index=event.resultIndex;index<event.results.length;index+=1){
        const transcript=event.results[index][0].transcript;
        if(event.results[index].isFinal)finalText+=transcript;
        else interim+=transcript;
      }
      setText(current=>`${current}${current&&!(current.endsWith(' '))?' ':''}${finalText||interim}`);
    };
    recognition.onerror=()=>setNotice('No se pudo iniciar el dictado');
    recognition.onend=()=>{setListening(false);window.setTimeout(()=>composer.current?.focus(),30)};
    recognition.start();
  };

  const applyQuickAction=(prompt:string)=>{
    setText(prompt);
    window.setTimeout(()=>composer.current?.focus(),30);
  };

  return <div className="hcApp">
    <header className="hcHeader">
      <button className="hcBrand" type="button" onClick={fresh} aria-label="Nueva conversación"><span>H</span><b>HÉCTOR OS</b></button>
      <button className="hcTitle" type="button" onClick={()=>setPanel('history')}><strong>{title}</strong><small>{conversationId?'Conversación privada':'Chat nuevo'}</small></button>
      <div className="hcHeaderRight">
        <button className={`hcRuntime ${busy?'thinking':''}`} type="button" onClick={()=>setPanel('system')}><i/><span>{runtimeLabel}</span></button>
        <button className="hcIconButton" type="button" onClick={()=>setPanel('menu')} aria-label="Abrir menú"><Menu/></button>
      </div>
    </header>

    <main className={`hcMain ${messages.length?'hasMessages':'empty'}`}>
      {messages.length===0?<section className="hcHero">
        <div className="hcHeroMark"><Sparkles/></div>
        <h1>¿Qué quieres crear hoy?</h1>
        <p>Pregunta, investiga, programa o inicia un proyecto.<br/>Héctor elegirá la mejor estrategia y mostrará el modelo que realmente respondió.</p>
        <div className="hcQuickActions">
          {quickActions.map(action=>{const Icon=action.icon;return <button type="button" key={action.label} onClick={()=>applyQuickAction(action.prompt)}><Icon/><span>{action.label}</span></button>})}
        </div>
      </section>:<section className="hcThread" aria-live="polite" aria-busy={busy}>
        {messages.map((message,index)=><ChatMessageView key={message.id||`${message.role}-${index}`} message={message}/>) }
        {busy&&<article className="hcMessage assistant"><div className="hcAssistantMark">H</div><div className="hcThinking"><span/><span/><span/><small>{notice||'Razonando'}</small></div></article>}
        {!busy&&notice&&<div className="hcNotice">{notice}</div>}
        <div ref={end}/>
      </section>}
    </main>

    <form className="hcComposerArea" onSubmit={send}>
      <div className="hcComposer">
        {attachment&&<div className="hcAttachment">
          {attachment.preview?<img src={attachment.preview} alt="Archivo seleccionado"/>:<FileText/>}
          <span><strong>{attachment.file.name}</strong><small>{Math.ceil(attachment.file.size/1024).toLocaleString('es-MX')} KB</small></span>
          <button type="button" onClick={()=>{clearPreview(attachment.preview);setAttachment(undefined)}} aria-label="Quitar archivo"><X/></button>
        </div>}
        <div className="hcComposeRow">
          <button className="hcAdd" type="button" onClick={()=>fileInput.current?.click()} aria-label="Adjuntar archivo"><Plus/></button>
          <AutoTextarea value={text} setValue={setText} send={send} inputRef={composer}/>
          <button className={`hcMic ${listening?'active':''}`} type="button" onClick={startVoice} aria-label="Dictar mensaje"><Mic/></button>
          <button className="hcSend" disabled={busy||(!text.trim()&&!attachment)} aria-label="Enviar"><ArrowUp/></button>
        </div>
        <button className={`hcReasoning ${reasoning==='high'?'active':''}`} type="button" onClick={()=>setReasoning(current=>current==='high'?'auto':'high')}><BrainCircuit/><span>{reasoning==='high'?'Pensamiento extendido':'Estrategia automática'}</span><i>{reasoning==='high'?'ALTO':'AUTO'}</i></button>
      </div>
      <p>Héctor puede cometer errores. Verifica la información importante.</p>
      <input ref={fileInput} type="file" hidden onChange={event=>{chooseAttachment(event.target.files?.[0]);event.currentTarget.value=''}}/>
    </form>

    {panel&&<PanelDrawer panel={panel} setPanel={setPanel} user={user} history={history} files={files} stage={stage} conversationId={conversationId} reasoning={reasoning} fresh={fresh} openConversation={openConversation} chooseAttachment={()=>fileInput.current?.click()} onLogout={onLogout}/>} 
  </div>;
}

function AutoTextarea({value,setValue,send,inputRef}:{value:string;setValue:(value:string)=>void;send:(event?:FormEvent)=>Promise<void>;inputRef:React.RefObject<HTMLTextAreaElement|null>}){
  useEffect(()=>{
    const element=inputRef.current;
    if(!element)return;
    element.style.height='auto';
    element.style.height=`${Math.min(element.scrollHeight,160)}px`;
  },[value,inputRef]);

  const keyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
    if(event.nativeEvent.isComposing)return;
    const desktop=window.matchMedia('(min-width: 901px) and (pointer: fine)').matches;
    if(desktop&&event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}
  };

  return <textarea ref={inputRef} value={value} onChange={event=>setValue(event.target.value)} onKeyDown={keyDown} rows={1} placeholder="Pregunta lo que quieras…" aria-label="Mensaje"/>;
}

function ChatMessageView({message}:{message:ChatMessage}){
  const assistant=message.role==='assistant';
  const [copied,setCopied]=useState(false);
  const copy=async()=>{
    try{
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(()=>setCopied(false),1500);
    }catch{}
  };

  return <article className={`hcMessage ${assistant?'assistant':'user'}`}>
    {assistant&&<div className="hcAssistantMark">H</div>}
    <div className="hcMessageContent">
      {message.attachmentPreview&&<img className="hcMessageImage" src={message.attachmentPreview} alt={message.attachmentName||'Adjunto'}/>} 
      {assistant?<MarkdownMessage content={message.content}/>:<p>{message.content}</p>}
      {assistant&&<footer><span><i className={message.fallback?'fallback':''}/>{modelName(message)}{message.provider&&message.provider!==message.model?` · ${message.provider}`:''}{message.fallback?' · respaldo':''}</span><button type="button" onClick={copy}>{copied?<Check/>:<Copy/>}{copied?'Copiado':'Copiar'}</button></footer>}
    </div>
  </article>;
}

function PanelDrawer({panel,setPanel,user,history,files,stage,conversationId,reasoning,fresh,openConversation,chooseAttachment,onLogout}:{
  panel:Exclude<Panel,null>;
  setPanel:(panel:Panel)=>void;
  user:User;
  history:any[];
  files:any[];
  stage:StageStatus|null;
  conversationId?:string;
  reasoning:ReasoningMode;
  fresh:()=>void;
  openConversation:(id:string)=>Promise<void>;
  chooseAttachment:()=>void;
  onLogout:()=>void;
}){
  const titles={menu:'Héctor OS',history:'Historial',files:'Archivos',system:'Sistema',account:'Cuenta'} as const;
  return <div className="hcBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPanel(null)}}>
    <aside className="hcDrawer" role="dialog" aria-modal="true" aria-label={titles[panel]}>
      <header><div><span>HÉCTOR OS</span><h2>{titles[panel]}</h2></div><button type="button" onClick={()=>setPanel(null)} aria-label="Cerrar"><X/></button></header>

      {panel==='menu'&&<div className="hcMenu">
        <button type="button" className="primary" onClick={fresh}><Plus/><span><strong>Nueva conversación</strong><small>Empieza con contexto limpio</small></span></button>
        <button type="button" onClick={()=>setPanel('history')}><History/><span><strong>Historial</strong><small>{history.length.toLocaleString('es-MX')} conversaciones disponibles</small></span><ChevronRight/></button>
        <button type="button" onClick={()=>setPanel('files')}><Folder/><span><strong>Archivos</strong><small>{files.length.toLocaleString('es-MX')} elementos privados</small></span><ChevronRight/></button>
        <button type="button" onClick={()=>setPanel('system')}><Activity/><span><strong>Inteligencia</strong><small>Modelo efectivo y telemetría real</small></span><ChevronRight/></button>
        <button type="button" onClick={()=>setPanel('account')}><UserRound/><span><strong>{user.name}</strong><small>Cuenta y sesión privada</small></span><ChevronRight/></button>
      </div>}

      {panel==='history'&&<div className="hcDrawerBody">
        <button className="hcDrawerPrimary" type="button" onClick={fresh}><Plus/> Nueva conversación</button>
        <div className="hcHistoryList">
          {history.length===0&&<DrawerEmpty icon={<History/>} title="Sin conversaciones" text="Tu primer mensaje aparecerá aquí."/>}
          {history.map(item=><button type="button" key={item.id} className={item.id===conversationId?'active':''} onClick={()=>void openConversation(item.id)}><span><strong>{item.alias||item.title||'Conversación'}</strong><small>{formatDate(item.updated_at||item.created_at)}</small></span><ChevronRight/></button>)}
        </div>
      </div>}

      {panel==='files'&&<div className="hcDrawerBody">
        <button className="hcDrawerPrimary" type="button" onClick={chooseAttachment}><Paperclip/> Adjuntar al chat</button>
        <div className="hcFileList">
          {files.length===0&&<DrawerEmpty icon={<Folder/>} title="Sin archivos" text="Adjunta un archivo y se guardará de forma privada."/>}
          {files.map(item=><a key={item.id} href={`/api/files/${item.id}/download`}><FileText/><span><strong>{item.name}</strong><small>{Math.ceil(Number(item.size_bytes||0)/1024).toLocaleString('es-MX')} KB</small></span></a>)}
        </div>
      </div>}

      {panel==='system'&&<div className="hcDrawerBody">
        <section className="hcSystemHero"><div><i/><span>ESTADO ACTUAL</span></div><strong>{stage?.name||stage?.status||(stage?.stage?`Etapa ${stage.stage}`:'Telemetría no disponible')}</strong><p>{stage?.principle||'Sólo se muestran datos confirmados por el backend.'}</p></section>
        <section className="hcSystemSection"><header><h3>Modo cognitivo</h3><span>{reasoning==='high'?'Alto':'Automático'}</span></header><div className="hcSystemRow"><BrainCircuit/><span><strong>{reasoning==='high'?'Pensamiento extendido':'Selección automática'}</strong><small>{stage?.reasoning?.description||'La estrategia se ajusta al tipo de tarea.'}</small></span></div></section>
        <section className="hcSystemSection"><header><h3>Modelos reportados</h3><span>{stage?.models?Object.keys(stage.models).length:0}</span></header><div className="hcModelList">
          {!stage?.models&&<p>El backend no devolvió telemetría verificable.</p>}
          {stage?.models&&Object.entries(stage.models).map(([key,value])=><article key={key}><i className={value.endpointConfigured===false?'off':''}/><span><strong>{value.label||value.model||value.runtimeId||key}</strong><small>{value.role||value.mode||value.reason||value.provider||'Disponible'}</small></span></article>)}
        </div></section>
      </div>}

      {panel==='account'&&<div className="hcDrawerBody"><section className="hcAccount"><div>{user.name.slice(0,1).toUpperCase()}</div><strong>{user.name}</strong><span>Propietario de Héctor OS</span><small><ShieldCheck/> Sesión privada activa</small></section><button className="hcLogout" type="button" onClick={onLogout}><LogOut/> Cerrar sesión</button></div>}
    </aside>
  </div>;
}

function DrawerEmpty({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){
  return <div className="hcDrawerEmpty"><div>{icon}</div><strong>{title}</strong><p>{text}</p></div>;
}
