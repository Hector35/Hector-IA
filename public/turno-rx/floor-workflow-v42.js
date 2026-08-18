(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const SWIPE_THRESHOLD = 68;
  let gesture = null;

  function readRows() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Compatibilidad/fallback: v65 usa row-actions-v60 como único escritor de estado táctil.
  function markRealized(id) {
    const rows = readRows();
    let changed = false;
    const completedAt = new Date().toISOString();
    const next = rows.map((row) => {
      if (String(row?.id || '') !== String(id || '') || row?.status === 'Realizado') return row;
      changed = true;
      return {...row, status:'Realizado', completedAt};
    });
    if (!changed) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    document.dispatchEvent(new CustomEvent('pendientes:status-changed', {detail:{id:String(id),status:'Realizado',source:'Piso-fallback'}}));
  }

  function floorRow(target) {
    return target?.closest?.('.floor-patient-row[data-id]') || null;
  }

  function start(event) {
    const row = floorRow(event.target);
    if (!row || event.target.closest?.('button') || row.dataset.status === 'Realizado') return;
    const touch = event.touches?.[0];
    if (!touch) return;
    gesture = {row, x:touch.clientX, y:touch.clientY, dx:0};
  }

  function move(event) {
    if (!gesture) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (Math.abs(dy) > Math.abs(dx) || dx > 0) return;
    gesture.dx = dx;
    gesture.row.style.transform = `translateX(${Math.max(dx, -92)}px)`;
    gesture.row.classList.toggle('is-swipe-ready', dx <= -SWIPE_THRESHOLD);
    if (Math.abs(dx) > 12) event.preventDefault();
  }

  function end() {
    if (!gesture) return;
    const {row, dx} = gesture;
    gesture = null;
    row.style.transform = '';
    row.classList.remove('is-swipe-ready');
    if (dx <= -SWIPE_THRESHOLD && window.__PENDIENTES_GLOBAL_STATUS_GESTURES__ !== true) markRealized(row.dataset.id);
  }

  const style = document.createElement('style');
  style.textContent = `
    .floor-patient-row{transition:transform .16s ease,opacity .16s ease;touch-action:pan-y}
    .floor-patient-row.is-swipe-ready{background:color-mix(in srgb,#16a34a 12%,transparent)}
    .floor-patient-row.is-realized{opacity:.62}
    .floor-status{font-size:10px;font-weight:800;color:#15803d;white-space:nowrap}
    .floor-transport{font-size:11px;font-weight:700;white-space:nowrap}
  `;
  document.head.appendChild(style);
  document.addEventListener('touchstart', start, {passive:true});
  document.addEventListener('touchmove', move, {passive:false});
  document.addEventListener('touchend', end, {passive:true});
  document.addEventListener('touchcancel', end, {passive:true});
})();
