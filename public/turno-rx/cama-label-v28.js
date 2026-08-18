function applyCamaLabel(root=document){
  root.querySelectorAll?.('.imaging-table').forEach((table)=>{
    const firstHeader=table.querySelector('thead th:first-child');
    if(firstHeader && firstHeader.textContent?.trim()!=='Cama') firstHeader.textContent='Cama';
    table.querySelectorAll('.bed-cell').forEach((cell)=>cell.setAttribute('data-label','Cama'));
  });
}

let scheduled=false;
function schedule(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{
    scheduled=false;
    applyCamaLabel(document);
  });
}

function start(){
  applyCamaLabel(document);
  const target=document.getElementById('app')||document.body;
  if(target)new MutationObserver(schedule).observe(target,{childList:true,subtree:true});
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
