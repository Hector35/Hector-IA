import {useEffect,useMemo,useRef,useState} from 'react';
import {BrainCircuit,CheckCircle2,MessageSquareText,RefreshCw,ThumbsDown,ThumbsUp,X} from 'lucide-react';
import {api,type OpenAIReviewScope} from './api';

type Mode='feedback'|'chat';
type ChatItem={id:string;role:string;content:string;created_at?:string};
type TrainingTarget={conversationId?:string;messageId?:string};

function short(value:string,length=92){
  const compact=value.replace(/\s+/g,' ').trim();
  return compact.length>length?`${compact.slice(0,length)}…`:compact;
}

export function TrainingOverlay(){
  const [visible,setVisible]=useState(false);
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<Mode>('feedback');
  const [scope,setScope]=useState<OpenAIReviewScope>('message');
  const [conversations,setConversations]=useState<any[]>([]);
  const [conversationId,setConversationId]=useState('');
  const [messages,setMessages]=useState<ChatItem[]>([]);
  const [messageId,setMessageId]=useState('');
  const [includeConversation,setIncludeConversation]=useState(true);
  const [feedback,setFeedback]=useState('');
  const [busy,setBusy]=useState(false);
  const [loadingMessages,setLoadingMessages]=useState(false);
  const [result,setResult]=useState<any>();
  const [error,setError]=useState('');
  const [status,setStatus]=useState<any>();
  const pendingTarget=useRef<TrainingTarget|undefined>(undefined);

  const current=useMemo(()=>conversations.find(item=>item.id===conversationId),[conversations,conversationId]);
  const assistantMessages=useMemo(()=>messages.filter(item=>item.role==='assistant'),[messages]);
  const selectedMessage=useMemo(()=>assistantMessages.find(item=>item.id===messageId),[assistantMessages,messageId]);

  useEffect(()=>{
    api.me().then(()=>setVisible(true)).catch(()=>setVisible(false));
  },[]);

  useEffect(()=>{
    const launch=(event:Event)=>{
      const detail=(event as CustomEvent<TrainingTarget>).detail||{};
      pendingTarget.current=detail;
      setMode('feedback');
      setScope(detail.messageId?'message':'conversation');
      if(detail.conversationId)setConversationId(detail.conversationId);
      if(detail.messageId)setMessageId(detail.messageId);
      setResult(undefined);
      setError('');
      setOpen(true);
    };
    window.addEventListener('hector:open-training',launch);
    return()=>window.removeEventListener('hector:open-training',launch);
  },[]);

  useEffect(()=>{
    if(!open)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[open]);

  const loadConversations=async()=>{
    const data=await api.conversations();
    const items=data.items||[];
    setConversations(items);
    const requested=pendingTarget.current?.conversationId;
    setConversationId(currentId=>requested||currentId||items[0]?.id||'');
    return items;
  };

  const loadMessages=async(id:string)=>{
    if(!id){setMessages([]);setMessageId('');return;}
    setLoadingMessages(true);
    try{
      const data=await api.conversationMessages(id);
      const items=(data.items||[]) as ChatItem[];
      setMessages(items);
      const requested=pendingTarget.current?.messageId;
      const latest=[...items].reverse().find(item=>item.role==='assistant');
      setMessageId(currentId=>{
        if(requested&&items.some(item=>item.id===requested&&item.role==='assistant'))return requested;
        if(items.some(item=>item.id===currentId&&item.role==='assistant'))return currentId;
        return latest?.id||'';
      });
      pendingTarget.current=undefined;
    }finally{setLoadingMessages(false)}
  };

  useEffect(()=>{
    if(!open)return;
    setError('');
    void Promise.all([loadConversations(),api.openAICoachStatus().then(setStatus)]).catch(reason=>setError(reason instanceof Error?reason.message:'No se pudo cargar OpenAI'));
  },[open]);

  useEffect(()=>{
    if(!open)return;
    void loadMessages(conversationId).catch(reason=>setError(reason instanceof Error?reason.message:'No se pudo cargar la conversación'));
  },[open,conversationId]);

  const announceConversationUpdate=(id?:string)=>{
    if(!id)return;
    window.dispatchEvent(new CustomEvent('hector:conversation-updated',{detail:{conversationId:id}}));
  };

  const submit=async()=>{
    const text=feedback.trim();
    if(!text||busy)return;
    setBusy(true);setError('');setResult(undefined);
    try{
      if(mode==='feedback'){
        const response=await api.reviewWithOpenAI(conversationId,text,{
          messageId:scope==='message'?messageId:undefined,
          scope,
          applyCorrection:true
        });
        setResult(response);
        announceConversationUpdate(response.conversationId);
        await loadMessages(response.conversationId);
      }else{
        const response=await api.openAICoachChat(text,conversationId||undefined,includeConversation);
        setResult(response);
        setConversationId(response.conversationId||conversationId);
        announceConversationUpdate(response.conversationId);
        await loadConversations();
        await loadMessages(response.conversationId);
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'No se pudo contactar OpenAI')}
    finally{setBusy(false)}
  };

  const decide=async(decision:'approve'|'reject')=>{
    if(!result?.id||busy)return;
    setBusy(true);setError('');
    try{
      const response=await api.decideTrainingFeedback(result.id,decision);
      setResult((currentResult:any)=>({...currentResult,status:response.status,userAccepted:response.userAccepted}));
    }catch(reason){setError(reason instanceof Error?reason.message:'No se pudo guardar la decisión')}
    finally{setBusy(false)}
  };

  if(!visible||!open)return null;
  return <div className="hxTrainBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
    <section className="hxTrainPanel" role="dialog" aria-modal="true" aria-label="Entrenamiento supervisado">
      <header><div><span>ENSEÑAR A HÉCTOR</span><h2>Revisar y corregir</h2><p>La corrección queda visible en el chat. Sólo se convierte en dato de entrenamiento después de tu aprobación.</p></div><button type="button" onClick={()=>setOpen(false)} aria-label="Cerrar"><X/></button></header>
      <div className="hxTrainStatus"><i className={status?.configured?'ready':''}/><span>{status?.configured?`Revisor conectado · ${status.model}`:'Revisor externo no configurado'}</span><b>ENVÍO MANUAL</b></div>
      <nav className="hxTrainTabs"><button type="button" className={mode==='feedback'?'active':''} onClick={()=>{setMode('feedback');setResult(undefined);setError('')}}>Corregir respuesta</button><button type="button" className={mode==='chat'?'active':''} onClick={()=>{setMode('chat');setResult(undefined);setError('')}}>Consultar al maestro</button></nav>

      <label className="hxTrainField">Conversación<select value={conversationId} onChange={event=>{setConversationId(event.target.value);setResult(undefined)}}><option value="">{mode==='chat'?'Crear conversación nueva':'Selecciona una conversación'}</option>{conversations.map(item=><option key={item.id} value={item.id}>{item.alias||item.title||item.id}</option>)}</select><small>{conversationId?`Contexto: “${current?.alias||current?.title||'conversación seleccionada'}”`:'El maestro iniciará una conversación guardada en el historial.'}</small></label>

      {mode==='feedback'&&<>
        <div className="hxTrainScope" role="group" aria-label="Alcance de la revisión"><button type="button" className={scope==='message'?'active':''} onClick={()=>{setScope('message');setResult(undefined)}}>Una respuesta</button><button type="button" className={scope==='conversation'?'active':''} onClick={()=>{setScope('conversation');setResult(undefined)}}>Chat completo</button></div>
        {scope==='message'&&<label className="hxTrainField">Respuesta de Héctor<select value={messageId} onChange={event=>{setMessageId(event.target.value);setResult(undefined)}} disabled={loadingMessages}><option value="">{loadingMessages?'Cargando respuestas…':'Selecciona una respuesta'}</option>{assistantMessages.map(item=><option key={item.id} value={item.id}>{short(item.content)}</option>)}</select>{selectedMessage&&<small className="hxTrainPreview">{selectedMessage.content}</small>}</label>}
        {scope==='conversation'&&<div className="hxTrainContext"><RefreshCw/><div><strong>Se revisará el contexto disponible</strong><span>{messages.length} mensajes · la respuesta final se corregirá considerando la conversación.</span></div></div>}
      </>}

      {mode==='chat'&&conversationId&&<label className="hxTrainCheck"><input type="checkbox" checked={includeConversation} onChange={event=>setIncludeConversation(event.target.checked)}/><span><strong>Usar el contexto del chat</strong><small>El maestro recibirá los mensajes recientes para mantener continuidad.</small></span></label>}

      <label className="hxTrainField">{mode==='feedback'?'¿Qué estuvo mal o incompleto?':'Mensaje para el maestro'}<textarea value={feedback} onChange={event=>setFeedback(event.target.value)} placeholder={mode==='feedback'?'Ejemplo: la respuesta no consideró este dato, confundió…':'Escribe la consulta…'} rows={6}/></label>
      <button className="hxTrainSubmit" type="button" onClick={submit} disabled={busy||!feedback.trim()||(mode==='feedback'&&(!conversationId||(scope==='message'&&!messageId)))}>{busy?'ANALIZANDO…':mode==='feedback'?'CORREGIR Y MOSTRAR EN EL CHAT':'ENVIAR CONSULTA'}</button>
      {error&&<div className="hxTrainError" role="alert">{error}</div>}

      {result&&mode==='feedback'&&<article className="hxTrainResult"><CheckCircle2/><div><span>DIAGNÓSTICO</span><p>{result.review?.diagnosis}</p>{result.review?.missing?.length>0&&<><span>FALTÓ</span><ul>{result.review.missing.map((item:string)=><li key={item}>{item}</li>)}</ul></>}<span>RESPUESTA CORREGIDA</span><div className="hxTrainCorrected">{result.review?.correctedResponse}</div><small>La corrección ya se agregó al chat. Decide si también debe entrar al filtro de entrenamiento.</small><div className="hxTrainDecision">{result.status==='candidate'?<><button type="button" className="approve" onClick={()=>void decide('approve')} disabled={busy}><ThumbsUp/>APROBAR EJEMPLO</button><button type="button" className="reject" onClick={()=>void decide('reject')} disabled={busy}><ThumbsDown/>RECHAZAR</button></>:<strong className={result.status==='human_approved'?'approved':'rejected'}>{result.status==='human_approved'?'APROBADO POR TI':'RECHAZADO'}</strong>}</div></div></article>}
      {result&&mode==='chat'&&<article className="hxTrainResult"><MessageSquareText/><div><span>MAESTRO</span><div className="hxTrainCorrected">{result.message?.content}</div><small>{result.model} · conversación guardada · {result.continuity?.turns||0} turnos previos usados</small></div></article>}
    </section>
  </div>;
}
