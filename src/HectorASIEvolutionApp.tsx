import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {
  Activity,
  ArrowUp,
  Check,
  Clock3,
  Cpu,
  Database,
  FileText,
  Folder,
  History,
  LogOut,
  MessageSquare,
  Network,
  Paperclip,
  Plus,
  Shield,
  Target,
  X
} from 'lucide-react';
import {api,type User} from './api';
import {MarkdownMessage} from './MarkdownMessage';

type View='chat'|'system'|'history'|'files';

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

const nav:Array<{id:View;label:string;icon:typeof MessageSquare}>=[
  {id:'chat',label:'Chat',icon:MessageSquare},
  {id:'system',label:'Sistema',icon:Activity},
  {id:'history',label:'Historial',icon:History},
  {id:'files',label:'Archivos',icon:Folder}
];

function messageModel(message?:ChatMessage){
  if(!message)return{model:'Sin respuesta todavía',provider:'—',fallback:false};
  return{model:message.model||'Modelo no reportado',provider:message.provider||'Proveedor no reportado',fallback:Boolean(message.fallback)};
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
      <h1>HÉCTOR<br/>OS</h1>
      <p>Una sola interfaz. Un solo objetivo. Resolver.</p>
      <small><Shield/> Sesión privada</small>
    </section>
    <form className="hxLoginForm" onSubmit={submit}>
      <div><span>{register?'NUEVO PROPIETARIO':'ACCESO'}</span><h2>{register?'Crear cuenta':'Entrar'}</h2></div>
      {register&&<label>Nombre<input name="name" defaultValue="Héctor" autoComplete="name" required/></label>}
      <label>Correo<input name="email" type="email" autoComplete="email" required/></label>
      <label>Contraseña<input name="password" type="password" minLength={10} autoComplete={register?'new-password':'current-password'} required/></label>
      {error&&<div className="hxError" role="alert">{error}</div>}
      <button className="hxPrimary" disabled={busy}>{busy?'PROCESANDO':register?'CREAR':'ENTRAR'}</button>
      <button className="hxLink" type="button" onClick={()=>setRegister(value=>!value)}>{register?'Ya tengo cuenta':'Configurar por primera vez'}</button>
    </form>
  </main>;
}

