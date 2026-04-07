(function initAuthForms() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const API_BASE = '/api';

  async function api(path, options) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(payload?.detail || 'Error de autenticación.');
    }
    return payload;
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(loginForm);
      const payload = Object.fromEntries(data.entries());
      try {
        const session = await api('/auth/login/', { method: 'POST', body: JSON.stringify(payload) });
        localStorage.setItem('activeOrganizationId', String(session.active_organization_id));
        window.location.href = '/dashboard.html';
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(registerForm);
      const payload = Object.fromEntries(data.entries());
      try {
        const session = await api('/auth/register/', { method: 'POST', body: JSON.stringify(payload) });
        localStorage.setItem('activeOrganizationId', String(session.active_organization_id));
        window.location.href = '/dashboard.html';
      } catch (error) {
        alert(error.message);
      }
    });
  }
})();
