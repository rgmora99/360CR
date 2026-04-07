(function initAppAlerts() {
  function hasSwal() {
    return typeof window.Swal !== 'undefined';
  }

  function iconFromType(type) {
    if (type === 'error') return 'error';
    if (type === 'warning') return 'warning';
    if (type === 'success') return 'success';
    return 'info';
  }

  async function confirm(message, title = 'Confirmar acción') {
    if (!hasSwal()) {
      return window.confirm(message);
    }

    const result = await window.Swal.fire({
      title,
      text: message,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Aceptar',
      cancelButtonText: 'Cancelar',
      background: '#0f1b2d',
      color: '#e9f0ff',
    });
    return result.isConfirmed;
  }

  function toast(message, type = 'info') {
    if (!hasSwal()) {
      return;
    }

    window.Swal.fire({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2400,
      timerProgressBar: true,
      icon: iconFromType(type),
      title: message,
      background: '#0f1b2d',
      color: '#e9f0ff',
    });
  }

  async function notify(message, type = 'info', title = '') {
    if (!hasSwal()) {
      if (type === 'error') {
        console.error(message);
      } else {
        console.info(message);
      }
      return;
    }

    await window.Swal.fire({
      title: title || (type === 'error' ? 'Error' : 'Mensaje'),
      text: message,
      icon: iconFromType(type),
      confirmButtonText: 'Aceptar',
      background: '#0f1b2d',
      color: '#e9f0ff',
    });
  }

  window.appAlerts = {
    confirm,
    toast,
    notify,
  };
})();
