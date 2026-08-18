(() => {
  const STATES = { analyzing:'Analizando', done:'Terminada', review:'Requiere revisión', error:'Error' };
  const seenRows = new Set();
  const rowStates = new Map();
  const tabCounts = new Map();
  const photoStates = new Map();
  let initialized = false;
  let analysisActive = false;
  let activeTab = '';
  let scheduled = false;

  function flash(node, className, duration = 260) {
    if (!node) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), duration);
  }

  function scanRows() {
    document.querySelectorAll('.patient-row[data-id]').forEach((row) => {
      const id = String(row.dataset.id || '');
      const status = String(row.dataset.status || 'Pendiente');
      if (!id) return;
      if (initialized && !seenRows.has(id)) flash(row, 'v57-row-enter', 240);
      const previous = rowStates.get(id);
      if (initialized && previous && previous !== status) flash(row, status === 'Realizado' ? 'v57-to-done' : 'v57-to-pending', 240);
      seenRows.add(id);
      rowStates.set(id, status);
    });
  }

  function scanTabs() {
    document.querySelectorAll('.category-tab[data-category-tab]').forEach((tab) => {
      const key = String(tab.dataset.categoryTab || '');
      const countNode = tab.querySelector('.category-count');
      const count = Number.parseInt(countNode?.textContent || '0', 10) || 0;
      const previous = tabCounts.get(key);
      if (initialized && previous !== undefined && count > previous) flash(countNode, 'v57-count-pulse', 260);
      tabCounts.set(key, count);
    });
    const selected = document.querySelector('.category-tab[aria-selected="true"]')?.dataset.categoryTab || '';
    if (initialized && activeTab && selected && selected !== activeTab) flash(document.getElementById('category-panel'), 'v57-tab-enter', 200);
    if (selected) activeTab = selected;
  }

  function photoKey(job, index) {
    return job.querySelector('.photo-job-name')?.firstChild?.textContent?.trim() || `Boleta ${index + 1}`;
  }

  function scanPhotos() {
    const jobs = [...document.querySelectorAll('.photo-job[data-state]')];
    const analyzing = jobs.some((job) => job.dataset.state === STATES.analyzing);
    if (initialized && analyzing && !analysisActive) flash(document.querySelector('.photo-queue'), 'v57-analysis-start', 310);
    analysisActive = analyzing;
    jobs.forEach((job, index) => {
      const key = photoKey(job, index);
      const state = String(job.dataset.state || '');
      const previous = photoStates.get(key);
      if (initialized && previous && previous !== state) {
        if (state === STATES.done) flash(job, 'v57-photo-done', 230);
        if (state === STATES.review) flash(job, 'v57-needs-review', 250);
        if (state === STATES.error) flash(job, 'v57-error-once', 220);
      }
      photoStates.set(key, state);
    });
  }

  function scanErrors() {
    document.querySelectorAll('.capture-status[data-state="error"],.manual-quick-error:not([hidden]),.form-error:not([hidden])').forEach((node) => {
      if (node.dataset.v57ErrorSeen === '1') return;
      node.dataset.v57ErrorSeen = '1';
      if (initialized) flash(node, 'v57-error-once', 220);
    });
  }

  function scan() {
    scheduled = false;
    scanRows();
    scanTabs();
    scanPhotos();
    scanErrors();
    initialized = true;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['data-state','data-status','aria-selected','hidden'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once:true });
  else schedule();
})();
