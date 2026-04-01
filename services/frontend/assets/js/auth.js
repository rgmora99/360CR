(function initAuthForms() {
  const forms = [document.getElementById('login-form'), document.getElementById('register-form')].filter(Boolean);

  forms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = Object.fromEntries(data.entries());
      console.log('Auth submit payload:', payload);
      alert('Formulario listo. Conecta este flujo al backend Django para autenticar.');
    });
  });
})();
