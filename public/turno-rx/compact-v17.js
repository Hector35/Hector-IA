(() => {
  let bypassRowClick = false;
  let activeRow = null;
  let compactObserver = null;
  let rewriteScheduled = false;

  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const valueOrDash = (value) => value && value !== 'No visible' ? value : '—';

  const normalizeSide = (side, feminine = false) => {
    const value = String(side || '').toLowerCase();
    if (!value) return '';
    if (/^izq|^izquier/.test(value)) return feminine ? ' izquierda' : ' izquierdo';
    if (/^der|^derech/.test(value)) return feminine ? ' derecha' : ' derecho';
    return '';
  };

  const sidePattern = '(izq(?:uierdo|uierda)?\\.?|izquierd[oa]|der(?:echo|echa)?\\.?|derech[oa])';

  function conciseStudy(value) {
    const source = String(value || '').replace(/\s+/g, ' ').trim();
    if (!source || source === '—') return '—';

    const portable = /port[aá]til/i.test(source);
    const regions = [];
    const add = (label, index) => {
      if (!label || regions.some((item) => item.label.toLowerCase() === label.toLowerCase())) return;
      regions.push({ label, index: Number.isFinite(index) ? index : 9999 });
    };
    const detect = (base, pattern, feminine = false) => {
      const match = source.match(pattern);
      if (!match) return;
      add(`${base}${normalizeSide(match[1], feminine)}`, match.index);
    };

    const chest = source.match(/\b(?:tele(?:radiograf[ií]a)?\s+de\s+)?t[óo]rax\b/i);
    if (chest) add(portable ? 'Tórax portátil' : 'Tórax', chest.index);

    const abdomen = source.match(/\babdomen\b/i); if (abdomen) add('Abdomen', abdomen.index);
    const pelvis = source.match(/\bpelvis\b/i); if (pelvis) add('Pelvis', pelvis.index);
    const skull = source.match(/\bcr[aá]neo\b/i); if (skull) add('Cráneo', skull.index);
    const cervical = source.match(/\b(?:columna\s+)?cervical(?:es)?\b/i); if (cervical) add('Cervicales', cervical.index);
    const lumbar = source.match(/\b(?:columna\s+)?lumbar(?:es)?\b/i); if (lumbar) add('Lumbar', lumbar.index);
    const dorsal = source.match(/\b(?:columna\s+)?(?:dorsal|tor[aá]cica)\b/i); if (dorsal) add('Dorsal', dorsal.index);
    const lumbosacra = source.match(/\blumbosacra\b/i); if (lumbosacra) add('Lumbosacra', lumbosacra.index);
    const sinuses = source.match(/\bsenos?\s+paranasales?\b/i); if (sinuses) add('Senos paranasales', sinuses.index);
    const liver = source.match(/\b(?:h[ií]gado|hep[aá]tic[oa])\b/i); if (liver) add('Hígado', liver.index);
    const kidneys = source.match(/\b(?:riñ[oó]n(?:es)?|renal(?:es)?)\b/i); if (kidneys) add('Riñones', kidneys.index);

    detect('Cadera', new RegExp(`\\bcadera(?:\\s+${sidePattern})?`, 'i'), true);
    detect('Rodilla', new RegExp(`\\brodilla(?:\\s+${sidePattern})?`, 'i'), true);
    detect('Mano', new RegExp(`\\bmano(?:\\s+${sidePattern})?`, 'i'), true);
    detect('Muñeca', new RegExp(`\\bmuñeca(?:\\s+${sidePattern})?`, 'i'), true);
    detect('Clavícula', new RegExp(`\\bclav[ií]cula(?:\\s+${sidePattern})?`, 'i'), true);
    detect('Tibia', new RegExp(`\\btibia(?:\\s+${sidePattern})?`, 'i'), true);
    detect('Rótula', new RegExp(`\\br[oó]tula(?:\\s+${sidePattern})?`, 'i'), true);
    detect('Pie', new RegExp(`\\bpie\\s+${sidePattern}`, 'i'), false);
    detect('Hombro', new RegExp(`\\bhombro(?:\\s+${sidePattern})?`, 'i'), false);
    detect('Tobillo', new RegExp(`\\btobillo(?:\\s+${sidePattern})?`, 'i'), false);
    detect('Codo', new RegExp(`\\bcodo(?:\\s+${sidePattern})?`, 'i'), false);
    detect('Fémur', new RegExp(`\\bf[eé]mur(?:\\s+${sidePattern})?`, 'i'), false);
    detect('Peroné', new RegExp(`\\bperon[eé](?:\\s+${sidePattern})?`, 'i'), false);
    detect('Brazo', new RegExp(`\\bbrazo(?:\\s+${sidePattern})?`, 'i'), false);
    detect('Antebrazo', new RegExp(`\\bantebrazo(?:\\s+${sidePattern})?`, 'i'), false);

    const ribs = source.match(/\bcostillas?\b/i); if (ribs) add('Costillas', ribs.index);

    if (regions.length) {
      regions.sort((a, b) => {
        const aChest = /^Tórax/i.test(a.label);
        const bChest = /^Tórax/i.test(b.label);
        if (aChest && !bChest) return -1;
        if (!aChest && bChest) return 1;
        return a.index - b.index;
      });
      return regions.map((item) => item.label).join(' + ');
    }

    let fallback = source
      .replace(/\b(?:rayos?\s*x|rx|radiograf[ií]a|tac|tc|tomograf[ií]a|usg|ultrasonido|ecograf[ií]a)\b(?:\s+de)?/gi, ' ')
      .replace(/\b(?:ap|pa|lateral(?:es)?|oblicu[ao]s?|axial(?:es)?|proyecciones?|simple|protocolo(?:\s+quir[uú]rgico)?)\b/gi, ' ')
      .replace(/\btele(?:radiograf[ií]a)?\s+de\s+/gi, ' ')
      .replace(/\s*[;,/]\s*/g, ' + ')
      .replace(/\s+\+\s+\+\s+/g, ' + ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*[+,-]+\s*|\s*[+,-]+\s*$/g, '')
      .trim();
    if (portable && fallback && !/port[aá]til/i.test(fallback)) fallback += ' portátil';
    return fallback || '—';
  }

  function applyCompactStudyLabels(root = document) {
    root.querySelectorAll?.('.imaging-row [data-label="Estudio"]').forEach((cell) => {
      const current = text(cell);
      if (!current || current === '—') return;
      if (!cell.dataset.fullStudy) cell.dataset.fullStudy = current;
      const short = conciseStudy(cell.dataset.fullStudy);
      if (short && short !== current) cell.textContent = short;
    });
  }

  function scheduleStudyRewrite() {
    if (rewriteScheduled) return;
    rewriteScheduled = true;
    queueMicrotask(() => {
      rewriteScheduled = false;
      applyCompactStudyLabels(document);
    });
  }

  function startCompactObserver() {
    applyCompactStudyLabels(document);
    const target = document.getElementById('app') || document.body;
    if (!target || compactObserver) return;
    compactObserver = new MutationObserver(scheduleStudyRewrite);
    compactObserver.observe(target, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startCompactObserver, { once: true });
  else startCompactObserver();

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
    applyCompactStudyLabels(row);
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
