(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const SWIPE_MIN_X = 76;
  const SWIPE_MAX_MS = 1100;
  const UNDO_MS = 7000;

  let gesture = null;
  let suppressClickUntil = 0;
  let undoTimer = null;
  let undoState = null;
  let activeRealizedTab = '';

  const clean = (value) => String(value ?? '').trim();
  const plain = (value) => clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function readRows() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeRows(rows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }

  function categoryForRow(row) {
    const category = plain(row?.category);
    const modality = plain(row?.modality);
    const target = plain(row?.target || row?.study || row?.destination);

    if (category === 'piso') return 'Piso';
    if (category === 'tac' || modality === 'tac' || /\b(tac|tc|tomografia|angiotac)\b/.test(target)) return 'TAC';
    if (category === 'usg' || category === 'ultrasonido' || modality === 'ultrasonido' || /\b(usg|ultrasonido|ecografia)\b/.test(target)) return 'USG';
    return 'RX';
  }

  function activeTab() {
    return document.querySelector('[data-category-tab].is-active')?.dataset?.categoryTab ||
      document.querySelector('[data-category-tab][aria-selected="true"]')?.dataset?.categoryTab ||
      'Piso';
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest?.('button, a, input, select, textarea, label, [data-quick-transport="1"], [role="button"]'));
  }

  function displayBed(row) {
    const bed = clean(row?.bed || row?.origin);
    return bed || 'Sin cama';
  }

  function displayName(row) {
    return clean(row?.name) || 'Sin nombre';
  }

  function displayTarget(row) {
    return clean(row?.target || row?.destination || row?.study) || 'Sin destino/estudio';
  }

  function setStatus(id, status, options = {}) {
    const rows = readRows();
    const index = rows.findIndex((row) => String(row?.id ?? '') === String(id ?? ''));
    if (index < 0) return false;

    const previous = clean(rows[index]?.status) || 'Pendiente';
    if (previous.toLowerCase() === status.toLowerCase()) return false;

    rows[index] = {
      ...rows[index],
      status,
      statusUpdatedAt: new Date().toISOString()
    };
    writeRows(rows);

    document.dispatchEvent(new CustomEvent('pendientes:status-changed', {
      detail: { id: String(id), status, previousStatus: previous }
    }));

    if (options.undo !== false) showUndo(id, previous, status);
    queueMicrotask(refreshRealizedUI);
    return true;
  }

  function ensureUndo() {
    let bar = document.getElementById('v60StatusUndo');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'v60StatusUndo';
    bar.className = 'v60-status-undo';
    bar.hidden = true;
    bar.innerHTML = '<span id="v60StatusUndoText"></span><button type="button" id="v60StatusUndoButton">Deshacer</button>';
    document.body.appendChild(bar);
    bar.querySelector('#v60StatusUndoButton')?.addEventListener('click', () => {
      const current = undoState;
      hideUndo();
      if (!current) return;
      setStatus(current.id, current.previousStatus, { undo: false });
    });
    return bar;
  }

  function showUndo(id, previousStatus, nextStatus) {
    const bar = ensureUndo();
    undoState = { id: String(id), previousStatus, nextStatus };
    const text = bar.querySelector('#v60StatusUndoText');
    if (text) text.textContent = nextStatus === 'Realizado' ? 'Marcado como realizado' : 'Regresó a pendiente';
    bar.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, UNDO_MS);
  }

  function hideUndo() {
    clearTimeout(undoTimer);
    undoTimer = null;
    undoState = null;
    const bar = document.getElementById('v60StatusUndo');
    if (bar) bar.hidden = true;
  }

  function ensureRealizedUI() {
    let pill = document.getElementById('v60RealizedPill');
    if (!pill) {
      pill = document.createElement('button');
      pill.id = 'v60RealizedPill';
      pill.className = 'v60-realized-pill';
      pill.type = 'button';
      pill.hidden = true;
      document.body.appendChild(pill);
      pill.addEventListener('click', openRealizedSheet);
    }

    let backdrop = document.getElementById('v60RealizedBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'v60RealizedBackdrop';
      backdrop.className = 'v60-realized-backdrop';
      backdrop.hidden = true;
      backdrop.innerHTML = `
        <section class="v60-realized-sheet" role="dialog" aria-modal="true" aria-labelledby="v60RealizedTitle">
          <div class="v60-realized-handle" aria-hidden="true"></div>
          <header class="v60-realized-head">
            <div><small>ESTADO</small><h2 id="v60RealizedTitle">Realizados</h2></div>
            <button type="button" id="v60RealizedClose" aria-label="Cerrar">×</button>
          </header>
          <div class="v60-realized-help">Desliza a la derecha o toca “Pendiente” para regresar un paciente.</div>
          <div id="v60RealizedList" class="v60-realized-list"></div>
        </section>`;
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeRealizedSheet();
      });
      backdrop.querySelector('#v60RealizedClose')?.addEventListener('click', closeRealizedSheet);
      backdrop.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-v60-restore]');
        if (!button) return;
        setStatus(button.dataset.v60Restore, 'Pendiente');
      });
    }

    return { pill, backdrop };
  }

  function realizedRowsFor(tab) {
    return readRows().filter((row) => clean(row?.status).toLowerCase() === 'realizado' && categoryForRow(row) === tab);
  }

  function renderRealizedList(tab) {
    const backdrop = document.getElementById('v60RealizedBackdrop');
    const list = backdrop?.querySelector('#v60RealizedList');
    const title = backdrop?.querySelector('#v60RealizedTitle');
    if (!list) return;

    const realized = realizedRowsFor(tab);
    if (title) title.textContent = `Realizados · ${tab}`;

    if (!realized.length) {
      list.innerHTML = '<div class="v60-realized-empty">No hay realizados en esta categoría.</div>';
      return;
    }

    list.innerHTML = realized.map((row) => `
      <article class="v60-realized-row" data-v60-realized-id="${String(row.id).replace(/"/g, '&quot;')}">
        <div class="v60-realized-copy">
          <strong>${escapeHtml(displayBed(row))} · ${escapeHtml(displayName(row))}</strong>
          <span>${escapeHtml(displayTarget(row))}</span>
        </div>
        <button type="button" data-v60-restore="${String(row.id).replace(/"/g, '&quot;')}">↩ Pendiente</button>
      </article>`).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function refreshRealizedUI() {
    const { pill, backdrop } = ensureRealizedUI();
    const tab = activeTab();
    const count = realizedRowsFor(tab).length;
    pill.hidden = count === 0;
    pill.textContent = count ? `✓ Realizados ${count}` : '';
    pill.setAttribute('aria-label', `${count} realizados en ${tab}`);

    if (!backdrop.hidden) {
      activeRealizedTab = tab;
      renderRealizedList(tab);
    }
  }

  function openRealizedSheet() {
    const { backdrop } = ensureRealizedUI();
    activeRealizedTab = activeTab();
    renderRealizedList(activeRealizedTab);
    backdrop.hidden = false;
    document.body.classList.add('v60-realized-open');
  }

  function closeRealizedSheet() {
    const backdrop = document.getElementById('v60RealizedBackdrop');
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('v60-realized-open');
  }

  function rowFromTouchTarget(target) {
    return target?.closest?.('.patient-row[data-id]') || null;
  }

  function realizedRowFromTouchTarget(target) {
    return target?.closest?.('[data-v60-realized-id]') || null;
  }

  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const pendingRow = rowFromTouchTarget(event.target);
    const realizedRow = realizedRowFromTouchTarget(event.target);

    if (pendingRow && isInteractiveTarget(event.target)) return;
    if (!pendingRow && !realizedRow) return;

    gesture = {
      id: pendingRow?.dataset.id || realizedRow?.dataset.v60RealizedId || '',
      mode: pendingRow ? 'pending' : 'realized',
      x: touch.clientX,
      y: touch.clientY,
      startedAt: Date.now()
    };
  }, { passive: true, capture: true });

  document.addEventListener('touchend', (event) => {
    const current = gesture;
    gesture = null;
    if (!current || !event.changedTouches.length) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - current.x;
    const dy = touch.clientY - current.y;
    const elapsed = Date.now() - current.startedAt;

    if (elapsed > SWIPE_MAX_MS || Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * 1.25) return;

    if (current.mode === 'pending' && dx < 0) {
      suppressClickUntil = Date.now() + 500;
      setStatus(current.id, 'Realizado');
      return;
    }

    if (current.mode === 'realized' && dx > 0) {
      suppressClickUntil = Date.now() + 500;
      setStatus(current.id, 'Pendiente');
    }
  }, { passive: true, capture: true });

  document.addEventListener('touchcancel', () => { gesture = null; }, { passive: true, capture: true });

  document.addEventListener('click', (event) => {
    if (Date.now() < suppressClickUntil && event.target.closest?.('.patient-row, [data-v60-realized-id]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (event.target.closest?.('[data-category-tab]')) queueMicrotask(refreshRealizedUI);
  }, true);

  document.addEventListener('pendientes:status-changed', () => queueMicrotask(refreshRealizedUI));
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) refreshRealizedUI();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('v60RealizedBackdrop')?.hidden) closeRealizedSheet();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshRealizedUI, { once: true });
  } else {
    refreshRealizedUI();
  }
})();
