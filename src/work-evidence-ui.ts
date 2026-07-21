type WorkJob={id:string;title:string;kind:string;status:string;progress:number;result?:string|null;updated_at?:string};
type Evidence={id:string;source:string;url:string;title:string|null;http_status:number|null;errors:string[];run_id:string|null;created_at:string;has_screenshot:boolean;file_id:string|null};

const api=async<T>(path:string):Promise<T>=>{
 const response=await fetch(path,{credentials:'include',headers:{Accept:'application/json'}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'No disponible');
 return data as T;
};

const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string)=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=text;
 return node;
};

function formatDate(value:string){
 const normalized=value.includes('T')?value:`${value.replace(' ','T')}Z`;
 const date=new Date(normalized);
 return Number.isNaN(date.getTime())?'Fecha no disponible':date.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'});
}

function statusLabel(status:string){return({queued:'En cola',working:'Trabajando',testing:'Probando',repairing:'Corrigiendo',completed:'Completado',blocked:'Bloqueado'} as Record<string,string>)[status]||status;}

export function installWorkEvidenceEnhancer(){
 let selectedJobId:string|undefined;
 let timer:number|undefined;
 let mountedRoot:HTMLElement|undefined;

 const findWorkPage=()=>[...document.querySelectorAll<HTMLElement>('.cxPage')].find(page=>page.querySelector('h1')?.textContent?.trim()==='Trabajo');

 const renderEvidence=async(container:HTMLElement,job:WorkJob)=>{
  container.replaceChildren(el('div','cxWorkEvidenceLoading','Cargando evidencia…'));
  try{
   const response=await api<{items:Evidence[]}>(`/api/work-evidence/jobs/${job.id}`);
   const items=response.items||[];
   if(!items.length){container.replaceChildren(el('div','cxWorkEvidenceEmpty','Este trabajo todavía no tiene capturas ni informes de navegador.'));return;}
   const grid=el('div','cxEvidenceGrid');
   for(const item of items){
    const card=el('article','cxEvidenceCard');
    if(item.has_screenshot){
     const image=document.createElement('img');
     image.src=`/api/work-evidence/jobs/${job.id}/${item.id}/screenshot`;
     image.alt=item.title||'Captura de verificación';
     image.loading='lazy';
     card.append(image);
    }
    const body=el('div','cxEvidenceBody');
    const header=el('header');
    const title=el('strong',undefined,item.title||new URL(item.url).hostname);
    const badge=el('span',item.http_status&&item.http_status>=400?'bad':'good',item.http_status===null?'HTTP —':`HTTP ${item.http_status}`);
    header.append(title,badge);
    const meta=el('p','cxEvidenceMeta',`${item.source} · ${formatDate(item.created_at)}`);
    const target=document.createElement('a');target.href=item.url;target.target='_blank';target.rel='noreferrer';target.textContent=item.url;
    body.append(header,meta,target);
    if(item.errors.length){const errors=el('details','cxEvidenceErrors');const summary=el('summary',undefined,`${item.errors.length} error${item.errors.length===1?'':'es'}`);const list=el('ul');item.errors.slice(0,8).forEach(error=>list.append(el('li',undefined,error)));errors.append(summary,list);body.append(errors);}
    const actions=el('div','cxEvidenceActions');
    const report=document.createElement('a');report.href=`/api/work-evidence/jobs/${job.id}/${item.id}/report`;report.target='_blank';report.rel='noreferrer';report.textContent='Abrir informe';actions.append(report);
    if(item.file_id){const file=document.createElement('a');file.href=`/api/files/${item.file_id}/download`;file.textContent='Descargar captura';actions.append(file);}
    body.append(actions);card.append(body);grid.append(card);
   }
   container.replaceChildren(grid);
  }catch(error){container.replaceChildren(el('div','cxWorkEvidenceError',error instanceof Error?error.message:'No se pudo cargar la evidencia'));}
 };

 const render=async(root:HTMLElement)=>{
  if(root.dataset.evidenceReady==='1')return;
  root.dataset.evidenceReady='1';mountedRoot=root;
  const section=el('section','cxWorkRuns');
  const head=el('div','cxWorkRunsHead');const heading=el('div');heading.append(el('span',undefined,'Ejecuciones persistentes'),el('h2',undefined,'Trabajos y evidencia'));head.append(heading);section.append(head);
  const layout=el('div','cxWorkRunsLayout');const jobs=el('div','cxWorkJobList');const detail=el('section','cxWorkEvidenceDetail');detail.append(el('div','cxWorkEvidenceEmpty','Selecciona un trabajo para revisar sus capturas e informes.'));layout.append(jobs,detail);section.append(layout);
  root.querySelector('.cxPageHead')?.insertAdjacentElement('afterend',section);

  const loadJobs=async()=>{
   try{
    const response=await api<{items:WorkJob[]}>('/api/work/jobs');const items=response.items||[];
    jobs.replaceChildren();
    if(!items.length){jobs.append(el('div','cxWorkEvidenceEmpty','Todavía no hay ejecuciones persistentes.'));return;}
    for(const job of items){
     const button=el('button',selectedJobId===job.id?'active':'');button.type='button';
     const top=el('div','cxWorkJobTop');top.append(el('strong',undefined,job.title),el('span',`status ${job.status}`,statusLabel(job.status)));
     const meta=el('div','cxWorkJobMeta',`${job.kind} · ${Math.max(0,Math.min(100,Number(job.progress)||0))}%`);
     const progress=document.createElement('progress');progress.max=100;progress.value=Math.max(0,Math.min(100,Number(job.progress)||0));
     button.append(top,meta,progress);
     button.onclick=()=>{selectedJobId=job.id;[...jobs.children].forEach(x=>x.classList.remove('active'));button.classList.add('active');detail.replaceChildren();const title=el('div','cxWorkEvidenceTitle');title.append(el('span',undefined,'Evidencia verificada'),el('h3',undefined,job.title));detail.append(title);const content=el('div','cxWorkEvidenceContent');detail.append(content);void renderEvidence(content,job);};
     jobs.append(button);
    }
   }catch(error){jobs.replaceChildren(el('div','cxWorkEvidenceError',error instanceof Error?error.message:'No se pudieron cargar los trabajos'));}
  };
  await loadJobs();
  timer=window.setInterval(()=>{if(document.body.contains(root))void loadJobs();},8000);
 };

 const scan=()=>{const page=findWorkPage();if(page&&!page.dataset.evidenceReady)void render(page);if(mountedRoot&&!document.body.contains(mountedRoot)){mountedRoot=undefined;selectedJobId=undefined;if(timer)window.clearInterval(timer);timer=undefined;}};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();
 return()=>{observer.disconnect();if(timer)window.clearInterval(timer);};
}
