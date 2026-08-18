(() => {
  let observer = null;
  let scheduled = false;
  let applying = false;

  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function studyText(row) {
    const cell = row.querySelector('[data-label="Estudio"]');
    return cell?.dataset.fullStudy || txt(cell);
  }

  function diagnosisText(row) {
    const value = txt(row.querySelector('[data-label="Diagnóstico"]'));
    return /^(no visible|—)?$/i.test(value) ? '' : value;
  }

  function currentTransport(row) {
    return txt(row.querySelector('.transport-main b'));
  }

  function inferTransport(row) {
    const current = currentTransport(row);
    if (!/por definir/i.test(current)) return null;

    const study = norm(studyText(row));
    const diagnosis = norm(diagnosisText(row));

    if (/portatil/.test(study)) {
      return { label: 'No trasladar', type: 'no-transfer', icon: '🚫', reason: 'Estudio portátil: se realiza en la cama del paciente.' };
    }

    const strongCamilla = /(fractur|luxacion|trauma|politrauma|tce|evc|ictus|evento vascular|deficit neurolog|hemorrag|sincope|convulsion|sepsis|disnea|hipox|insuficiencia respiratoria|pie diabet|miasis|inmovil|no deambula|postrado|dolor intenso|lesion de ligamento rotuliano|rotula)/;
    if (strongCamilla.test(diagnosis)) {
      return { label: 'Camilla probable', type: 'camilla', icon: '🛏️', reason: `Dato clínico visible que puede limitar o hacer insegura la marcha: ${diagnosisText(row)}.` };
    }

    const likelyChairStudy = /(torax|mano|muneca|hombro|codo|brazo|antebrazo|clavicula|costillas|abdomen|senos paranasales)/;
    if (likelyChairStudy.test(study)) {
      return { label: 'Silla probable', type: 'silla', icon: '♿', reason: 'No hay un dato visible de inmovilidad; por el tipo de estudio, lo más probable es traslado sentado si está estable.' };
    }

    const ambiguousMobilityStudy = /(pie|tobillo|rodilla|cadera|pelvis|femur|tibia|perone|rotula|craneo|cervical|lumbar|lumbosacra)/;
    if (ambiguousMobilityStudy.test(study)) return null;

    return null;
  }

  function applyEstimate(row) {
    const estimate = inferTransport(row);
    if (!estimate) return false;

    const main = row.querySelector('.transport-main');
    const label = main?.querySelector('b');
    const icon = main?.querySelector('span');
    const reason = row.querySelector('.transport-reason');
    if (!main || !label) return false;

    main.classList.remove('silla', 'camilla', 'no-transfer', 'unset');
    main.classList.add(estimate.type);
    label.textContent = estimate.label;
    if (icon) icon.textContent = estimate.icon;
    main.dataset.inferred = 'true';

    if (reason) {
      reason.classList.remove('is-empty');
      reason.innerHTML = `<span>Motivo</span>${estimate.reason}`;
    }
    return true;
  }

  function transportRank(row) {
    const value = norm(currentTransport(row));
    if (value.includes('silla')) return 0;
    if (value.includes('camilla')) return 1;
    if (value.includes('no trasladar')) return 2;
    return 3;
  }

  function sexRank(row) {
    const meta = norm(txt(row.querySelector('.age-line')));
    if (meta.includes('mujer')) return 0;
    if (meta.includes('hombre')) return 1;
    return 2;
  }

  function ageValue(row) {
    const match = txt(row.querySelector('.age-line')).match(/(\d{1,3})\s*años/i);
    return match ? Number(match[1]) : 999;
  }

  function originValue(row) {
    const value = txt(row.querySelector('[data-label="Origen"]'));
    const numeric = Number.parseInt(value, 10);
    return Number.isFinite(numeric) ? numeric : 9999;
  }

  function reorderTable(table) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = [...tbody.querySelectorAll('.imaging-row')];
    const sorted = [...rows].sort((a, b) =>
      transportRank(a) - transportRank(b) ||
      sexRank(a) - sexRank(b) ||
      ageValue(a) - ageValue(b) ||
      originValue(a) - originValue(b)
    );
    const changed = rows.some((row, index) => row !== sorted[index]);
    if (changed) sorted.forEach((row) => tbody.appendChild(row));
  }

  function applyAll() {
    if (applying) return;
    applying = true;
    try {
      document.querySelectorAll('.imaging-row').forEach(applyEstimate);
      document.querySelectorAll('.imaging-table').forEach(reorderTable);
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (scheduled || applying) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyAll();
    });
  }

  function start() {
    applyAll();
    const target = document.getElementById('app') || document.body;
    if (!target || observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
