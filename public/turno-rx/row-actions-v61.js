(() => {
  const PREVIEW_X = 18;
  const ARMED_X = 76;
  let gesture = null;

  function interactive(target) {
    return Boolean(target?.closest?.('button, a, input, select, textarea, label, [data-quick-transport="1"], [role="button"]'));
  }

  function clear(row) {
    row?.classList?.remove('v61-swipe-preview', 'v61-swipe-armed');
  }

  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    const row = event.target.closest?.('.imaging-row.patient-row[data-id]');
    if (!row || interactive(event.target)) return;
    const touch = event.touches[0];
    gesture = { row, x: touch.clientX, y: touch.clientY };
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', (event) => {
    const current = gesture;
    if (!current || !event.touches.length || !current.row?.isConnected) return;
    const touch = event.touches[0];
    const dx = touch.clientX - current.x;
    const dy = touch.clientY - current.y;

    if (Math.abs(dy) > Math.abs(dx)) {
      clear(current.row);
      return;
    }

    if (dx <= -PREVIEW_X) current.row.classList.add('v61-swipe-preview');
    else current.row.classList.remove('v61-swipe-preview');

    if (dx <= -ARMED_X) current.row.classList.add('v61-swipe-armed');
    else current.row.classList.remove('v61-swipe-armed');
  }, { passive: true, capture: true });

  function finish() {
    const row = gesture?.row;
    gesture = null;
    if (!row) return;
    setTimeout(() => clear(row), 160);
  }

  document.addEventListener('touchend', finish, { passive: true, capture: true });
  document.addEventListener('touchcancel', finish, { passive: true, capture: true });
})();
