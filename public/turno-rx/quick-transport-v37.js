(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  let internalWrite = false;
  let activeEditingId = null;
  let activeRowId = null;
  let activeAnchor = null;
  let observer = null;
  let syncScheduled = false;

  const normalize = (value) => String(value ?? '').trim();
  const normalizeTransport = (value) => {
    const text = normalize(value).toLowerCase();
    if (text.includes('camilla')) return 'Camilla';
    if (text.includes('silla')) return 'Silla';
    if (text.includes('no traslad')) return 'No trasladar';
    if (text.includes('definir') || text.includes('pendiente')) return 'Por definir';
    return '';
  };

  function readRows() {
    try {
      const raw = nativeGetItem.call(localStorage, STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeRows(rows) {
    internalWrite = true;
    try {
      nativeSetItem.call(localStorage, STORAGE_KEY, JSON.stringify(rows));
    } finally {
      internalWrite = false;
    }
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    if (this !== localStorage || key !== STORAGE_KEY || internalWrite) {
      return nativeSetItem.call(this, key, value);
    }

    try {
      const incoming = JSON.parse(value);
      if (!Array.isArray(incoming)) return nativeSetItem.call(this, key, value);

      const current = readRows();
      const locked = new Map(
        current
          .filter((row) => row?.manualTransportOverride === true && row?.id)
          .map((row) => [String(row.id), row])
      );

      const protectedRows = incoming.map((row) => {
        const previous = locked.get(String(row?.id ?? ''));
        if (!previous) return row;
        const transport = normalizeTransport(previous.transport);
        return {
          ...row,
          transport: transport === 'Silla' || transport === 'Camilla' ? transport : row.transport,
          transportReason: previous.transportReason ?? row.transportReason ?? '',
          manualTransportOverride: true,
          manualTransportUpdatedAt: previous.manualTransportUpdatedAt || row.manualTransportUpdatedAt || null
        };
      });

      return nativeSetItem.call(this, key, JSON.stringify(protectedRows));
    } catch {
      return nativeSetItem.call(this, key, value);
    }
  };

  function ensureStyles() {
    if (document.getElementById('quickTransportV37Styles')) return;
    const style = document.createElement('style');
    style.id = 'quickTransportV37Styles';
    style.textContent = `
      .transport-main[data-quick-transport="1"] {
        position: relative;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        padding-right: 15px !important;
      }
      .transport-main[data-quick-transport="1"]::after {
        content: '⌄';
        position: absolute;
        right: 2px;
        top: 50%;
        transform: translateY(-54%);
        font-size: 11px;
        line-height: 1;
        opacity: .5;
        pointer-events: none;
      }
      .transport-main[data-quick-transport="1"]:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
        border-radius: 7px;
      }
      .transport-main[data-manual-transport="1"]::after {
        opacity: .8;
      }
      .quick-transport-popover-v37 {
        position: fixed;
        z-index: 10050;
        min-width: 150px;
        padding: 6px;
        border: 1px solid rgba(30, 52, 68, .14);
        border-radius: 14px;
        background: rgba(255, 255, 255, .98);
        box-shadow: 0 14px 36px rgba(28, 45, 57, .18);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }
      .quick-transport-popover-v37[hidden] { display: none !important; }
      .quick-transport-option-v37 {
        width: 100%;
        min-height: 42px;
        display: flex;
        align-items: center;
        gap: 9px;
        border: 0;
        border-radius: 10px;
        padding: 8px 11px;
        background: transparent;
        color: #1b2b36;
        font: inherit;
        font-size: 14px;
        font-weight: 700;
        text-align: left;
      }
      .quick-transport-option-v37 + .quick-transport-option-v37 { margin-top: 2px; }
      .quick-transport-option-v37:active,
      .quick-transport-option-v37.is-current {
        background: rgba(28, 92, 122, .09);
      }
      .quick-transport-option-v37 .quick-check-v37 {
        margin-left: auto;
        opacity: 0;
        font-size: 12px;
      }
      .quick-transport-option-v37.is-current .quick-check-v37 { opacity: .75; }
      @media (max-width: 520px) {
        .quick-transport-popover-v37 { min-width: 144px; }
        .quick-transport-option-v37 { min-height: 44px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePopover() {
    let popover = document.getElementById('quickTransportPopoverV37');
    if (popover) return popover;
    popover = document.createElement('div');
    popover.id = 'quickTransportPopoverV37';
    popover.className = 'quick-transport-popover-v37';
    popover.setAttribute('role', 'menu');
    popover.setAttribute('aria-label', 'Cambiar medio de traslado');
    popover.hidden = true;
    popover.innerHTML = `
      <button type="button" class="quick-transport-option-v37" data-quick-value="Silla" role="menuitem">
        <span aria-hidden="true">♿</span><span>Silla</span><span class="quick-check-v37" aria-hidden="true">✓</span>
      </button>
      <button type="button" class="quick-transport-option-v37" data-quick-value="Camilla" role="menuitem">
        <span aria-hidden="true">🛏️</span><span>Camilla</span><span class="quick-check-v37" aria-hidden="true">✓</span>
      </button>
    `;
    document.body.appendChild(popover);
    return popover;
  }

  function rowById(id) {
    return readRows().find((row) => String(row?.id ?? '') === String(id ?? '')) || null;
  }

  function applyStoredStateToRow(tr, storedRow) {
    if (!tr || !storedRow) return;
    const transport = normalizeTransport(storedRow.transport);
    const main = tr.querySelector('.transport-main');
    const label = main?.querySelector('b');
    const icon = main?.querySelector('span');
    if (!main || !label) return;

    if (storedRow.manualTransportOverride === true && (transport === 'Silla' || transport === 'Camilla')) {
      main.classList.remove('silla', 'camilla', 'no-transfer', 'unset');
      main.classList.add(transport === 'Silla' ? 'silla' : 'camilla');
      label.textContent = transport;
      if (icon) icon.textContent = transport === 'Silla' ? '♿' : '🛏️';
      main.dataset.manualTransport = '1';
      main.removeAttribute('data-inferred');

      const reason = tr.querySelector('.transport-reason');
      if (reason) {
        const text = normalize(storedRow.transportReason);
        reason.classList.toggle('is-empty', !text);
        reason.innerHTML = `<span>Motivo</span>${escapeHtml(text || '—')}`;
      }
    } else {
      delete main.dataset.manualTransport;
    }

    const visible = normalizeTransport(label.textContent);
    if (visible === 'Silla' || visible === 'Camilla') {
      main.dataset.quickTransport = '1';
      main.setAttribute('role', 'button');
      main.setAttribute('tabindex', '0');
      main.setAttribute('aria-label', `Cambiar traslado. Actual: ${visible}`);
    } else {
      delete main.dataset.quickTransport;
      main.removeAttribute('role');
      main.removeAttribute('tabindex');
      main.removeAttribute('aria-label');
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function syncRowsFromStorage() {
    syncScheduled = false;
    const stored = new Map(readRows().filter((row) => row?.id).map((row) => [String(row.id), row]));
    document.querySelectorAll('.patient-row[data-id]').forEach((tr) => {
      const row = stored.get(String(tr.dataset.id || ''));
      if (row) applyStoredStateToRow(tr, row);
    });
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    queueMicrotask(syncRowsFromStorage);
  }

  function positionPopover(popover, anchor) {
    popover.style.visibility = 'hidden';
    popover.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    const margin = 10;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + box.width > window.innerWidth - margin) left = window.innerWidth - box.width - margin;
    if (left < margin) left = margin;
    if (top + box.height > window.innerHeight - margin) top = Math.max(margin, rect.top - box.height - 6);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.style.visibility = 'visible';
  }

  function closePopover() {
    const popover = document.getElementById('quickTransportPopoverV37');
    if (popover) popover.hidden = true;
    activeRowId = null;
    activeAnchor = null;
  }

  function openPopover(tr, anchor) {
    const id = tr?.dataset?.id;
    if (!id) return;
    const row = rowById(id);
    const visible = normalizeTransport(anchor.querySelector('b')?.textContent || row?.transport);
    if (visible !== 'Silla' && visible !== 'Camilla') return;

    const popover = ensurePopover();
    activeRowId = id;
    activeAnchor = anchor;
    popover.querySelectorAll('[data-quick-value]').forEach((button) => {
      const current = button.dataset.quickValue === visible;
      button.classList.toggle('is-current', current);
      button.setAttribute('aria-checked', current ? 'true' : 'false');
    });
    positionPopover(popover, anchor);
  }

  function setQuickTransport(id, value) {
    const transport = normalizeTransport(value);
    if (transport !== 'Silla' && transport !== 'Camilla') return;
    const current = readRows();
    let changed = false;
    const next = current.map((row) => {
      if (String(row?.id ?? '') !== String(id)) return row;
      changed = true;
      return {
        ...row,
        transport,
        manualTransportOverride: true,
        manualTransportUpdatedAt: new Date().toISOString()
      };
    });
    if (!changed) return;
    writeRows(next);
    const tr = document.querySelector(`.patient-row[data-id="${CSS.escape(String(id))}"]`);
    const stored = next.find((row) => String(row?.id ?? '') === String(id));
    if (tr && stored) applyStoredStateToRow(tr, stored);
    closePopover();
  }

  function prepareManualFormSubmit(form) {
    if (!activeEditingId || !(form instanceof HTMLFormElement)) return;
    const selected = normalizeTransport(form.querySelector('#transport')?.value);
    const reason = normalize(form.querySelector('#transportReason')?.value);
    const rows = readRows();
    const index = rows.findIndex((row) => String(row?.id ?? '') === String(activeEditingId));
    if (index < 0) return;

    const previous = rows[index];
    const previousTransport = normalizeTransport(previous.transport);
    const alreadyManual = previous.manualTransportOverride === true;
    const isQuickType = selected === 'Silla' || selected === 'Camilla';
    const userChangedQuickType = isQuickType && selected !== previousTransport;

    if (!alreadyManual && !userChangedQuickType) return;

    const next = [...rows];
    if (isQuickType) {
      next[index] = {
        ...previous,
        transport: selected,
        transportReason: reason,
        manualTransportOverride: true,
        manualTransportUpdatedAt: new Date().toISOString()
      };
    } else {
      const replacement = {
        ...previous,
        transport: selected || previous.transport,
        transportReason: reason
      };
      delete replacement.manualTransportOverride;
      delete replacement.manualTransportUpdatedAt;
      next[index] = replacement;
    }
    writeRows(next);
  }

  function onDocumentClick(event) {
    const option = event.target.closest?.('[data-quick-value]');
    if (option && activeRowId) {
      event.preventDefault();
      event.stopPropagation();
      setQuickTransport(activeRowId, option.dataset.quickValue);
      return;
    }

    const main = event.target.closest?.('.transport-main[data-quick-transport="1"]');
    if (main) {
      const tr = main.closest('.patient-row[data-id]');
      if (!tr) return;
      event.preventDefault();
      event.stopPropagation();
      openPopover(tr, main);
      return;
    }

    const patientRow = event.target.closest?.('.patient-row[data-id]');
    if (patientRow && !event.target.closest('[data-remove]')) activeEditingId = patientRow.dataset.id || null;
    if (event.target.closest?.('#manualCapture')) activeEditingId = null;
    if (event.target.closest?.('#closeSheet') || event.target.id === 'sheetBackdrop') activeEditingId = null;

    const popover = document.getElementById('quickTransportPopoverV37');
    if (popover && !popover.hidden && !event.target.closest('#quickTransportPopoverV37')) closePopover();
  }

  function onDocumentKeydown(event) {
    const main = event.target.closest?.('.transport-main[data-quick-transport="1"]');
    if (main && (event.key === 'Enter' || event.key === ' ')) {
      const tr = main.closest('.patient-row[data-id]');
      if (!tr) return;
      event.preventDefault();
      event.stopPropagation();
      openPopover(tr, main);
      return;
    }
    if (event.key === 'Escape') closePopover();
  }

  function start() {
    ensureStyles();
    ensurePopover();
    scheduleSync();

    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
    document.addEventListener('submit', (event) => {
      if (event.target?.id === 'patientForm') prepareManualFormSubmit(event.target);
    }, true);

    window.addEventListener('resize', closePopover, { passive: true });
    window.addEventListener('scroll', closePopover, { passive: true, capture: true });

    const target = document.getElementById('app') || document.body;
    if (target && !observer) {
      observer = new MutationObserver(() => {
        scheduleSync();
        if (activeAnchor && !document.contains(activeAnchor)) closePopover();
      });
      observer.observe(target, { childList: true, subtree: true, characterData: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