function Workspace({user,onLogout}:{user:User;onLogout:()=>void}){
  const [view,setView]=useState<View>('chat');
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

  const loadHistory=()=>api.conversations().then(result=>setHistory(result.items||[])).catch(()=>setHistory([]));
  const loadFiles=()=>api.files().then(result=>setFiles(result.items||[])).catch(()=>setFiles([]));
  const loadStage=()=>api.stageSix().then(setStage).catch(()=>setStage(null));

  useEffect(()=>{void Promise.all([loadHistory(),loadFiles(),loadStage()])},[]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:messages.length?'smooth':'auto',block:'end'})},[messages,busy,notice]);

  const lastAssistant=useMemo(()=>[...messages].reverse().find(item=>item.role==='assistant'),[messages]);
  const effective=messageModel(lastAssistant);
  const title=useMemo(()=>{
    if(!conversationId)return'Nueva conversación';
    const current=history.find(item=>item.id===conversationId);
    return current?.alias||current?.title||'Conversación';
  },[conversationId,history]);

  const fresh=()=>{
    setConversationId(undefined);
    setMessages([]);
    setText('');
    setAttachment(undefined);
    setNotice('');
    setView('chat');
    window.setTimeout(()=>composer.current?.focus(),40);
  };

  const openConversation=async(id:string)=>{
    setNotice('Cargando conversación');
    try{
      const result=await api.conversationMessages(id);
      setConversationId(id);
      setMessages(result.items||[]);
      setView('chat');
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
      setMessages(current=>[...current,{role:'assistant',content:`No pude completar la acción: ${reason instanceof Error?reason.message:'error desconocido'}`,provider:'system',model:'error'}]);
    }finally{
      setBusy(false);
      setNotice('');
    }
  };

  return <div className="hxApp">
    <aside className="hxRail">
      <button className="hxLogo" type="button" onClick={fresh} aria-label="Nuevo chat">H</button>
      <nav>{nav.map(item=>{
        const Icon=item.icon;
        return <button type="button" key={item.id} className={view===item.id?'active':''} onClick={()=>setView(item.id)} aria-label={item.label}><Icon/><span>{item.label}</span></button>;
      })}</nav>
      <button className="hxLogout" type="button" onClick={onLogout} aria-label="Cerrar sesión"><LogOut/><span>Salir</span></button>
    </aside>

    <section className="hxSurface">
      <header className="hxHeader">
        <div><span>HÉCTOR OS</span><strong>{view==='chat'?title:nav.find(item=>item.id===view)?.label}</strong></div>
        <button className={`hxRuntime ${effective.fallback?'fallback':''}`} type="button" onClick={()=>setView('system')}>
          <i/>
          <span><small>RESPONDIÓ</small><b>{effective.model}</b></span>
        </button>
        <button className="hxUser" type="button" onClick={onLogout} aria-label="Cerrar sesión">{user.name.slice(0,1).toUpperCase()}</button>
      </header>

      {view==='chat'&&<ChatView
        messages={messages}
        busy={busy}
        notice={notice}
        attachment={attachment}
        text={text}
        setText={setText}
        setAttachment={setAttachment}
        chooseAttachment={chooseAttachment}
        send={send}
        fresh={fresh}
        composer={composer}
        fileInput={fileInput}
        end={end}
      />}
      {view==='system'&&<SystemView stage={stage} effective={effective}/>} 
      {view==='history'&&<HistoryView items={history} activeId={conversationId} fresh={fresh} open={openConversation}/>} 
      {view==='files'&&<FilesView items={files} chooseAttachment={chooseAttachment} sendToChat={()=>setView('chat')} fileInput={fileInput}/>} 
    </section>

    <nav className="hxMobileNav">{nav.map(item=>{
      const Icon=item.icon;
      return <button type="button" key={item.id} className={view===item.id?'active':''} onClick={()=>setView(item.id)}><Icon/><span>{item.label}</span></button>;
    })}</nav>
  </div>;
}

function ChatView({messages,busy,notice,attachment,text,setText,setAttachment,chooseAttachment,send,fresh,composer,fileInput,end}:{
  messages:ChatMessage[];
  busy:boolean;
  notice:string;
  attachment:PendingAttachment|undefined;
  text:string;
  setText:(value:string)=>void;
  setAttachment:(value:PendingAttachment|undefined)=>void;
  chooseAttachment:(file?:File)=>void;
  send:(event?:FormEvent)=>Promise<void>;
  fresh:()=>void;
  composer:React.RefObject<HTMLTextAreaElement|null>;
  fileInput:React.RefObject<HTMLInputElement|null>;
  end:React.RefObject<HTMLDivElement|null>;
}){
  return <main className="hxChat">
    <section className="hxThread" aria-live="polite">
      {messages.length===0&&<div className="hxEmpty">
        <h1>¿QUÉ<br/>HACEMOS?</h1>
        <p>Pregunta, investiga, programa o inicia un trabajo. La respuesta mostrará el modelo que realmente contestó.</p>
        <div className="hxPrompts">
          <button type="button" onClick={()=>setText('Analiza el estado real de Héctor OS y dime el siguiente cuello de botella.')}>Auditar Héctor</button>
          <button type="button" onClick={()=>setText('Investiga una solución y separa hechos, inferencias y límites.')}>Investigar</button>
          <button type="button" onClick={()=>setText('Diseña un plan ejecutable con pruebas y rollback.')}>Planificar</button>
        </div>
      </div>}
      {messages.map((message,index)=><Message key={message.id||`${message.role}-${index}`} message={message}/>) }
      {busy&&<article className="hxMessage assistant hxThinking"><div className="hxRole">H</div><div><span/><span/><span/></div></article>}
      {notice&&<div className="hxNotice"><Clock3/>{notice}</div>}
      <div ref={end}/>
    </section>

    <form className="hxComposer" onSubmit={send}>
      {attachment&&<div className="hxAttachment">
        {attachment.preview?<img src={attachment.preview} alt="Archivo seleccionado"/>:<FileText/>}
        <span>{attachment.file.name}</span>
        <button type="button" onClick={()=>setAttachment(undefined)} aria-label="Quitar archivo"><X/></button>
      </div>}
      <div className="hxComposeRow">
        <button type="button" className="hxAttach" onClick={()=>fileInput.current?.click()} aria-label="Adjuntar"><Paperclip/></button>
        <textarea ref={composer} value={text} onChange={event=>setText(event.target.value)} onKeyDown={event=>{
          if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}
        }} rows={1} placeholder="Escribe una instrucción…" aria-label="Mensaje"/>
        <button className="hxSend" aria-label="Enviar" disabled={busy||(!text.trim()&&!attachment)}><ArrowUp/></button>
      </div>
      <div className="hxComposeMeta"><button type="button" onClick={fresh}><Plus/> NUEVO</button><span>ENTER PARA ENVIAR · SHIFT+ENTER PARA SALTO</span></div>
      <input ref={fileInput} type="file" hidden onChange={event=>{chooseAttachment(event.target.files?.[0]);event.currentTarget.value=''}}/>
    </form>
  </main>;
}

