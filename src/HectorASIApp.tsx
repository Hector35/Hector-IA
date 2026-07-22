import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUp,Check,Clock3,File,History,LogOut,Paperclip,Plus,Sparkles,X} from 'lucide-react';
import {api,type User} from './api';
import {MarkdownMessage} from './MarkdownMessage';

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
type Overlay='history'|'account'|null;

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

export function HectorASIApp(){
  const [user,setUser]=useState<User|null|undefined>();
  useEffect(()=>{api.me().then(result=>setUser(result.user)).catch(()=>setUser(null))},[]);

  if(user===undefined)return <Splash/>;
  if(!user)return <Login onDone={setUser}/>;
  return <ChatWorkspace user={user} onLogout={()=>api.logout().finally(()=>setUser(null))}/>;
}

function Splash(){
  return <div className="haSplash" aria-label="Iniciando Hector ASI">
    <div className="haSplashOrb"><span>H</span></div>
    <h1>Hector ASI</h1>
    <p>Inicializando inteligencia personal</p>
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

  return <main className="haLogin">
    <section className="haLoginIdentity">
      <div className="haHeroMark">H</div>
      <h1>Hector ASI</h1>
      <p>Una inteligencia personal para pensar, actuar y comprobar.</p>
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

function ChatWorkspace({user,onLogout}:{user:User;onLogout:()=>void}){
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [history,setHistory]=useState<any[]>([]);
  const [conversationId,setConversationId]=useState<string>();
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [overlay,setOverlay]=useState<Overlay>(null);
  const [attachment,setAttachment]=useState<PendingAttachment>();
  const [notice,setNotice]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);
  const end=useRef<HTMLDivElement>(null);

  const loadHistory=()=>api.conversations().then(result=>setHistory(result.items||[]));
  useEffect(()=>{void loadHistory()},[]);
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
  },[messages,busy,notice]);

  const title=useMemo(()=>{
    if(!conversationId)return 'Nueva conversación';
    const current=history.find(item=>item.id===conversationId);
    return current?.alias||current?.title||'Conversación';
  },[conversationId,history]);

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

  const removeAttachment=()=>setAttachment(undefined);

  const send=async(event?:FormEvent)=>{
    event?.preventDefault();
    const prompt=text.trim();
    if((!prompt&&!attachment)||busy)return;

    const selected=attachment;
    const userContent=prompt||(selected?.file.type.startsWith('image/')?'Analiza esta imagen.':'Registra y analiza este archivo.');
    setText('');
    setAttachment(undefined);
    setMessages(current=>[...current,{
      role:'user',
      content:userContent,
      attachmentName:selected?.file.name,
      attachmentPreview:selected?.preview
    }]);
    setBusy(true);
    setNotice(selected?'Procesando archivo y solicitud…':'Pensando y ejecutando…');

    try{
      if(selected?.file.type.startsWith('image/')){
        const result=await api.vision(selected.file,userContent);
        setMessages(current=>[...current,{
          role:'assistant',
          content:result.answer||'La imagen fue procesada.',
          provider:result.provider||'openai',
          model:result.model,
          modelTier:'vision'
        }]);
      }else{
        let requestText=userContent;
        if(selected){
          await api.upload(selected.file);
          requestText=`${userContent}\n\nArchivo privado disponible: ${selected.file.name}. Trabaja con él cuando la capacidad correspondiente esté disponible y confirma qué pudiste comprobar.`;
        }

        if(asksForModel(requestText)){
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
        }else{
          const result=await api.chat(requestText,conversationId,{reasoning:'high',deliberation:'auto'});
          const nextId=result.conversationId;
          setConversationId(nextId);
          setMessages(items=>[...items,{
            ...result.message,
            provider:result.provider,
            model:result.model,
            fallback:result.fallback,
            modelTier:result.modelTier
          }]);
          await loadHistory();
        }
      }
    }catch(reason){
      setMessages(current=>[...current,{role:'assistant',content:`No pude completar la acción: ${reason instanceof Error?reason.message:'error desconocido'}`,provider:'system',model:'error-report'}]);
    }finally{
      setBusy(false);
      setNotice('');
    }
  };

  return <div className="haApp">
    <header className="haTopbar">
      <button className="haIconButton" onClick={()=>setOverlay('history')} aria-label="Abrir historial"><History/></button>
      <div className="haTopIdentity">
        <strong>Hector ASI</strong>
        <span><i className={busy?'busy':''}/>{busy?'Trabajando':'Listo'}</span>
      </div>
      <button className="haAvatar" onClick={()=>setOverlay('account')} aria-label="Abrir cuenta">{user.name.slice(0,1).toUpperCase()}</button>
    </header>

    <main className="haConversation" aria-label={title}>
      {messages.length===0&&<section className="haWelcome">
        <div className="haWelcomeMark">H</div>
        <h1>Hector ASI</h1>
        <p>Dime el resultado que quieres. El sistema debe pensar, actuar y mostrarte aquí mismo cómo lo comprobó.</p>
      </section>}

      <section className="haMessages" aria-live="polite">
        {messages.map((message,index)=><Message key={message.id||`${message.role}-${index}`} message={message}/>)}
        {busy&&<article className="haMessage assistant thinking" aria-label="Hector ASI está trabajando"><div><span/><span/><span/></div></article>}
        {notice&&<div className="haNotice"><Clock3/>{notice}</div>}
        <div ref={end}/>
      </section>
    </main>

    <form className="haComposer" onSubmit={send}>
      {attachment&&<div className="haAttachmentPreview">
        {attachment.preview?<img src={attachment.preview} alt="Vista previa del archivo"/>:<File/>}
        <span>{attachment.file.name}</span>
        <button type="button" onClick={removeAttachment} aria-label="Quitar archivo"><X/></button>
      </div>}
      <div className="haComposerInner">
        <button className="haAttach" type="button" onClick={()=>fileInput.current?.click()} aria-label="Adjuntar archivo"><Paperclip/></button>
        <textarea value={text} onChange={event=>setText(event.target.value)} onKeyDown={event=>{
          if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}
        }} rows={1} placeholder="Pide cualquier cosa…" aria-label="Mensaje para Hector ASI"/>
        <button className="haSend" aria-label="Enviar" disabled={busy||(!text.trim()&&!attachment)}><ArrowUp/></button>
      </div>
      <input ref={fileInput} type="file" hidden onChange={event=>{chooseAttachment(event.target.files?.[0]);event.currentTarget.value=''}}/>
      <small>Las acciones y su evidencia aparecen dentro de esta conversación.</small>
    </form>

    {overlay==='history'&&<HistorySheet history={history} activeId={conversationId} close={()=>setOverlay(null)} fresh={fresh} open={openConversation}/>} 
    {overlay==='account'&&<AccountSheet user={user} close={()=>setOverlay(null)} logout={onLogout}/>} 
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
