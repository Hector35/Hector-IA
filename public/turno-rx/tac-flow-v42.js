(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  let gesture = null;
  const readRows = () => { try { const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); return Array.isArray(value)?value:[]; } catch { return []; } };
  function markRealizado(id) {
    let changed=false;
    const next=readRows().map((row)=>String(row?.id??'')===String(id)&&row.status!=='Realizado'?(changed=true,{...row,status:'Realizado',realizedAt:new Date().toISOString()}):row);
    if(!changed)return;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
    location.reload();
  }
  document.addEventListener('touchstart',(event)=>{const row=event.target.closest?.('.imaging-row[data-modality="TAC"]');if(!row||event.touches.length!==1)return;const touch=event.touches[0];gesture={row,x:touch.clientX,y:touch.clientY};},{passive:true});
  document.addEventListener('touchend',(event)=>{if(!gesture||event.changedTouches.length!==1){gesture=null;return;}const touch=event.changedTouches[0],dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y,row=gesture.row;gesture=null;if(dx < -72&&Math.abs(dx)>Math.abs(dy)*1.4)markRealizado(row.dataset.id);},{passive:true});
  window.TacFlowV42={markRealizado,readRows};
})();
