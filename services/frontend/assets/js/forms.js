(function initFormsModule() {
  const namespace = window.CR360 || {};

  function setSubmitting(form, isSubmitting) {
    if (!form) {
      return;
    }

    form.querySelectorAll('button, input, select, textarea').forEach((control) => {
      control.disabled = Boolean(isSubmitting);
    });
  }

  function serialize(form) {
    if (!form) {
      return {};
    }

    return Object.fromEntries(new FormData(form).entries());
  }

  function bindSubmit(form, handler) {
    if (!form || typeof handler !== 'function') {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setSubmitting(form, true);
      try {
        await handler(serialize(form), form, event);
      } finally {
        setSubmitting(form, false);
      }
    });
  }

  namespace.forms = {
    bindSubmit,
    serialize,
    setSubmitting,
  };

  window.CR360 = namespace;
})();
