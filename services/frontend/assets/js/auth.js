(function initAuthForms() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(loginForm);
      const payload = Object.fromEntries(data.entries());
      console.log('Login submit payload:', payload);
      window.location.href = '/dashboard.html';
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(registerForm);
      const payload = Object.fromEntries(data.entries());
      console.log('Register submit payload:', payload);
      if (window.appAlerts?.notify) {
        await window.appAlerts.notify('Cuenta creada. Ahora inicia sesión para entrar al panel principal.', 'success', 'Registro exitoso');
      }
      window.location.href = '/auth/login.html';
    });
  }
})();
