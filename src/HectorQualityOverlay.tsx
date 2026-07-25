import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,CheckCircle2,Gauge,RefreshCw,X} from 'lucide-react';
import {api} from './api';

type QualityDimension={id:string;label:string;score:number;maximum:number;gaps?:string[]};
type QualityReport={score:number;maximum:number;grade:string;tenOutOfTen:boolean;dimensions:QualityDimension[];criticalBlockers:string[];topPriorities:string[];principle?:string};

export function HectorQualityOverlay(){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[report,setReport]=useState<QualityReport|null>(null),[error,setError]=useState('');
 const trigger=useRef<HTMLButtonElement>(null),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const root=document.getElementById('root');root?.setAttribute('tabindex','-1');const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&open){event.preventDefault();setOpen(false)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[open]);
 useEffect(()=>{if(open)window.setTimeout(()=>close.current?.focus(),30);else trigger.current?.focus({preventScroll:true})},[open]);
 const load=async()=>{setBusy(true);setError('');try{setReport(await api.systemQuality())}catch(reason){setError(reason instanceof Error?reason.message:'No se pudo cargar la auditoría')}finally{setBusy(false)}};
 const show=()=>{setOpen(true);void load()};
 return <>
  <a className="hqaSkip" href="#root">Saltar al chat principal</a>
  <button ref={trigger} className="hqaTrigger" type="button" onClick={show} aria-haspopup="dialog" aria-expanded={open} aria-controls="hqaDialog"><Gauge aria-hidden="true"/><span>Auditar 10/10</span></button>
  <div className="hqaLive" role="status" aria-live="polite" aria-atomic="true">{busy?'Actualizando auditoría':error||(report?`Calidad ${report.score.toFixed(2)} de ${report.maximum}; diez de diez ${report.tenOutOfTen?'acreditado':'no acreditado'}`:'')}</div>
  {open&&<div className="hqaBackdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
   <section id="hqaDialog" className="hqaDialog" role="dialog" aria-modal="true" aria-labelledby="hqaTitle" aria-describedby="hqaDescription" aria-busy={busy}>
    <header><div><span>AUDITORÍA OBJETIVA</span><h2 id="hqaTitle">Calidad de Héctor OS</h2></div><button ref={close} type="button" onClick={()=>setOpen(false)} aria-label="Cerrar auditoría"><X aria-hidden="true"/></button></header>
    <div className="hqaBody">
     <p id="hqaDescription">La puntuación sólo aumenta con evidencia observable. La arquitectura, el volumen de código y la apariencia no acreditan 10/10.</p>
     {error&&<div className="hqaError" role="alert">{error}<button type="button" onClick={()=>void load()}>Reintentar</button></div>}
     {!error&&!report&&<div className="hqaLoading" role="status"><RefreshCw aria-hidden="true"/>Cargando evidencia…</div>}
     {report&&<>
      <section className="hqaScore" aria-label={`Puntuación ${report.score.toFixed(2)} de ${report.maximum}`}><Gauge aria-hidden="true"/><div><strong>{report.score.toFixed(2)}</strong><span>/ {report.maximum}</span></div><p>Grado <b>{report.grade}</b><br/>10/10 acreditado: <b>{report.tenOutOfTen?'SÍ':'NO'}</b></p></section>
      <section className="hqaDimensions" aria-label="Diez dimensiones de calidad">{report.dimensions.map(item=><article key={item.id}><header><strong>{item.label}</strong><b>{item.score.toFixed(2)}/10</b></header><div role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={item.score}><i style={{width:`${Math.max(0,Math.min(100,item.score*10))}%`}}/></div><small>{item.gaps?.length?`${item.gaps.length} brecha${item.gaps.length===1?'':'s'} pendiente${item.gaps.length===1?'':'s'}`:'Sin brechas registradas'}</small></article>)}</section>
      <section className={`hqaBlockers ${report.criticalBlockers.length?'warning':'clear'}`}>{report.criticalBlockers.length?<AlertTriangle aria-hidden="true"/>:<CheckCircle2 aria-hidden="true"/>}<div><strong>{report.criticalBlockers.length} bloqueos críticos</strong>{report.criticalBlockers.length?<ul>{report.criticalBlockers.slice(0,8).map(item=><li key={item}>{item}</li>)}</ul>:<p>No quedan bloqueos críticos registrados.</p>}</div></section>
      <section className="hqaPriorities"><h3>Prioridades verificables</h3><ol>{report.topPriorities.slice(0,6).map(item=><li key={item}>{item}</li>)}</ol></section>
      <button className="hqaRefresh" type="button" onClick={()=>void load()} disabled={busy}><RefreshCw aria-hidden="true"/>{busy?'Actualizando':'Actualizar evidencia'}</button>
     </>}
    </div>
   </section>
  </div>}
 </>;
}
