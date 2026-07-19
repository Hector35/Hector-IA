import {FormEvent,useEffect,useRef,useState} from 'react';
import {ArrowUp,FileText,FolderOpen,LogOut,Menu,MessageSquare,PanelLeftClose,Plus,Settings,SquarePen,Terminal,Upload,X} from 'lucide-react';
import {api,type User} from './api';

type View='chat'|'work'|'files'|'settings';
type ChatMessage={role:string;content:string};

export function CodexApp(){
  const [user,setUser]=useState<User|null|undefined>();
  const [view,setView]=useState<View>('chat');
  const [navOpen,setNavOpen]=useState(false);
  useEffect(()=>{api.me().then(r=>setUser(r.user)).catch(()=>setUser(null))},[]);
  if(user===undefined)return <div className="cxSplash">H</div>;
  if(!user)return <Login onDone={setUser}/>;
  return <div className="cxApp">
    <Sidebar view={view} setView={v=>{setView(v);setNavOpen(false)}} open={navOpen} close={()=>setNavOpen(false)} logout={()=>api.logout().then(()=>setUser(null))}/>
    <main className="cxMain">
      <button className="cxMobileMenu" onClick={()=>setNavOpen(true)} aria-label="Abrir menú"><Menu/></button>
      {view==='chat'&&<ChatView/>}
      {view==='work'&&<WorkView/>}
      {view==='files'&&<FilesView/>}
      {view==='settings'&&<SettingsView/>}
    </main>
  </div>
}

function Sidebar({view,setView,open,close,logout}:{view:View;setView:(v:View)=>void;open:boolean;close:()=>void;logout:()=>void}){
  const items:[View,string,any][]=[['chat','Chat',MessageSquare],['work','Trabajo',Terminal],['files','Archivos',FolderOpen],['settings','Ajustes',Settings]];
  return <>
    {open&&<button className="cxBackdrop" onClick={close} aria-label="Cerrar menú"/>}
    <aside className={`cxSidebar ${open?'open':''}`}>
      <div className="cxSidebarTop"><div className="cxLogo">H</div><strong>Héctor OS</strong><button onClick={close} className="cxClose"><X/></button></div>
      <button className="cxNew" onClick={()=>setView('chat')}><SquarePen/>Nuevo chat</button>
      <nav>{items.map(([id,label,Icon])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}><Icon/><span>{label}</span></button>)}</nav>
      <button className="cxLogout" onClick={logout}><LogOut/><span>Cerrar sesión</span></button>
    </aside>
  </>
}

function Login({onDone}:{onDone:(u:User)=>void}){
  const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{const r=register?await api.register(String(f.get('name')),String(f.get('email')),String(f.get('password'))):await api.login(String(f.get('email')),String(f.get('password')));onDone(r.user)}catch(err){setError(err instanceof Error?err.message:'Error')}finally{setBusy(false)}};
  return <div className="cxLogin"><form onSubmit={submit}><div className="cxLoginLogo">H</div><h1>Héctor OS</h1><p>{register?'Crea la cuenta propietaria.':'Entra a tu espacio de trabajo.'}</p>{register&&<input name="name" placeholder="Nombre" defaultValue="Héctor" required/>}<input name="email" type="email" placeholder="Correo" autoComplete="email" required/><input name="password" type="password" placeholder="Contraseña" minLength={10} autoComplete={register?'new-password':'current-password'} required/>{error&&<div className="cxError">{error}</div>}<button className="cxPrimary" disabled={busy}>{busy?'Procesando…':register?'Crear cuenta':'Entrar'}</button><button type="button" className="cxLink" onClick={()=>setRegister(!register)}>{register?'Ya tengo cuenta':'Configurar por primera vez'}</button></form></div>
}

function ChatView(){
  const [messages,setMessages]=useState<ChatMessage[]>([]),[history,setHistory]=useState<any[]>([]),[text,setText]=useState(''),[cid,setCid]=useState<string>(),[busy,setBusy]=useState(false),[historyOpen,setHistoryOpen]=useState(false);
  const end=useRef<HTMLDivElement>(null);
  const loadHistory=()=>api.conversations().then(r=>setHistory(r.items||[]));
  useEffect(()=>{void loadHistory()},[]);
  const open=async(id:string)=>{const r=await api.conversationMessages(id);setCid(id);setMessages(r.items||[]);setHistoryOpen(false)};
  const fresh=()=>{setCid(undefined);setMessages([]);setHistoryOpen(false)};
  const send=async(e?:FormEvent)=>{e?.preventDefault();if(!text.trim()||busy)return;const q=text.trim();setText('');setMessages(m=>[...m,{role:'user',content:q}]);setBusy(true);try{const r=await api.chat(q,cid);setCid(r.conversationId);setMessages(m=>[...m,r.message]);await loadHistory()}catch(err){setMessages(m=>[...m,{role:'assistant',content:`Error: ${err instanceof Error?err.message:'No disponible'}`}])}finally{setBusy(false);setTimeout(()=>end.current?.scrollIntoView({behavior:'smooth'}),40)}};
  return <div className="cxChatLayout">
    <section className={`cxHistory ${historyOpen?'open':''}`}>
      <div className="cxHistoryHead"><strong>Conversaciones</strong><button onClick={()=>setHistoryOpen(false)}><PanelLeftClose/></button></div>
      <button className="cxHistoryNew" onClick={fresh}><Plus/>Nuevo chat</button>
      <div className="cxHistoryList">{history.map(x=><button key={x.id} className={cid===x.id?'active':''} onClick={()=>open(x.id)}><MessageSquare/><span>{x.title||'Sin título'}</span></button>)}</div>
    </section>
    <section className="cxConversation">
      <header className="cxChatHeader"><button onClick={()=>setHistoryOpen(true)} aria-label="Abrir conversaciones"><Menu/></button><span>{cid?'Conversación':'Héctor OS'}</span><button onClick={fresh} aria-label="Nuevo chat"><SquarePen/></button></header>
      <div className="cxMessages">
        {messages.length===0&&<div className="cxWelcome"><div className="cxMark">H</div><h1>¿En qué trabajamos?</h1><p>Pregunta, analiza, programa o inicia una tarea.</p></div>}
        {messages.map((m,i)=><article key={i} className={`cxMessage ${m.role}`}><div>{m.content}</div></article>)}
        {busy&&<article className="cxMessage assistant"><div className="cxThinking"><i/><i/><i/></div></article>}
        <div ref={end}/>
      </div>
      <form className="cxComposer" onSubmit={send}><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} placeholder="Pregunta lo que quieras" rows={1}/><button aria-label="Enviar" disabled={!text.trim()||busy}><ArrowUp/></button></form>
    </section>
  </div>
}

