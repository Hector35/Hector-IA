(() => {
  const STORAGE_KEY = 'pendientes-table-v2';
  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;

  let activeEditingId = null;
  let activeRowId = null;
  let activeAnchor = null;
  let pendingManualOverride = null;
  let pendingManualReleaseId = null;
  let observer = null;
  let syncScheduled = false;
  let reconciling = false;

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

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    if (this !== localStorage || key !== STORAGE_KEY) return nativeSetItem.call(this, key, value);

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
        const id = String(row?.id ?? '');
        if (!id) return row;

        if (pendingManualReleaseId === id) {
          const released = {...row};
          delete released.manualTransportOverride;
          delete released.manualTransportUpdatedAt;
          return released;
        }

        const pending = pendingManualOverride?.id === id ? pendingManualOverride : null;
        const previous = locked.get(id);
        const lockedTransport = normalizeTransport(pending?.transport || previous?.transport);
        if (!['Silla','Camilla','Por definir'].includes(lockedTransport)) return row;

        return {
          ...row,
          transport: lockedTransport,
          manualTransportOverride: true,
          manualTransportUpdatedAt: pending?.updatedAt || previous?.manualTransportUpdatedAt || new Date().toISOString()
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
      [data-quick-transport="1"] {
        position: relative;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        padding-right: 15px !important;
      }
      [data-quick-transport="1"]::after {
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
      [data-manual-transport="1"]::after { opacity: .82; }
      [data-quick-transport="1"]:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
        border-radius: 7px;
      }
      button.floor-transport,
      button.v39-transport-button {
        appearance: none;
        border: 1px solid rgba(59,130,246,.32);
        border-radius: 10px;
        min-height: 38px;
        min-width: 92px;
        padding: 7px 22px 7px 10px !important;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: rgba(59,130,246,.12);
        color: inherit;
        font: inherit;
        white-space: nowrap;
      }
      button.v39-transport-button { min-height: 44px; }
      .quick-transport-popover-v37 {
        position: fixed;
        z-index: 10050;
        min-width: 150px;
        padding: 6px;
        border: 1px solid rgba(30,52,68,.14);
        border-radius: 14px;
        background: rgba(255,255,255,.98);
        box-shadow: 0 14px 36px rgba(28,45,57,.18);
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
      .quick-transport-option-v37.is-current { background: rgba(28,92,122,.09); }
      .quick-transport-option-v37 .quick-check-v37 {
        margin-left: auto;
        opacity: 0;
        font-size: 12px;
      }
      .quick-transport-option-v37.is-current .quick-check-v37 { opacity: .75; }
      html.quick-transport-commit-v37 #compactDetailBackdrop,
      html.quick-transport-commit-v37 #sheetBackdrop { visibility: hidden !important; }
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
      <button type="button" class="quick-transport-option-v37" data-quick-value="Por definir" role="menuitem">
        <span aria-hidden="true">•</span><span>Por definir</span><span class="quick-check-v37" aria-hidden="true">✓</span>
      </button>
    `;
    document.body.appendChild(popover);
    return popover;
  }

  function findRowElement(id) {
    return [...document.querySelectorAll('.patient-row[data-id]')]
      .find((row) => String(row.dataset.id || '') === String(id || '')) || null;
  }

  function rowById(id) {
    return readRows().find((row) => String(row?.id ?? '') === String(id ?? '')) || null;
  }

  function applyStoredStateToRow(tr, storedRow) {
    if (!tr || !storedRow) return false;
    const transport = normalizeTransport(storedRow.transport);
    const main = tr.querySelector('[data-quick-transport="1"]') || tr.querySelector('.transport-main');
    const label = main?.querySelector('b');
    const icon = main?.querySelector('span');
    if (!main || !label) return false;

    const before = normalizeTransport(label.textContent);
    const manual = storedRow.manualTransportOverride === true && ['Silla','Camilla','Por definir'].includes(transport);

    if (manual) {
      main.classList.remove('silla','camilla','no-transfer','unset');
      main.classList.add(transport === 'Silla' ? 'silla' : transport === 'Camilla' ? 'camilla' : 'unset');
      label.textContent = transport;
      if (icon) icon.textContent = transport === 'Silla' ? '♿' : transport === 'Camilla' ? '🛏️' : '•';
      main.dataset.manualTransport = '1';
      main.removeAttribute('data-inferred');
    } else {
      delete main.dataset.manualTransport;
    }

    const visible = normalizeTransport(label.textContent);
    if (['Silla','Camilla','Por definir'].includes(visible)) {
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

    return manual && before !== transport;
  }

  function clearPendingSoon() {
    queueMicrotask(() => {
      pendingManualOverride = null;
      pendingManualReleaseId = null;
    });
  }

  function prepareManualFormSubmit(form) {
    if (!activeEditingId || !(form instanceof HTMLFormElement)) return;
    const stored = rowById(activeEditingId);
    if (!stored) return;

    const selected = normalizeTransport(form.querySelector('#transport')?.value);
    const previous = normalizeTransport(stored.transport);
    const alreadyManual = stored.manualTransportOverride === true;

    if (['Silla','Camilla','Por definir'].includes(selected)) {
      if (alreadyManual || selected !== previous) {
        pendingManualOverride = {
          id: String(activeEditingId),
          transport: selected,
          updatedAt: new Date().toISOString()
        };
      }
    } else if (alreadyManual) pendingManualReleaseId = String(activeEditingId);

    clearPendingSoon();
  }

  function syncRowsFromStorage() {
    syncScheduled = false;
    const stored = new Map(readRows().filter((row) => row?.id).map((row) => [String(row.id), row]));
    const mismatches = [];

    document.querySelectorAll('.patient-row[data-id]').forEach((tr) => {
      const row = stored.get(String(tr.dataset.id || ''));
      if (!row) return;
      if (applyStoredStateToRow(tr, row)) mismatches.push({id:String(row.id), transport:normalizeTransport(row.transport)});
    });

    if (!reconciling && mismatches.length) {
      queueMicrotask(() => {
        if (reconciling) return;
        reconciling = true;
        try {
          mismatches.forEach(({id,transport}) => commitThroughApp(id, transport, true));
        } finally {
          reconciling = false;
        }
      });
    }
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

  function openPopover(anchor) {
    const tr = anchor?.closest?.('.patient-row[data-id]');
    const id = anchor?.dataset?.patientId || tr?.dataset?.id;
    if (!id) return;
    const visible = normalizeTransport(anchor.querySelector('b')?.textContent || rowById(id)?.transport);
    if (!['Silla','Camilla','Por definir'].includes(visible)) return;

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

  function fallbackCommit(id, transport) {
    const rows = readRows();
    let changed = false;
    const next = rows.map((row) => {
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
    nativeSetItem.call(localStorage, STORAGE_KEY, JSON.stringify(next));
    const tr = findRowElement(id);
    const stored = next.find((row) => String(row?.id ?? '') === String(id));
    if (tr && stored) applyStoredStateToRow(tr, stored);
    document.dispatchEvent(new CustomEvent('pendientes:transport-changed', {detail:{id:String(id),transport}}));
    scheduleSync();
  }

  function commitThroughApp(id, value, fromReconcile = false) {
    const transport = normalizeTransport(value);
    if (!['Silla','Camilla','Por definir'].includes(transport)) return;
    closePopover();
    fallbackCommit(id, transport);
    if (!fromReconcile) scheduleSync();
  }

  function reconcileVisibleLocks() {
    const stored = readRows().filter((row) => row?.manualTransportOverride === true);
    stored.forEach((row) => {
      const transport = normalizeTransport(row.transport);
      const tr = findRowElement(row.id);
      const visible = normalizeTransport(tr?.querySelector('[data-quick-transport="1"] b')?.textContent || tr?.querySelector('.transport-main b')?.textContent);
      if (tr && ['Silla','Camilla','Por definir'].includes(transport) && visible !== transport) {
        commitThroughApp(row.id, transport, true);
      }
    });
  }

  function onDocumentClick(event) {
    const option = event.target.closest?.('[data-quick-value]');
    if (option && activeRowId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = activeRowId;
      const value = option.dataset.quickValue;
      commitThroughApp(id, value);
      return;
    }

    const main = event.target.closest?.('[data-quick-transport="1"]');
    if (main) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openPopover(main);
      return;
    }

    const patientRow = event.target.closest?.('.patient-row[data-id]');
    if (patientRow && !event.target.closest('[data-remove]')) activeEditingId = patientRow.dataset.id || null;
    if (event.target.closest?.('#manualCapture')) activeEditingId = null;
    if (event.target.closest?.('#newShift')) reconcileVisibleLocks();
    if (event.target.closest?.('#closeSheet') || event.target.id === 'sheetBackdrop') activeEditingId = null;

    const popover = document.getElementById('quickTransportPopoverV37');
    if (popover && !popover.hidden && !event.target.closest('#quickTransportPopoverV37')) closePopover();
  }

  function onDocumentKeydown(event) {
    const main = event.target.closest?.('[data-quick-transport="1"]');
    if (main && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openPopover(main);
      return;
    }
    if (event.key === 'Escape') closePopover();
  }

  function startDom() {
    ensureStyles();
    ensurePopover();
    scheduleSync();

    window.addEventListener('resize', closePopover, {passive:true});
    window.addEventListener('scroll', closePopover, {passive:true, capture:true});

    const target = document.getElementById('app') || document.body;
    if (target && !observer) {
      observer = new MutationObserver(() => {
        scheduleSync();
        if (activeAnchor && !document.contains(activeAnchor)) closePopover();
      });
      observer.observe(target, {childList:true, subtree:true, characterData:true});
    }
  }

  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('keydown', onDocumentKeydown, true);
  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'patientForm') prepareManualFormSubmit(event.target);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startDom, {once:true});
  else startDom();
})();
