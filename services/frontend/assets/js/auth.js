(function initAuthForms() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const passwordSetupTrigger = document.getElementById('password-setup-trigger');
  const SESSION_KEY = 'cr360.session';

  const FIELD_LABELS = {
    business: 'nombre de negocio',
    email: 'correo electrónico',
    password: 'contraseña',
  };

  const FORM_RULES = {
    login: {
      email: { required: true, email: true },
      password: { required: true },
    },
    register: {
      business: { required: true, minLength: 2 },
      email: { required: true, email: true },
      password: { required: true, minLength: 8 },
    },
  };

  function getApiBase() {
    return '/api';
  }

  function parseApiError(payload, bodyText) {
    if (!payload && /<html|<body|<title/i.test(bodyText || '')) {
      return {
        message: 'El servidor no está disponible en este momento (502). Intenta de nuevo en unos segundos.',
        fieldErrors: {},
        code: 'gateway_error',
        extra: {},
      };
    }

    if (payload && typeof payload === 'object') {
      const fieldErrors = {};

      Object.entries(payload).forEach(([field, value]) => {
        if (field === 'detail' || field === 'code' || field === 'setup_email') {
          return;
        }

        if (Array.isArray(value)) {
          fieldErrors[field] = value.join(' ');
          return;
        }

        if (typeof value === 'string') {
          fieldErrors[field] = value;
        }
      });

      if (typeof payload.detail === 'string' && payload.detail.trim()) {
        return { message: payload.detail, fieldErrors, code: payload.code || '', extra: payload };
      }

      if (Object.keys(fieldErrors).length > 0) {
        return { message: 'Revisa los campos marcados e inténtalo de nuevo.', fieldErrors };
      }
    }

    return { message: bodyText || 'No se pudo completar la solicitud.', fieldErrors: {}, code: '', extra: payload || {} };
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
      const apiError = parseApiError(payload, bodyText);
      const error = new Error(apiError.message);
      error.fieldErrors = apiError.fieldErrors;
      error.code = apiError.code;
      error.extra = apiError.extra;
      throw error;
    }

    return payload;
  }

  function storeSession(sessionData) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData || {}));
  }

  function getFieldErrorElement(input) {
    const existing = input.parentElement.querySelector(`[data-error-for="${input.name}"]`);
    if (existing) {
      return existing;
    }

    const errorElement = document.createElement('small');
    errorElement.className = 'field-error';
    errorElement.setAttribute('data-error-for', input.name);
    input.insertAdjacentElement('afterend', errorElement);
    return errorElement;
  }

  function clearFieldError(input) {
    input.classList.remove('is-invalid');
    const errorElement = getFieldErrorElement(input);
    errorElement.textContent = '';
  }

  function setFieldError(input, message) {
    input.classList.add('is-invalid');
    const errorElement = getFieldErrorElement(input);
    errorElement.textContent = message;
  }

  function getValidationMessage(input, rules = {}) {
    const value = `${input.value || ''}`.trim();
    const label = FIELD_LABELS[input.name] || 'campo';

    if (rules.required && !value) {
      return `Debes completar ${label}.`;
    }

    if (rules.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Ingresa un correo electrónico válido.';
    }

    if (rules.minLength && value.length < rules.minLength) {
      return `La ${label} debe tener al menos ${rules.minLength} caracteres.`;
    }

    return '';
  }

  function validateField(input, rules = {}) {
    const message = getValidationMessage(input, rules);

    if (message) {
      setFieldError(input, message);
      return false;
    }

    clearFieldError(input);
    return true;
  }

  function setServerFieldErrors(form, fieldErrors = {}) {
    Object.entries(fieldErrors).forEach(([name, message]) => {
      const field = form.elements.namedItem(name);
      if (field && typeof message === 'string') {
        setFieldError(field, message);
      }
    });
  }

  function initFormValidation(form, rules, submitHandler) {
    const fields = Object.keys(rules)
      .map((name) => form.elements.namedItem(name))
      .filter(Boolean);

    fields.forEach((field) => {
      field.addEventListener('input', () => validateField(field, rules[field.name]));
      field.addEventListener('blur', () => validateField(field, rules[field.name]));
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const isValid = fields.every((field) => validateField(field, rules[field.name]));
      if (!isValid) {
        return;
      }

      await submitHandler();
    });
  }

  async function openPasswordSetupModal(prefilledEmail = '') {
    const result = await window.Swal.fire({
      title: 'Configurar contraseña',
      html:
        '<p style="margin-bottom:8px;">Si tu cuenta fue creada por un administrador, define aquí tu contraseña para ingresar.</p>' +
        `<input id="setup-email" class="swal2-input" type="email" placeholder="Correo electrónico" value="${prefilledEmail || ''}">` +
        '<input id="setup-password" class="swal2-input" type="password" placeholder="Nueva contraseña (mínimo 8)">' +
        '<input id="setup-password-confirm" class="swal2-input" type="password" placeholder="Confirmar contraseña">',
      confirmButtonText: 'Guardar contraseña',
      showCancelButton: true,
      focusConfirm: false,
      preConfirm: () => {
        const email = (document.getElementById('setup-email')?.value || '').trim().toLowerCase();
        const first = document.getElementById('setup-password')?.value || '';
        const second = document.getElementById('setup-password-confirm')?.value || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          window.Swal.showValidationMessage('Ingresa un correo válido.');
          return false;
        }
        if (first.length < 8) {
          window.Swal.showValidationMessage('La contraseña debe tener al menos 8 caracteres.');
          return false;
        }
        if (first !== second) {
          window.Swal.showValidationMessage('Las contraseñas no coinciden.');
          return false;
        }
        return { email, password: first };
      },
    });

    if (!result.isConfirmed || !result.value) {
      return null;
    }
    return result.value;
  }

  function shouldTriggerPasswordSetup(error) {
    return (
      error?.code === 'password_setup_required' ||
      /no tiene contraseña|debes crearla/i.test(String(error?.message || ''))
    );
  }

  if (loginForm) {
    initFormValidation(loginForm, FORM_RULES.login, async () => {
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
        if (shouldTriggerPasswordSetup(error)) {
          const setupData = await openPasswordSetupModal(error?.extra?.setup_email || payload.email || '');
          if (setupData) {
            try {
              await request('/auth/activate-password/', {
                method: 'POST',
                body: JSON.stringify({ email: setupData.email, new_password: setupData.password }),
              });

              const sessionData = await request('/auth/login/', {
                method: 'POST',
                body: JSON.stringify({ email: setupData.email, password: setupData.password }),
              });
              storeSession(sessionData);
              window.location.href = '/dashboard.html';
              return;
            } catch (setupError) {
              if (window.appAlerts?.notify) {
                await window.appAlerts.notify(
                  setupError.message || 'No se pudo configurar la contraseña.',
                  'error',
                  'Configuración incompleta',
                );
              }
              return;
            }
          }
        }

        setServerFieldErrors(loginForm, error.fieldErrors);
        if (window.appAlerts?.notify) {
          await window.appAlerts.notify(error.message, 'error', 'No se pudo iniciar sesión');
        }
      }
    });
  }

  if (passwordSetupTrigger) {
    passwordSetupTrigger.addEventListener('click', async () => {
      const loginEmail = loginForm?.elements?.namedItem('email')?.value || '';
      const setupData = await openPasswordSetupModal(loginEmail);
      if (!setupData) return;

      try {
        await request('/auth/activate-password/', {
          method: 'POST',
          body: JSON.stringify({ email: setupData.email, new_password: setupData.password }),
        });
        if (window.appAlerts?.notify) {
          await window.appAlerts.notify('Contraseña creada. Ahora puedes iniciar sesión.', 'success', 'Listo');
        }
        const passwordField = loginForm?.elements?.namedItem('password');
        const emailField = loginForm?.elements?.namedItem('email');
        if (emailField) emailField.value = setupData.email;
        if (passwordField) passwordField.value = setupData.password;
      } catch (error) {
        if (window.appAlerts?.notify) {
          await window.appAlerts.notify(error.message || 'No se pudo configurar la contraseña.', 'error', 'Error');
        }
      }
    });
  }

  if (registerForm) {
    initFormValidation(registerForm, FORM_RULES.register, async () => {
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
        setServerFieldErrors(registerForm, error.fieldErrors);
        if (window.appAlerts?.notify) {
          await window.appAlerts.notify(error.message, 'error', 'No se pudo registrar');
        }
      }
    });
  }
})();