function Message({message}:{message:ChatMessage}){
  const assistant=message.role==='assistant';
  return <article className={`hxMessage ${assistant?'assistant':'user'}`}>
    <div className="hxRole">{assistant?'H':'TÚ'}</div>
    <div className="hxMessageBody">
      {message.attachmentPreview&&<img className="hxMessageImage" src={message.attachmentPreview} alt={message.attachmentName||'Adjunto'}/>} 
      {assistant?<MarkdownMessage content={message.content}/>:<p>{message.content}</p>}
      {assistant&&<footer>
        <span>{message.provider||'proveedor no reportado'}</span>
        <b>{message.model||'modelo no reportado'}</b>
        {message.fallback&&<em>FALLBACK</em>}
      </footer>}
    </div>
  </article>;
}

function SystemView({stage,effective}:{stage:StageStatus|null;effective:{model:string;provider:string;fallback:boolean}}){
  const qwen=stage?.models?.qwen397;
  const kimi=stage?.models?.kimi;
  const open=stage?.models?.open;
  const own=stage?.models?.own;
  const teacher=stage?.models?.teacher;
  const targetModel=qwen?.model||'Qwen/Qwen3.5-397B-A17B';
  const targetReady=Boolean(qwen?.endpointConfigured);
  const route=[
    {name:qwen?.label||'Qwen 397B',detail:targetModel,state:targetReady?'ACTIVO':'PENDIENTE'},
    {name:kimi?.label||'Kimi K2.5',detail:kimi?.model||'moonshotai/Kimi-K2.5',state:kimi?.endpointConfigured?'ACTIVO':'RESPALDO'},
    {name:open?.model||'Workers AI',detail:open?.role||'Fallback disponible',state:'DISPONIBLE'}
  ];
  return <main className="hxSystem">
    <section className="hxSystemHero">
      <div><span>OBJETIVO PRINCIPAL</span><h1>397B</h1><p>{targetModel}</p></div>
      <div className={`hxSystemState ${targetReady?'ready':''}`}><i/><strong>{targetReady?'CONECTADO':'NO CONECTADO'}</strong><small>{qwen?.reason||'La interfaz no lo marcará activo hasta recibir una respuesta real.'}</small></div>
    </section>

    <section className="hxEffective">
      <span>ÚLTIMO MODELO EFECTIVO</span>
      <strong>{effective.model}</strong>
      <p>{effective.provider}{effective.fallback?' · respondió mediante fallback':''}</p>
    </section>

    <section className="hxRoute">
      <header><h2>RUTA DE INFERENCIA</h2><span>ORDEN REAL</span></header>
      {route.map((item,index)=><article key={item.name}><b>{String(index+1).padStart(2,'0')}</b><div><strong>{item.name}</strong><small>{item.detail}</small></div><span>{item.state}</span></article>)}
    </section>

    <section className="hxSystemGrid">
      <article><Cpu/><span>CAMPEÓN PROPIO</span><strong>{own?.label||own?.runtimeId||'V41'}</strong><small>{own?.mode||'Permanece hasta ser superado'}</small></article>
      <article><Network/><span>MAESTRO</span><strong>{teacher?.model||'GPT-5.6 reasoning'}</strong><small>{teacher?.role||'Datos y verificación'}</small></article>
      <article><Database/><span>CONTEXTO</span><strong>{qwen?.contextLength?`${Math.round(qwen.contextLength/1024)}K`:'262K'}</strong><small>Objetivo nativo</small></article>
      <article><Target/><span>ACTIVOS</span><strong>{qwen?.activeParameters||'17B'}</strong><small>Por token</small></article>
    </section>

    <section className="hxGates">
      <header><h2>PUERTAS DE ENTRENAMIENTO</h2><span>SIN PORCENTAJES INVENTADOS</span></header>
      {(stage?.pipeline||[
        {id:'data',label:'Corpus verificable',target:10000,unit:'ejemplos'},
        {id:'benchmark',label:'Benchmark V2',target:500,unit:'casos'},
        {id:'failures',label:'Fallos entrenables',target:100,unit:'casos'},
        {id:'autonomy',label:'Autonomía propia',target:90,unit:'%'}
      ]).map(item=><article key={item.id}>
        <div>{typeof item.observed==='number'?<Check/>:<Clock3/>}</div>
        <span><strong>{item.label}</strong><small>{typeof item.observed==='number'?`${item.observed.toLocaleString('es-MX')} registrados`:'Sin conteo integrado confirmado'}</small></span>
        <b>{item.target.toLocaleString('es-MX')} {item.unit}</b>
      </article>)}
    </section>
    <p className="hxPrinciple">{stage?.principle||'El nombre del modelo no cuenta como integración. Sólo una respuesta verificada cambia el estado.'}</p>
  </main>;
}

