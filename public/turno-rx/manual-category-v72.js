(() => {
  const TAB_FOR_MODALITY = {
    'Rayos X': 'RX',
    'TAC': 'TAC',
    'Ultrasonido': 'USG',
    'Piso': 'Piso'
  };

  function activeTab() {
    return document.querySelector('[data-category-tab].is-active')?.dataset.categoryTab || 'RX';
  }

  function modalityForTab(tab) {
    if (tab === 'Piso') return 'Piso';
    if (tab === 'TAC') return 'TAC';
    if (tab === 'USG') return 'Ultrasonido';
    return 'Rayos X';
  }

  function ensurePisoOption() {
    const select = document.getElementById('modality');
    if (!select || select.querySelector('option[value="Piso"]')) return select;
    const option = document.createElement('option');
    option.value = 'Piso';
    option.textContent = 'Piso';
    select.appendChild(option);
    const label = select.closest('label')?.querySelector('span');
    if (label && label.textContent.trim() === 'Modalidad') label.textContent = 'Categoría';
    return select;
  }

  function prepareNewManualCapture() {
    queueMicrotask(() => {
      const select = ensurePisoOption();
      if (!select) return;
      select.value = modalityForTab(activeTab());
    });
  }

  function temporarilyExposeSelectedTab(form) {
    const select = form?.querySelector('#modality');
    const selectedTab = TAB_FOR_MODALITY[select?.value];
    if (!selectedTab) return () => {};

    const buttons = [...document.querySelectorAll('[data-category-tab]')];
    const snapshot = buttons.map((button) => ({
      button,
      active: button.classList.contains('is-active'),
      selected: button.getAttribute('aria-selected'),
      tabIndex: button.getAttribute('tabindex')
    }));

    for (const button of buttons) {
      const active = button.dataset.categoryTab === selectedTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.setAttribute('tabindex', active ? '0' : '-1');
    }

    return () => {
      for (const item of snapshot) {
        item.button.classList.toggle('is-active', item.active);
        if (item.selected === null) item.button.removeAttribute('aria-selected');
        else item.button.setAttribute('aria-selected', item.selected);
        if (item.tabIndex === null) item.button.removeAttribute('tabindex');
        else item.button.setAttribute('tabindex', item.tabIndex);
      }
    };
  }

  window.addEventListener('submit', (event) => {
    if (event.target?.id !== 'patientForm') return;
    ensurePisoOption();
    const restore = temporarilyExposeSelectedTab(event.target);
    queueMicrotask(restore);
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('#manualCapture')) prepareNewManualCapture();
  }, true);

  const observer = new MutationObserver(() => ensurePisoOption());
  const root = document.getElementById('app');
  if (root) observer.observe(root, {childList:true, subtree:true});
  ensurePisoOption();
})();
