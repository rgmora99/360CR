(function initApiModule() {
  const namespace = window.CR360 || {};

  function getBaseUrl() {
    return window.API_BASE_URL || '';
  }

  async function request(path, options = {}) {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    const bodyText = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const payload = bodyText && contentType.includes('application/json') ? JSON.parse(bodyText) : bodyText;

    if (!response.ok) {
      const message = payload?.detail || payload?.error || 'No fue posible completar la solicitud.';
      throw new Error(message);
    }

    return payload;
  }

  namespace.api = {
    getBaseUrl,
    request,
  };

  window.CR360 = namespace;
})();