function HistoryView({items,activeId,fresh,open}:{items:any[];activeId?:string;fresh:()=>void;open:(id:string)=>Promise<void>}){
  return <main className="hxListView">
    <header><div><span>CONVERSACIONES</span><h1>HISTORIAL</h1></div><button type="button" onClick={fresh}><Plus/>NUEVO</button></header>
    <section className="hxList">
      {items.length===0&&<div className="hxListEmpty">No hay conversaciones guardadas.</div>}
      {items.map((item,index)=><button type="button" key={item.id} className={activeId===item.id?'active':''} onClick={()=>void open(item.id)}>
        <b>{String(index+1).padStart(2,'0')}</b>
        <span><strong>{item.alias||item.title||'Conversación'}</strong><small>{item.updated_at||item.created_at||'Sin fecha'}</small></span>
        <MessageSquare/>
      </button>)}
    </section>
  </main>;
}

function FilesView({items,chooseAttachment,sendToChat,fileInput}:{items:any[];chooseAttachment:(file?:File)=>void;sendToChat:()=>void;fileInput:React.RefObject<HTMLInputElement|null>}){
  return <main className="hxListView">
    <header><div><span>BIBLIOTECA PRIVADA</span><h1>ARCHIVOS</h1></div><button type="button" onClick={()=>fileInput.current?.click()}><Paperclip/>ADJUNTAR</button></header>
    <section className="hxFiles">
      {items.length===0&&<div className="hxListEmpty">No hay archivos guardados.</div>}
      {items.map(item=><a href={`/api/files/${item.id}/download`} key={item.id}>
        <FileText/>
        <span><strong>{item.name}</strong><small>{Math.ceil(Number(item.size_bytes||0)/1024).toLocaleString('es-MX')} KB</small></span>
      </a>)}
    </section>
    <input ref={fileInput} type="file" hidden onChange={event=>{chooseAttachment(event.target.files?.[0]);sendToChat();event.currentTarget.value=''}}/>
  </main>;
}
