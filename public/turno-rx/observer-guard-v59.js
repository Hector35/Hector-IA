(() => {
  const NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver || window.__pendientesObserverGuardV59) return;

  window.__pendientesObserverGuardV59 = true;

  class PendientesMutationObserver extends NativeMutationObserver {
    constructor(callback) {
      if (typeof callback !== 'function') {
        super(callback);
        return;
      }

      let callbackSource = '';
      try { callbackSource = Function.prototype.toString.call(callback); } catch {}
      const isPremiumEnhancer = /function\s+scheduleEnhance\b/.test(callbackSource);

      if (!isPremiumEnhancer) {
        super(callback);
        return;
      }

      super((records, observer) => {
        const root = document.getElementById('app');
        const main = root?.querySelector('.app-shell');
        if (!main || main.dataset.v37Enhanced !== '1') callback(records, observer);
      });
    }
  }

  Object.setPrototypeOf(PendientesMutationObserver, NativeMutationObserver);
  window.MutationObserver = PendientesMutationObserver;
})();
