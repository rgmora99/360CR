(function initAuthForms() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const SESSION_KEY = 'cr360.session';

  function getApiBase() {
    return '/api';
  }

  async function request(path, options) {
    const response = await fetch(`${getApiBase()}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      credentials: 'include',
      ...options,
    });

    const bodyText = await response.text();
    const contentType = response.headers.get('content-type') || '';
    let payload = null;

    if (bodyText && contentType.includes('application/json')) {
      payload = JSON.parse(bodyText);
    }

    if (!response.ok) {
      throw new Error(payload?.detail || bodyText || 'No se pudo completar la solicitud.');
    }

    return payload;
  }

  function storeSession(sessionData) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData || {}));
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(loginForm);
      const payload = Object.fromEntries(data.entries());
      try {
        const sessionData = await request('/auth/login/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        storeSession(sessionData);
        window.location.href = '/dashboard.html';
      } catch (error) {
        if (window.appAlerts?.notify) {
          await window.appAlerts.notify(error.message, 'error', 'No se pudo iniciar sesión');
        }
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(registerForm);
      const payload = Object.fromEntries(data.entries());
      try {
        const sessionData = await request('/auth/register/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        storeSession(sessionData);
        if (window.appAlerts?.notify) {
          await window.appAlerts.notify('Cuenta creada correctamente.', 'success', 'Registro exitoso');
        }
        window.location.href = '/dashboard.html';
      } catch (error) {
        if (window.appAlerts?.notify) {
          await window.appAlerts.notify(error.message, 'error', 'No se pudo registrar');
        }
      }
    });
  }
})();
