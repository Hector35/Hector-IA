(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const SHIFT_KEY = 'pendientes-shift-v1';
  const LEGACY_HISTORY_KEY = 'pendientes-shift-history-v1';
  const SNAPSHOT_KEY = 'pendientes-shift-snapshots-v37';

  let currentView = 'pending';
  let historyDetailId = null;
  let observer = null;
  let scheduled = false;

  const ICONS = {
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.8h4.6L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.2"/></svg>',
    photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="9" cy="9" r="1.7"/><path d="m5.5 17 4.2-4.3 3.1 3.1 2.1-2.2 3.6 3.4"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16.5-1 3.5 3.5-1L18.7 7.8a2.1 2.1 0 0 0 0-3l-.5-.5a2.1 2.1 0 0 0-3 0L5 14.5v2Z"/><path d="m13.8 5.7 4.5 4.5"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.2-5.7L3.5 8.5"/><path d="M3.5 4.5v4h4M12 7.5V12l3 2"/></svg>',
    stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11M12 19V5M19 19v-7"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a7 7 0 0 0-1.7-1L14.3 3h-4.6l-.4 3a7 7 0 0 0-1.7 1l-2.5-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1a7 7 0 0 0 1.7 1l.4 3h4.6l.4-3a7 7 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>'
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  }

  function inferShiftName(dateLike) {
    const date = new Date(dateLike || Date.now());
    const hour = Number.isNaN(date.getTime()) ? new Date().getHours() : date.getHours();
    if (hour >= 6 && hour < 15) return 'Matutino';
    if (hour >= 15 && hour < 23) return 'Vespertino';
    return 'Nocturno';
  }

  function formatShiftDate(dateLike) {
    const date = new Date(dateLike || Date.now());
    if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
    return new Intl.DateTimeFormat('es-MX', { day:'numeric', month:'short', year:'numeric' })
      .format(date)
      .replace(/\./g, '');
  }

  function snapshotId(shift, endedAt) {
    return String(shift?.id || `${shift?.startedAt || 'turno'}-${endedAt || ''}`);
  }

  function loadSnapshots() {
    const list = read(SNAPSHOT_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function saveSnapshots(list) {
    write(SNAPSHOT_KEY, Array.isArray(list) ? list : []);
  }

  function makeSnapshot(shift, shiftRows, endedAt) {
    const startedAt = shift?.startedAt || endedAt || new Date().toISOString();
    return {
      schemaVersion: 1,
      id: snapshotId(shift, endedAt),
      startedAt,
      endedAt: endedAt || new Date().toISOString(),
      shiftName: shift?.shiftName || inferShiftName(startedAt),
      rows: clone(Array.isArray(shiftRows) ? shiftRows : [])
    };
  }

  function storeSnapshot(snapshot) {
    if (!snapshot?.id) return;
    const current = loadSnapshots();
    if (current.some((item) => item?.id === snapshot.id)) return;
    current.unshift(snapshot);
    current.sort((a, b) => Date.parse(b?.startedAt || 0) - Date.parse(a?.startedAt || 0));
    saveSnapshots(current);
  }

  function migrateLegacyHistory() {
    const legacy = read(LEGACY_HISTORY_KEY, []);
    if (!Array.isArray(legacy) || !legacy.length) return;
    for (const entry of legacy) {
      const shift = entry?.shift || {};
      const snapshot = makeSnapshot(shift, entry?.rows || [], entry?.archivedAt || new Date().toISOString());
      storeSnapshot(snapshot);
    }
  }

  function currentShift() {
    return read(SHIFT_KEY, null) || { startedAt: new Date().toISOString() };
  }

  function currentRows() {
    const list = read(STORAGE_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function captureSnapshotAfterShiftChange(previousShift, previousRows) {
    setTimeout(() => {
      const nextShift = currentShift();
      if (!previousShift?.id || !nextShift?.id || previousShift.id === nextShift.id) return;
      storeSnapshot(makeSnapshot(previousShift, previousRows, new Date().toISOString()));
      historyDetailId = null;
      refreshSecondaryViews();
    }, 0);
  }

  function raw(value, fallback = '—') {
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  }

  function renderHistoryRow(row) {
    const age = row?.age === null || row?.age === undefined || row?.age === '' ? '' : `${raw(row.age)} a`;
    const sex = raw(row?.sex, '');
    const meta = [age, sex && sex !== 'No visible' ? sex : ''].filter(Boolean).join(' · ');
    const transport = raw(row?.transport || row?.transportType || row?.movement, '—');
    const oxygen = row?.oxygenProbable ? `<span class="v37-history-o2">O₂${row?.oxygenReason ? ` · ${esc(row.oxygenReason)}` : ''}</span>` : '';
    return `<tr>
      <td class="v37-h-bed">${esc(raw(row?.bed || row?.origin))}</td>
      <td><strong>${esc(raw(row?.name))}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}</td>
      <td>${esc(raw(row?.target || row?.study || row?.destination))}</td>
      <td><span class="v37-history-transport">${esc(transport)}</span>${oxygen}</td>
    </tr>`;
  }

  function renderHistory() {
    const host = document.getElementById('v37HistoryView');
    if (!host) return;
    const snapshots = loadSnapshots();
    const selected = historyDetailId ? snapshots.find((item) => item?.id === historyDetailId) : null;

    if (selected) {
      const rows = Array.isArray(selected.rows) ? selected.rows : [];
      host.innerHTML = `<div class="v37-view-head">
        <button type="button" class="v37-back" id="v37HistoryBack">‹</button>
        <div><h2>${esc(formatShiftDate(selected.startedAt))}</h2><p>${esc(selected.shiftName || inferShiftName(selected.startedAt))} · snapshot final</p></div>
      </div>
      <div class="v37-history-readonly">Solo lectura · ${rows.length} ${rows.length === 1 ? 'paciente' : 'pacientes'}</div>
      ${rows.length ? `<div class="v37-history-table-wrap"><table class="v37-history-table"><thead><tr><th>Origen</th><th>Paciente</th><th>Destino / estudio</th><th>Traslado</th></tr></thead><tbody>${rows.map(renderHistoryRow).join('')}</tbody></table></div>` : '<div class="v37-empty-secondary">Este turno terminó sin pacientes pendientes.</div>'}`;
      document.getElementById('v37HistoryBack')?.addEventListener('click', () => { historyDetailId = null; renderHistory(); });
      return;
    }

    host.innerHTML = `<div class="v37-view-title"><div><h2>Historial de turnos</h2><p>Snapshots finales, sin recalcular datos históricos.</p></div></div>
      ${snapshots.length ? `<div class="v37-history-list">${snapshots.map((item) => {
        const count = Array.isArray(item?.rows) ? item.rows.length : 0;
        return `<button type="button" class="v37-history-item" data-snapshot-id="${esc(item.id)}">
          <span><strong>${esc(formatShiftDate(item.startedAt))} · ${esc(item.shiftName || inferShiftName(item.startedAt))}</strong><small>${count} ${count === 1 ? 'paciente' : 'pacientes'}</small></span>${ICONS.chevron}
        </button>`;
      }).join('')}</div>` : '<div class="v37-empty-secondary"><strong>Aún no hay turnos archivados.</strong><span>Al iniciar un turno nuevo, el turno anterior quedará guardado aquí.</span></div>'}`;

    host.querySelectorAll('[data-snapshot-id]').forEach((button) => button.addEventListener('click', () => {
      historyDetailId = button.dataset.snapshotId;
      renderHistory();
    }));
  }

  function renderStats() {
    const host = document.getElementById('v37StatsView');
    if (!host) return;
    const snapshots = loadSnapshots();
    const archivedPatients = snapshots.reduce((sum, item) => sum + (Array.isArray(item?.rows) ? item.rows.length : 0), 0);
    const current = currentRows().length;
    host.innerHTML = `<div class="v37-view-title"><div><h2>Estadísticas</h2><p>Resumen operativo de los turnos guardados.</p></div></div>
      <div class="v37-stat-grid">
        <div class="v37-stat"><span>Ahora</span><strong>${current}</strong><small>pendientes</small></div>
        <div class="v37-stat"><span>Turnos</span><strong>${snapshots.length}</strong><small>archivados</small></div>
        <div class="v37-stat"><span>Histórico</span><strong>${archivedPatients}</strong><small>registros</small></div>
      </div>`;
  }

  function renderSettings() {
    const host = document.getElementById('v37SettingsView');
    if (!host) return;
    const shift = currentShift();
    host.innerHTML = `<div class="v37-view-title"><div><h2>Configuración</h2><p>Acciones secundarias del turno.</p></div></div>
      <section class="v37-settings-card">
        <div><span>Turno actual</span><strong>${esc(formatShiftDate(shift.startedAt))} · ${esc(inferShiftName(shift.startedAt))}</strong><small>Los datos actuales permanecen en el almacenamiento existente.</small></div>
        <button type="button" class="v37-danger-soft" id="v37NewShift">Iniciar turno nuevo</button>
      </section>
      <section class="v37-settings-card v37-settings-note">
        <div><span>Historial</span><strong>Snapshots inmutables</strong><small>Los turnos archivados se muestran como quedaron guardados; no se recalculan con reglas futuras.</small></div>
      </section>`;
    document.getElementById('v37NewShift')?.addEventListener('click', () => document.getElementById('newShift')?.click());
  }

  function refreshSecondaryViews() {
    renderHistory();
    renderStats();
    renderSettings();
    updateShiftBadge();
  }

  function updateShiftBadge() {
    const badge = document.getElementById('v37ShiftBadge');
    if (!badge) return;
    const shift = currentShift();
    const label = inferShiftName(shift.startedAt);
    if (badge.textContent !== label) badge.textContent = label;
  }

  function closeDrawer() {
    const drawer = document.getElementById('v37Drawer');
    const backdrop = document.getElementById('v37DrawerBackdrop');
    if (drawer) drawer.dataset.open = '0';
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('v37-drawer-open');
  }

  function openDrawer() {
    const drawer = document.getElementById('v37Drawer');
    const backdrop = document.getElementById('v37DrawerBackdrop');
    if (drawer) drawer.dataset.open = '1';
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('v37-drawer-open');
  }

  function setView(view) {
    currentView = ['pending','history','stats','settings'].includes(view) ? view : 'pending';
    const capture = document.querySelector('.v37-capture-bar');
    if (capture) capture.hidden = currentView !== 'pending';
    document.querySelectorAll('.v37-view').forEach((node) => { node.hidden = node.dataset.view !== currentView; });
    document.querySelectorAll('.v37-nav-item').forEach((node) => node.classList.toggle('is-active', node.dataset.view === currentView));
    if (currentView !== 'history') historyDetailId = null;
    refreshSecondaryViews();
    closeDrawer();
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function buildDrawer(root) {
    if (root.querySelector('#v37Drawer')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'v37DrawerBackdrop';
    backdrop.className = 'v37-drawer-backdrop';
    backdrop.hidden = true;
    const drawer = document.createElement('aside');
    drawer.id = 'v37Drawer';
    drawer.className = 'v37-drawer';
    drawer.dataset.open = '0';
    drawer.setAttribute('aria-label', 'Menú principal');
    drawer.innerHTML = `<div class="v37-drawer-head"><span class="v37-app-mark">P</span><div><strong>Pendientes</strong><small>Turno operativo</small></div></div>
      <nav class="v37-nav">
        <button type="button" class="v37-nav-item" data-view="pending">${ICONS.list}<span>Pendientes</span></button>
        <button type="button" class="v37-nav-item" data-view="history">${ICONS.history}<span>Historial de turnos</span></button>
        <button type="button" class="v37-nav-item" data-view="stats">${ICONS.stats}<span>Estadísticas</span></button>
        <button type="button" class="v37-nav-item" data-view="settings">${ICONS.settings}<span>Configuración</span></button>
      </nav>`;
    root.append(backdrop, drawer);
    backdrop.addEventListener('click', closeDrawer);
    drawer.querySelectorAll('.v37-nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  }

  function prepareGalleryInput(mode) {
    const input = document.getElementById('galleryInput');
    if (!input) return null;
    if (mode === 'camera') {
      input.setAttribute('capture', 'environment');
      input.removeAttribute('multiple');
      input.dataset.v37CaptureMode = 'camera';
    } else {
      input.removeAttribute('capture');
      input.setAttribute('multiple', '');
      input.dataset.v37CaptureMode = 'gallery';
    }
    return input;
  }

  function wireCaptureActions(main) {
    main.querySelector('#v37Menu')?.addEventListener('click', openDrawer);
    main.querySelector('#v37Camera')?.addEventListener('click', () => prepareGalleryInput('camera')?.click());
    main.querySelector('#v37Photo')?.addEventListener('click', () => prepareGalleryInput('gallery')?.click());
    main.querySelector('#v37Manual')?.addEventListener('click', () => document.getElementById('manualCapture')?.click());
    const input = document.getElementById('galleryInput');
    input?.addEventListener('change', () => {
      queueMicrotask(() => {
        input.removeAttribute('capture');
        input.setAttribute('multiple', '');
        delete input.dataset.v37CaptureMode;
      });
    }, { capture:true, once:true });
  }

  function enhance() {
    document.documentElement.classList.add('pendientes-v37');
    migrateLegacyHistory();

    const root = document.getElementById('app');
    const main = root?.querySelector('.app-shell');
    if (!root || !main) return;
    buildDrawer(root);

    if (main.dataset.v37Enhanced === '1') {
      updateShiftBadge();
      return;
    }
    main.dataset.v37Enhanced = '1';

    const topbar = main.querySelector('.topbar');
    const status = main.querySelector('#captureStatus');

    const header = document.createElement('header');
    header.className = 'v37-header';
    header.innerHTML = `<button type="button" class="v37-menu-btn" id="v37Menu" aria-label="Abrir menú">${ICONS.menu}</button><h1>Pendientes</h1><span class="v37-shift-badge" id="v37ShiftBadge"></span>`;

    const capture = document.createElement('section');
    capture.className = 'v37-capture-bar';
    capture.setAttribute('aria-label', 'Captura rápida');
    capture.innerHTML = `<button type="button" class="v37-capture-btn" id="v37Camera">${ICONS.camera}<span>Cámara</span></button><button type="button" class="v37-capture-btn" id="v37Photo">${ICONS.photo}<span>Foto</span></button><button type="button" class="v37-capture-btn v37-primary" id="v37Manual">${ICONS.pencil}<span>Manual</span></button>`;

    if (topbar) topbar.insertAdjacentElement('beforebegin', header);
    else main.prepend(header);
    header.insertAdjacentElement('afterend', capture);
    if (status) capture.insertAdjacentElement('afterend', status);

    const pending = document.createElement('section');
    pending.id = 'v37PendingView';
    pending.className = 'v37-view v37-pending-view';
    pending.dataset.view = 'pending';

    const keep = new Set([topbar, header, capture, status].filter(Boolean));
    [...main.children].forEach((child) => {
      if (!keep.has(child) && !child.classList.contains('v37-view')) pending.appendChild(child);
    });
    main.appendChild(pending);

    const history = document.createElement('section');
    history.id = 'v37HistoryView';
    history.className = 'v37-view v37-secondary-view';
    history.dataset.view = 'history';
    history.hidden = true;
    const stats = document.createElement('section');
    stats.id = 'v37StatsView';
    stats.className = 'v37-view v37-secondary-view';
    stats.dataset.view = 'stats';
    stats.hidden = true;
    const settings = document.createElement('section');
    settings.id = 'v37SettingsView';
    settings.className = 'v37-view v37-secondary-view';
    settings.dataset.view = 'settings';
    settings.hidden = true;
    main.append(history, stats, settings);

    wireCaptureActions(main);
    setView(currentView);
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhance();
    });
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('#newShift');
    if (!trigger) return;
    const previousShift = clone(currentShift());
    const previousRows = clone(currentRows());
    captureSnapshotAfterShiftChange(previousShift, previousRows);
  }, true);

  function start() {
    migrateLegacyHistory();
    enhance();
    const root = document.getElementById('app');
    if (!root || observer) return;
    observer = new MutationObserver(scheduleEnhance);
    observer.observe(root, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
