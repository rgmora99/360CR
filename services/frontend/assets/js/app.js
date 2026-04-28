(function initAppCore() {
  const namespace = window.CR360 || {};
  const readyCallbacks = [];
  let hasBooted = false;

  function onReady(callback) {
    if (typeof callback !== 'function') {
      return;
    }

    if (document.readyState === 'loading') {
      readyCallbacks.push(callback);
      return;
    }

    callback();
  }

  function boot() {
    if (hasBooted) {
      return;
    }

    hasBooted = true;
    while (readyCallbacks.length) {
      const callback = readyCallbacks.shift();
      callback();
    }
  }

  namespace.onReady = onReady;
  namespace.boot = boot;
  window.CR360 = namespace;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
