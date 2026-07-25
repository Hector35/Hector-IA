import {useEffect,useMemo,useState} from 'react';
import {BrainCircuit,CheckCircle2,MessageSquareText,RefreshCw,ThumbsDown,ThumbsUp,X} from 'lucide-react';
import {api,type OpenAIReviewScope} from './api';

type Mode='feedback'|'chat';
type ChatItem={id:string;role:string;content:string;created_at?:string};

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

  const current=useMemo(()=>conversations.find(item=>item.id===conversationId),[conversations,conversationId]);
  const assistantMessages=useMemo(()=>messages.filter(item=>item.role==='assistant'),[messages]);
  const selectedMessage=useMemo(()=>assistantMessages.find(item=>item.id===messageId),[assistantMessages,messageId]);

  useEffect(()=>{
    api.me().then(()=>setVisible(true)).catch(()=>setVisible(false));
  },[]);

  const loadConversations=async()=>{
    const data=await api.conversations();
    const items=data.items||[];
    setConversations(items);
    setConversationId(currentId=>currentId||items[0]?.id||'');
    return items;
  };

  const loadMessages=async(id:string)=>{
    if(!id){setMessages([]);setMessageId('');return;}
    setLoadingMessages(true);
    try{
      const data=await api.conversationMessages(id);
      const items=(data.items||[]) as ChatItem[];
      setMessages(items);
      const latest=[...items].reverse().find(item=>item.role==='assistant');
      setMessageId(currentId=>items.some(item=>item.id===currentId&&item.role==='assistant')?currentId:latest?.id||'');
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

  if(!visible)return null;
  return <>
    <button className="hxTrainFab" type="button" onClick={()=>setOpen(true)} aria-label="Entrenar con OpenAI"><BrainCircuit/><span>ENTRENAR</span></button>
    {open&&<div className="hxTrainBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section className="hxTrainPanel" role="dialog" aria-modal="true" aria-label="Entrenamiento supervisado">
        <header><div><span>MAESTRO EXTERNO</span><h2>OPENAI · RETROALIMENTACIÓN</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Cerrar"><X/></button></header>
        <div className="hxTrainStatus"><i className={status?.configured?'ready':''}/><span>{status?.configured?`Conectado · ${status.model}`:'OPENAI_API_KEY no configurada'}</span><b>ENVÍO MANUAL</b></div>
        <nav className="hxTrainTabs"><button type="button" className={mode==='feedback'?'active':''} onClick={()=>{setMode('feedback');setResult(undefined);setError('')}}>Corregir y enseñar</button><button type="button" className={mode==='chat'?'active':''} onClick={()=>{setMode('chat');setResult(undefined);setError('')}}>Hablar con OpenAI</button></nav>

        <label className="hxTrainField">Conversación<select value={conversationId} onChange={event=>{setConversationId(event.target.value);setResult(undefined)}}><option value="">{mode==='chat'?'Crear conversación nueva':'Selecciona una conversación'}</option>{conversations.map(item=><option key={item.id} value={item.id}>{item.alias||item.title||item.id}</option>)}</select><small>{conversationId?`Contexto: “${current?.alias||current?.title||'conversación seleccionada'}”`:'OpenAI iniciará una conversación propia guardada en el historial.'}</small></label>

        {mode==='feedback'&&<>
          <div className="hxTrainScope" role="group" aria-label="Alcance de la revisión"><button type="button" className={scope==='message'?'active':''} onClick={()=>{setScope('message');setResult(undefined)}}>Mensaje específico</button><button type="button" className={scope==='conversation'?'active':''} onClick={()=>{setScope('conversation');setResult(undefined)}}>Chat completo</button></div>
          {scope==='message'&&<label className="hxTrainField">Respuesta de Héctor<select value={messageId} onChange={event=>{setMessageId(event.target.value);setResult(undefined)}} disabled={loadingMessages}><option value="">{loadingMessages?'Cargando respuestas…':'Selecciona una respuesta'}</option>{assistantMessages.map(item=><option key={item.id} value={item.id}>{short(item.content)}</option>)}</select>{selectedMessage&&<small className="hxTrainPreview">{selectedMessage.content}</small>}</label>}
          {scope==='conversation'&&<div className="hxTrainContext"><RefreshCw/><div><strong>Se enviará el chat completo disponible</strong><span>{messages.length} mensajes · OpenAI corregirá la respuesta final tomando en cuenta todo el contexto.</span></div></div>}
        </>}

        {mode==='chat'&&conversationId&&<label className="hxTrainCheck"><input type="checkbox" checked={includeConversation} onChange={event=>setIncludeConversation(event.target.checked)}/><span><strong>Usar el contexto del chat</strong><small>OpenAI recibirá los mensajes recientes de esta conversación para mantener continuidad.</small></span></label>}

        <label className="hxTrainField">{mode==='feedback'?'¿Qué estuvo mal o incompleto?':'Mensaje directo para OpenAI'}<textarea value={feedback} onChange={event=>setFeedback(event.target.value)} placeholder={mode==='feedback'?'Ejemplo: esta respuesta está incompleta porque no consideró…':'Escribe lo que quieras decirle a la API de OpenAI…'} rows={6}/></label>
        <button className="hxTrainSubmit" type="button" onClick={submit} disabled={busy||!feedback.trim()||(mode==='feedback'&&(!conversationId||(scope==='message'&&!messageId)))}>{busy?'ANALIZANDO…':mode==='feedback'?'CORREGIR, APLICAR Y GUARDAR':'ENVIAR A OPENAI'}</button>
        {error&&<div className="hxTrainError">{error}</div>}

        {result&&mode==='feedback'&&<article className="hxTrainResult"><CheckCircle2/><div><span>DIAGNÓSTICO</span><p>{result.review?.diagnosis}</p>{result.review?.missing?.length>0&&<><span>FALTÓ</span><ul>{result.review.missing.map((item:string)=><li key={item}>{item}</li>)}</ul></>}<span>RESPUESTA CORREGIDA</span><div className="hxTrainCorrected">{result.review?.correctedResponse}</div><small>La corrección ya se agregó al chat. El ejemplo sólo entrará al filtro de entrenamiento después de tu aprobación.</small><div className="hxTrainDecision">{result.status==='candidate'?<><button type="button" className="approve" onClick={()=>void decide('approve')} disabled={busy}><ThumbsUp/>APROBAR PARA ENTRENAMIENTO</button><button type="button" className="reject" onClick={()=>void decide('reject')} disabled={busy}><ThumbsDown/>RECHAZAR</button></>:<strong className={result.status==='human_approved'?'approved':'rejected'}>{result.status==='human_approved'?'APROBADO POR TI':'RECHAZADO'}</strong>}</div></div></article>}
        {result&&mode==='chat'&&<article className="hxTrainResult"><MessageSquareText/><div><span>OPENAI</span><div className="hxTrainCorrected">{result.message?.content}</div><small>{result.model} · conversación guardada · {result.continuity?.turns||0} turnos previos usados</small></div></article>}
      </section>
    </div>}
  </>;
}
