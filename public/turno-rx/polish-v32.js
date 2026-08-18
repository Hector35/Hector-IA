(() => {
  const root = document.getElementById('app') || document.body;
  if (!root) return;

  let scheduled = false;

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  function polishStudy(cell) {
    if (!cell) return;
    const text = clean(cell.textContent);
    if (!text) return;
    if (cell.dataset.polishV32 === text && cell.querySelector('.study-torax-v32')) return;

    const pieces = text.split(/(Tórax)/gi);
    if (pieces.length === 1) {
      cell.dataset.polishV32 = text;
      return;
    }

    const fragment = document.createDocumentFragment();
    pieces.forEach((piece) => {
      if (!piece) return;
      if (/^tórax$/i.test(piece)) {
        const strong = document.createElement('strong');
        strong.className = 'study-torax-v32';
        strong.textContent = 'Tórax';
        fragment.appendChild(strong);
      } else {
        fragment.appendChild(document.createTextNode(piece));
      }
    });

    cell.replaceChildren(fragment);
    cell.dataset.polishV32 = text;
  }

  function apply() {
    root.querySelectorAll('.imaging-table .study-cell').forEach(polishStudy);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  }

  root.addEventListener('pointerdown', (event) => {
    const row = event.target.closest?.('.imaging-table .imaging-row');
    if (!row) return;
    row.classList.add('is-pressed-v32');
  }, { passive: true });

  const release = (event) => {
    const row = event.target.closest?.('.imaging-table .imaging-row');
    if (row) row.classList.remove('is-pressed-v32');
  };

  root.addEventListener('pointerup', release, { passive: true });
  root.addEventListener('pointercancel', release, { passive: true });
  root.addEventListener('pointerleave', release, { passive: true, capture: true });

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  apply();
})();