function WorkView(){
  const [items,setItems]=useState<any[]>([]),[selected,setSelected]=useState<any>(),[title,setTitle]=useState(''),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>api.workJobs().then(r=>setItems(r.items||[]));useEffect(()=>{void load()},[]);
  const create=async(e:FormEvent)=>{e.preventDefault();if(!title.trim()||prompt.trim().length<10)return;setBusy(true);try{await api.createWork({kind:'agent',title:title.trim(),prompt:prompt.trim()});setTitle('');setPrompt('');await load()}finally{setBusy(false)}};
  const open=async(id:string)=>setSelected(await api.workJob(id));
  return <div className="cxPage"><div className="cxPageHead"><div><span>Agente</span><h1>Trabajo</h1><p>Tareas persistentes con progreso, evidencia y resultado.</p></div></div><form className="cxTaskForm" onSubmit={create}><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título de la tarea"/><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe el objetivo, restricciones y criterio de éxito"/><button className="cxPrimary" disabled={busy}>{busy?'Creando…':'Iniciar tarea'}</button></form><div className="cxTaskGrid">{items.map(x=><button key={x.id} onClick={()=>open(x.id)}><div><Terminal/><strong>{x.title}</strong></div><span>{x.status} · {x.progress||0}%</span></button>)}</div>{selected&&<section className="cxDetail"><h2>{selected.job?.title}</h2><p>{selected.job?.result||'La tarea sigue en proceso.'}</p>{(selected.events||[]).map((e:any,i:number)=><div key={i}><span>{e.progress}%</span>{e.message}</div>)}</section>}</div>
}

function FilesView(){
  const [items,setItems]=useState<any[]>([]),[busy,setBusy]=useState(false);const load=()=>api.files().then(r=>setItems(r.items||[]));useEffect(()=>{void load()},[]);
  const upload=async(e:any)=>{const f=e.target.files?.[0];if(!f)return;setBusy(true);try{await api.upload(f);await load()}finally{setBusy(false);e.target.value=''}};
  return <div className="cxPage"><div className="cxPageHead"><div><span>R2</span><h1>Archivos</h1><p>Biblioteca privada del espacio de trabajo.</p></div><label className="cxUpload"><Upload/>{busy?'Subiendo…':'Subir'}<input type="file" hidden onChange={upload}/></label></div><div className="cxFileList">{items.length===0?<div className="cxEmpty"><FolderOpen/><p>No hay archivos todavía.</p></div>:items.map(x=><a key={x.id} href={`/api/files/${x.id}/download`}><FileText/><div><strong>{x.name}</strong><span>{Math.ceil(x.size_bytes/1024)} KB</span></div></a>)}</div></div>
}

function SettingsView(){
  const [status,setStatus]=useState<any>(),[memories,setMemories]=useState<any[]>([]),[text,setText]=useState('');
  const load=()=>Promise.all([api.intelligenceStatus().then(setStatus).catch(()=>{}),api.memories().then(r=>setMemories(r.items||[]))]);useEffect(()=>{void load()},[]);
  const add=async(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;await api.addMemory(text.trim());setText('');await load()};
  return <div className="cxPage"><div className="cxPageHead"><div><span>Sistema</span><h1>Ajustes</h1><p>Memoria, modelo y estado del núcleo.</p></div></div><section className="cxStatus"><div><span>Estado</span><strong>{status?.ok===false?'Revisar':'Activo'}</strong></div><div><span>Memorias</span><strong>{memories.length}</strong></div></section><form className="cxMemoryForm" onSubmit={add}><input value={text} onChange={e=>setText(e.target.value)} placeholder="Guardar una memoria"/><button className="cxPrimary">Guardar</button></form><div className="cxMemoryList">{memories.map(x=><article key={x.id}>{x.content}</article>)}</div></div>
}
