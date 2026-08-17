const nativeFetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  const url = new URL(rawUrl || '', window.location.href);

  if (url.origin === window.location.origin && url.pathname === '/api/vision') {
    const headers = new Headers(init.headers || {});
    headers.set('X-Turno-RX', '1');
    return nativeFetch('/api/turno-rx/vision', {...init, headers});
  }

  return nativeFetch(input, init);
};

const removeSessionNotice = () => {
  document.querySelectorAll('.notice').forEach((node) => {
    if (/inicia sesi[oó]n|captura manual/i.test(node.textContent || '')) node.remove();
  });
};

removeSessionNotice();
new MutationObserver(removeSessionNotice).observe(document.documentElement, {childList: true, subtree: true});
