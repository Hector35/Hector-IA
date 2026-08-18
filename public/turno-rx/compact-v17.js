(() => {
  let bypassRowClick = false;
  let activeRow = null;

  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const valueOrDash = (value) => value && value !== 'No visible' ? value : '—';

  function transportReason(row) {
    const node = row.querySelector('.transport-reason');
    if (!node) return '—';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('span').forEach((el) => el.remove());
    return valueOrDash(text(copy));
  }

  function splitPatientMeta(row) {
    const meta = text(row.querySelector('.age-line'));
    const parts = meta.split('·').map((part) => part.trim()).filter(Boolean);
    return {
      age: parts.find((part) => /años/i.test(part)) || '—',
      sex: parts.find((part) => /mujer|hombre/i.test(part)) || '—'
    };
  }

  function modalityFor(row) {
    const section = row.closest('.modality-section');
    const title = text(section?.querySelector('.modality-title'));
    return title.replace(/\s+—\s+\d+\s*$/, '') || '—';
  }

  function rowDetails(row) {
    const meta = splitPatientMeta(row);
    return [
      ['Modalidad', modalityFor(row)],
      ['Origen', valueOrDash(text(row.querySelector('[data-label="Origen"]')))],
      ['Paciente', valueOrDash(text(row.querySelector('.patient-name')))],
      ['Edad', meta.age],
      ['Sexo', meta.sex],
      ['Traslado', valueOrDash(text(row.querySelector('.transport-main b')))],
      ['Motivo del traslado', transportReason(row)],
      ['Estudio', valueOrDash(text(row.querySelector('[data-label="Estudio"]')))],
      ['Diagnóstico / dato clínico', valueOrDash(text(row.querySelector('[data-label="Diagnóstico"]')))],
      ['Qué significa', valueOrDash(text(row.querySelector('[data-label="Qué significa"]')))],
      ['Oxígeno', valueOrDash(text(row.querySelector('.oxygen-chip')))]
    ];
  }

  function ensureSheet() {
    let backdrop = document.getElementById('compactDetailBackdrop');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'compactDetailBackdrop';
    backdrop.className = 'compact-detail-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="compact-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="compactDetailTitle">
        <div class="compact-detail-handle"></div>
        <div class="compact-detail-head">
          <div>
            <div class="compact-detail-kicker">PACIENTE</div>
            <h2 id="compactDetailTitle">Detalle</h2>
          </div>
          <button type="button" class="compact-detail-close" aria-label="Cerrar">×</button>
        </div>
        <div class="compact-detail-list" id="compactDetailList"></div>
        <div class="compact-detail-actions">
          <button type="button" class="compact-detail-edit">Editar</button>
          <button type="button" class="compact-detail-remove">Quitar</button>
        </div>
      </section>`;
    document.body.appendChild(backdrop);

    const close = () => {
      backdrop.hidden = true;
      document.body.classList.remove('compact-detail-open');
      activeRow = null;
    };
    backdrop.querySelector('.compact-detail-close').addEventListener('click', close);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
    backdrop.querySelector('.compact-detail-edit').addEventListener('click', () => {
      const row = activeRow;
      close();
      if (!row?.isConnected) return;
      bypassRowClick = true;
      row.click();
      bypassRowClick = false;
    });
    backdrop.querySelector('.compact-detail-remove').addEventListener('click', () => {
      const row = activeRow;
      const remove = row?.querySelector('[data-remove]');
      close();
      remove?.click();
    });
    return backdrop;
  }

  function openDetails(row) {
    activeRow = row;
    const backdrop = ensureSheet();
    const title = valueOrDash(text(row.querySelector('.patient-name')));
    backdrop.querySelector('#compactDetailTitle').textContent = title;
    const list = backdrop.querySelector('#compactDetailList');
    list.replaceChildren();
    for (const [label, value] of rowDetails(row)) {
      const item = document.createElement('div');
      item.className = 'compact-detail-item';
      const dt = document.createElement('div');
      dt.className = 'compact-detail-label';
      dt.textContent = label;
      const dd = document.createElement('div');
      dd.className = 'compact-detail-value';
      dd.textContent = value;
      if (label.startsWith('Diagnóstico') && value !== '—') dd.classList.add('clinical');
      item.append(dt, dd);
      list.appendChild(item);
    }
    backdrop.hidden = false;
    document.body.classList.add('compact-detail-open');
  }

  document.addEventListener('click', (event) => {
    if (bypassRowClick) return;
    const row = event.target.closest?.('.imaging-row');
    if (!row || event.target.closest?.('[data-remove]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDetails(row);
  }, true);
})();
