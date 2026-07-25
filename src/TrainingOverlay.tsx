import {useEffect,useMemo,useState} from 'react';
import {BrainCircuit,CheckCircle2,MessageSquareText,X} from 'lucide-react';
import {api} from './api';

type Mode='feedback'|'chat';

export function TrainingOverlay(){
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<Mode>('feedback');
  const [conversations,setConversations]=useState<any[]>([]);
  const [conversationId,setConversationId]=useState('');
  const [feedback,setFeedback]=useState('');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<any>();
  const [error,setError]=useState('');
  const [status,setStatus]=useState<any>();

  const current=useMemo(()=>conversations.find(item=>item.id===conversationId),[conversations,conversationId]);

  useEffect(()=>{
    if(!open)return;
    void Promise.all([
      api.conversations().then(data=>{
        const items=data.items||[];
        setConversations(items);
        if(!conversationId&&items[0]?.id)setConversationId(items[0].id);
      }),
      api.openAICoachStatus().then(setStatus)
    ]).catch(()=>{});
  },[open]);

  const submit=async()=>{
    const text=feedback.trim();
    if(!text||busy)return;
    setBusy(true);setError('');setResult(undefined);
    try{
      const response=mode==='feedback'
        ?await api.reviewWithOpenAI(conversationId,text)
        :await api.openAICoachChat(text,conversationId||undefined);
      setResult(response);
    }catch(reason){setError(reason instanceof Error?reason.message:'No se pudo contactar OpenAI')}
    finally{setBusy(false)}
  };

  return <>
    <button className="hxTrainFab" type="button" onClick={()=>setOpen(true)} aria-label="Entrenar con OpenAI"><BrainCircuit/><span>ENTRENAR</span></button>
    {open&&<div className="hxTrainBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section className="hxTrainPanel" role="dialog" aria-modal="true" aria-label="Entrenamiento supervisado">
        <header><div><span>MAESTRO EXTERNO</span><h2>OPENAI · RETROALIMENTACIÓN</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Cerrar"><X/></button></header>
        <div className="hxTrainStatus"><i className={status?.configured?'ready':''}/><span>{status?.configured?`Conectado · ${status.model}`:'OPENAI_API_KEY no configurada'}</span><b>ENVÍO MANUAL</b></div>
        <nav className="hxTrainTabs"><button type="button" className={mode==='feedback'?'active':''} onClick={()=>{setMode('feedback');setResult(undefined)}}>Corregir respuesta</button><button type="button" className={mode==='chat'?'active':''} onClick={()=>{setMode('chat');setResult(undefined)}}>Hablar con OpenAI</button></nav>
        {mode==='feedback'&&<label className="hxTrainField">Conversación<select value={conversationId} onChange={event=>setConversationId(event.target.value)}><option value="">Selecciona una conversación</option>{conversations.map(item=><option key={item.id} value={item.id}>{item.alias||item.title||item.id}</option>)}</select><small>Se revisará la respuesta más reciente de Héctor en “{current?.alias||current?.title||'esta conversación'}”.</small></label>}
        <label className="hxTrainField">{mode==='feedback'?'¿Qué estuvo mal o incompleto?':'Mensaje directo para OpenAI'}<textarea value={feedback} onChange={event=>setFeedback(event.target.value)} placeholder={mode==='feedback'?'Ejemplo: esta respuesta está incompleta porque no consideró…':'Escribe lo que quieras preguntarle a la API de OpenAI…'} rows={6}/></label>
        <button className="hxTrainSubmit" type="button" onClick={submit} disabled={busy||!feedback.trim()||(mode==='feedback'&&!conversationId)}>{busy?'ANALIZANDO…':mode==='feedback'?'CORREGIR Y GUARDAR EJEMPLO':'ENVIAR A OPENAI'}</button>
        {error&&<div className="hxTrainError">{error}</div>}
        {result&&mode==='feedback'&&<article className="hxTrainResult"><CheckCircle2/><div><span>DIAGNÓSTICO</span><p>{result.review?.diagnosis}</p>{result.review?.missing?.length>0&&<><span>FALTÓ</span><ul>{result.review.missing.map((item:string)=><li key={item}>{item}</li>)}</ul></>}<span>RESPUESTA CORREGIDA</span><div className="hxTrainCorrected">{result.review?.correctedResponse}</div><small>Guardado como candidato de entrenamiento. Todavía debe pasar validación antes de modificar pesos.</small></div></article>}
        {result&&mode==='chat'&&<article className="hxTrainResult"><MessageSquareText/><div><span>OPENAI</span><div className="hxTrainCorrected">{result.message?.content}</div><small>{result.model}</small></div></article>}
      </section>
    </div>}
  </>;
}
