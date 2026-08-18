(() => {
  let observer = null;
  let scheduled = false;

  function redesignModalityTitle(title) {
    if (!(title instanceof HTMLElement)) return;
    if (title.dataset.v33Title === '1') return;

    const countNode = title.querySelector('strong');
    const count = (countNode?.textContent || '').trim();
    const raw = [...title.childNodes]
      .filter((node) => node !== countNode)
      .map((node) => node.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*[—-]\s*$/, '')
      .trim();

    if (!raw) return;

    const name = document.createElement('span');
    name.className = 'modality-name-v33';
    name.textContent = raw;

    const badge = document.createElement('strong');
    badge.className = 'modality-count-v33';
    badge.textContent = count || '0';
    badge.setAttribute('aria-label', `${badge.textContent} pendientes`);

    title.replaceChildren(name, badge);
    title.dataset.v33Title = '1';
  }

  function apply() {
    document.documentElement.classList.add('pendientes-redesign-v33');
    document.querySelectorAll('.modality-title').forEach(redesignModalityTitle);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  }

  function start() {
    apply();
    const target = document.getElementById('app') || document.body;
    if (!target || observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(target, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
