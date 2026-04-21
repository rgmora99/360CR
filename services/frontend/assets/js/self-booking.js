(function initSelfBookingPortal() {
  const $ = (id) => document.getElementById(id);

  const subtitle = $('self-book-subtitle');
  const selfBookForm = $('self-book-form');
  const manageBookingForm = $('manage-booking-form');
  const availabilityResult = $('availability-result');
  const checkAvailabilityButton = $('check-availability');
  const slotList = $('self-slot-list');
  const scheduleHint = $('self-schedule-hint');
  const summaryContent = $('booking-summary-content');
  const historyList = $('history-list');
  const bookingModeBanner = $('booking-mode-banner');
  const bookingModeText = $('booking-mode-text');
  const cancelEditingButton = $('cancel-editing');
  const submitBookingButton = $('submit-booking');
  const manageReferenceInput = $('manage-reference');
  const manageAccessCodeInput = $('manage-access-code');

  const selfBook = {
    service: $('self-service'),
    collaborator: $('self-collaborator'),
    date: $('self-date'),
    start: $('self-start'),
    end: $('self-end'),
    taxId: $('self-tax-id'),
    legalName: $('self-legal-name'),
    email: $('self-email'),
    phone: $('self-phone'),
  };

  let organizationId = null;
  let eventTypeId = null;
  let selectedCustomer = null;
  let servicesById = new Map();
  let collaboratorsById = new Map();
  let availableSlots = [];
  let managedAppointments = [];
  let editingAppointment = null;
  let padronTypingTimer = null;

  function getApiBase() {
    return '/api';
  }

  function getStorageKey() {
    return `cr360.selfBookingAppointments.${organizationId}`;
  }

  function getOrganizationIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const value = Number(params.get('organization_id'));
    if (!value || value < 1) {
      throw new Error('El link no contiene una organización válida. Solicita un nuevo link.');
    }
    return value;
  }

  async function request(url, options) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();
    const payload = bodyText && contentType.includes('application/json') ? JSON.parse(bodyText) : null;

    if (!response.ok) {
      throw new Error((payload && payload.detail) || bodyText || 'Error inesperado del servidor.');
    }

    return payload;
  }

  function loadStoredCredentials() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function saveStoredCredentials(items) {
    localStorage.setItem(getStorageKey(), JSON.stringify(items));
  }

  function upsertManagedCredential(reference, accessCode) {
    const normalizedReference = String(reference || '').trim().toUpperCase();
    const normalizedAccessCode = String(accessCode || '').trim().toUpperCase();
    if (!normalizedReference || !normalizedAccessCode) return;

    const current = loadStoredCredentials().filter((item) => item.reference !== normalizedReference);
    current.unshift({ reference: normalizedReference, accessCode: normalizedAccessCode });
    saveStoredCredentials(current.slice(0, 12));
  }

  function removeManagedCredential(reference) {
    const normalizedReference = String(reference || '').trim().toUpperCase();
    saveStoredCredentials(loadStoredCredentials().filter((item) => item.reference !== normalizedReference));
  }

  function populateSelect(select, items, placeholder, labelFn) {
    select.innerHTML = [`<option value="">${placeholder}</option>`]
      .concat(items.map((item) => `<option value="${item.id}">${labelFn(item)}</option>`))
      .join('');
  }

  function combineDateAndTime(dateValue, timeValue) {
    return new Date(`${dateValue}T${timeValue}`).toISOString();
  }

  function validatePayload(payload) {
    if (!payload.service || !payload.collaborator) {
      throw new Error('Selecciona servicio y colaborador.');
    }
    if (!selfBook.taxId.value.trim() || !selfBook.legalName.value.trim()) {
      throw new Error('Completa tu cédula y nombre antes de continuar.');
    }
  }

  function setStatusMessage(message, variant = '') {
    availabilityResult.textContent = message;
    availabilityResult.classList.remove('is-success', 'is-error', 'is-warning');
    if (variant) {
      availabilityResult.classList.add(variant);
    }
  }

  async function notifyUser(message, type = 'info', title = '') {
    const map = {
      success: 'is-success',
      error: 'is-error',
      warning: 'is-warning',
      info: '',
    };
    setStatusMessage(message, map[type] || '');
    if (window.appAlerts?.notify) {
      await window.appAlerts.notify(message, type, title);
    }
  }

  function normalizeErrorMessage(error) {
    try {
      const payload = JSON.parse(error.message);
      if (typeof payload === 'string') return payload;
      if (payload.detail) return payload.detail;
      const firstKey = Object.keys(payload)[0];
      const firstValue = payload[firstKey];
      if (Array.isArray(firstValue)) return `${firstKey}: ${firstValue.join(', ')}`;
      if (typeof firstValue === 'string') return `${firstKey}: ${firstValue}`;
      return error.message;
    } catch (_error) {
      return error.message;
    }
  }

  function formatDateOnly(value) {
    if (!value) return 'Pendiente';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatTimeInput(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatDateTime(value) {
    return new Date(value).toLocaleString('es-CR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  function statusClass(status) {
    if (status === 'done') return 'is-done';
    if (status === 'cancelled') return 'is-cancelled';
    return 'is-pending';
  }

  function updateBookingModeUi() {
    const isEditing = Boolean(editingAppointment);
    bookingModeBanner.classList.toggle('is-hidden', !isEditing);
    submitBookingButton.textContent = isEditing ? 'Guardar cambios de la cita' : 'Agendar cita';
    if (isEditing && editingAppointment) {
      bookingModeText.textContent = `Estás moviendo la cita ${editingAppointment.reference} de ${formatDateTime(editingAppointment.starts_at)}.`;
    }
  }

  function renderSummary() {
    const service = servicesById.get(Number(selfBook.service.value));
    const collaborator = collaboratorsById.get(Number(selfBook.collaborator.value));
    summaryContent.innerHTML = `
      <span>Servicio</span><strong>${service?.name || 'Pendiente'}</strong>
      <span>Especialista</span><strong>${collaborator?.label || 'Pendiente'}</strong>
      <span>Fecha</span><strong>${formatDateOnly(selfBook.date.value)}</strong>
      <span>Hora</span><strong>${selfBook.start.value ? `${selfBook.start.value} - ${selfBook.end.value}` : 'Pendiente'}</strong>
    `;
  }

  function clearBookingSelection() {
    selfBook.service.value = '';
    selfBook.collaborator.value = '';
    selfBook.date.value = '';
    selfBook.start.value = '';
    selfBook.end.value = '';
    availableSlots = [];
    slotList.innerHTML = '<p class="slot-list__empty">Todavía no has consultado horarios.</p>';
    scheduleHint.textContent = 'Selecciona servicio, especialista y fecha para cargar los espacios.';
    renderSummary();
  }

  function resetAvailableSlots(message = 'Sin consulta.') {
    availableSlots = [];
    selfBook.start.value = '';
    selfBook.end.value = '';
    slotList.innerHTML = '<p class="slot-list__empty">Todavía no has consultado horarios.</p>';
    scheduleHint.textContent = 'Selecciona servicio, especialista y fecha para cargar los espacios.';
    setStatusMessage(message);
    renderSummary();
  }

  function isConflictErrorMessage(message) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('ya existe una cita') || normalized.includes('se cruza con ese horario');
  }

  function calculateEndTime() {
    const selectedSlot = availableSlots.find((slot) => slot.start_time === selfBook.start.value);
    if (selectedSlot) {
      selfBook.end.value = selectedSlot.end_time;
      return;
    }

    const service = servicesById.get(Number(selfBook.service.value));
    if (!selfBook.start.value || !service?.service_duration_minutes) {
      selfBook.end.value = '';
      return;
    }

    const [hours, minutes] = selfBook.start.value.split(':').map((part) => Number(part));
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + Number(service.service_duration_minutes);
    const endHours = Math.floor((endMinutes % (24 * 60)) / 60);
    const endMins = endMinutes % 60;
    selfBook.end.value = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
  }

  function selectSlot(startTime) {
    selfBook.start.value = startTime;
    calculateEndTime();
    slotList.querySelectorAll('.slot-chip').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.startTime === startTime);
    });
    renderSummary();
  }

  function renderHistory() {
    if (!managedAppointments.length) {
      historyList.innerHTML = '<p class="slot-list__empty">Aquí verás tus reservas guardadas en este dispositivo o cualquier cita que abras con referencia y código.</p>';
      return;
    }

    historyList.innerHTML = managedAppointments
      .map(
        (appointment) => `
          <article class="history-card">
            <div class="history-card__head">
              <div>
                <h3 class="history-card__title">${appointment.service_name || appointment.title}</h3>
                <span class="status-pill ${statusClass(appointment.status)}">${appointment.status_display || appointment.status}</span>
              </div>
            </div>
            <div class="history-card__meta">
              <div><span>Referencia</span><strong>${appointment.reference}</strong></div>
              <div><span>Fecha</span><strong>${formatDateTime(appointment.starts_at)}</strong></div>
              <div><span>Fin</span><strong>${formatDateTime(appointment.ends_at)}</strong></div>
              <div><span>Especialista</span><strong>${appointment.collaborator_label || 'Por confirmar'}</strong></div>
            </div>
            <div class="history-card__actions">
              ${appointment.can_reschedule ? `<button class="btn btn-secondary" type="button" data-action="reschedule" data-reference="${appointment.reference}">Mover cita</button>` : ''}
              ${appointment.can_cancel ? `<button class="btn btn-secondary" type="button" data-action="cancel" data-reference="${appointment.reference}">Cancelar cita</button>` : ''}
            </div>
          </article>
        `
      )
      .join('');
  }

  function upsertManagedAppointment(appointment, accessCode, persist = true) {
    const normalizedReference = String(appointment.reference || '').trim().toUpperCase();
    const normalizedAccessCode = String(accessCode || '').trim().toUpperCase();
    const next = {
      ...appointment,
      reference: normalizedReference,
      access_code: normalizedAccessCode,
    };
    managedAppointments = managedAppointments.filter((item) => item.reference !== normalizedReference);
    managedAppointments.unshift(next);
    if (persist) {
      upsertManagedCredential(normalizedReference, normalizedAccessCode);
    }
    renderHistory();
    return next;
  }

  function findManagedAppointment(reference) {
    const normalizedReference = String(reference || '').trim().toUpperCase();
    return managedAppointments.find((item) => item.reference === normalizedReference);
  }

  async function loadManagedAppointment(reference, accessCode, options = {}) {
    const normalizedReference = String(reference || '').trim().toUpperCase();
    const normalizedAccessCode = String(accessCode || '').trim().toUpperCase();
    const payload = await request(`${getApiBase()}/agenda-events/self-book-lookup/`, {
      method: 'POST',
      body: JSON.stringify({
        reference: normalizedReference,
        access_code: normalizedAccessCode,
      }),
    });

    const appointment = upsertManagedAppointment(payload.appointment, normalizedAccessCode, options.persist !== false);
    if (options.notify !== false) {
      await notifyUser(`Reserva ${appointment.reference} cargada correctamente.`, 'success', 'Reserva abierta');
    }
    return appointment;
  }

  async function loadStoredAppointments() {
    const stored = loadStoredCredentials();
    for (const item of stored) {
      try {
        await loadManagedAppointment(item.reference, item.accessCode, { notify: false, persist: false });
      } catch (_error) {
        removeManagedCredential(item.reference);
      }
    }
    renderHistory();
  }

  async function loadPublicContext() {
    const payload = await request(`${getApiBase()}/agenda-events/self-book-context/?organization_id=${organizationId}`);
    eventTypeId = payload.event_type_id;
    subtitle.textContent = `Reserva tu cita para ${payload.organization_name}.`;
    servicesById = new Map(payload.services.map((service) => [service.id, service]));
    collaboratorsById = new Map(payload.collaborators.map((collaborator) => [collaborator.id, collaborator]));

    populateSelect(selfBook.service, payload.services, 'Seleccione servicio', (item) => item.name);
    populateSelect(selfBook.collaborator, payload.collaborators, 'Seleccione especialista', (item) => item.label);
    renderSummary();
  }

  async function syncCustomerFromPadron() {
    if (!window.CedulaPadron) {
      return;
    }

    const taxId = selfBook.taxId.value.trim();
    if (!taxId) {
      return;
    }
    const normalizedTaxId = window.CedulaPadron.normalizeCedula(taxId);
    if (normalizedTaxId.length < 9) return;

    const record = await window.CedulaPadron.resolveByCedula(taxId);
    if (!record) {
      setStatusMessage(`La cédula ${taxId} no existe en el padrón electoral.`, 'is-warning');
      return;
    }

    if (!selfBook.legalName.value.trim()) {
      selfBook.legalName.value = record.fullName;
      setStatusMessage(`Nombre autocompletado desde padrón: ${record.fullName}.`, 'is-success');
      return;
    }

    const isSameName = window.CedulaPadron.compareName(selfBook.legalName.value, record);
    if (isSameName === false) {
      setStatusMessage(`La cédula corresponde a "${record.fullName}". Verifica el nombre ingresado.`, 'is-warning');
    }
  }

  async function ensureCustomer() {
    if (selectedCustomer?.id && selectedCustomer.tax_id === selfBook.taxId.value.trim()) {
      return selectedCustomer;
    }

    const payload = {
      organization_id: organizationId,
      tax_id: selfBook.taxId.value.trim(),
      legal_name: selfBook.legalName.value.trim(),
      email: selfBook.email.value.trim(),
      phone: selfBook.phone.value.trim(),
    };

    if (!payload.tax_id || !payload.legal_name) {
      throw new Error('Completa al menos la cédula y el nombre para continuar.');
    }

    const response = await request(`${getApiBase()}/agenda-events/self-book-customer/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    selectedCustomer = response.customer;
    return selectedCustomer;
  }

  async function checkAvailability() {
    try {
      if (!selfBook.date.value || !selfBook.collaborator.value || !selfBook.service.value) {
        throw new Error('Selecciona servicio, fecha y especialista para consultar disponibilidad.');
      }

      const params = new URLSearchParams({
        organization_id: String(organizationId),
        collaborator_id: selfBook.collaborator.value,
        service_id: selfBook.service.value,
        date: selfBook.date.value,
      });
      if (editingAppointment?.id) {
        params.set('exclude_event_id', String(editingAppointment.id));
      }

      const result = await request(`${getApiBase()}/agenda-events/availability/?${params.toString()}`);
      availableSlots = Array.isArray(result.available_slots) ? result.available_slots : [];
      const serviceDuration = result.service?.duration_minutes;
      const stepMinutes = result.service?.slot_step_minutes;
      scheduleHint.textContent = result.schedule
        ? `Horario disponible: ${result.schedule.start_time} - ${result.schedule.end_time}.${serviceDuration ? ` Servicio: ${serviceDuration} min.` : ''}${stepMinutes ? ` Inicios cada ${stepMinutes} min.` : ''}`
        : 'El especialista no tiene horario configurado para este día.';

      if (!availableSlots.length) {
        slotList.innerHTML = '<p class="slot-list__empty">No hay horarios disponibles para esta fecha.</p>';
        selfBook.start.value = '';
        selfBook.end.value = '';
        renderSummary();
        setStatusMessage(
          result.schedule
            ? `No hay espacios disponibles dentro del horario actual.`
            : 'El especialista no tiene horario configurado para ese día.',
          'is-warning'
        );
        return;
      }

      slotList.innerHTML = availableSlots
        .map(
          (slot) => `
            <button type="button" class="slot-chip" data-start-time="${slot.start_time}">
              <strong>${slot.start_time} - ${slot.end_time}</strong>
              <span>${editingAppointment ? 'Disponible para reprogramar' : 'Disponible'}</span>
            </button>
          `
        )
        .join('');
      renderSummary();
      setStatusMessage(`Encontramos ${availableSlots.length} horario(s) disponible(s). Selecciona el que prefieras.`, 'is-success');

      if (selfBook.start.value) {
        const stillAvailable = availableSlots.some((slot) => slot.start_time === selfBook.start.value);
        if (!stillAvailable) {
          selfBook.start.value = '';
          selfBook.end.value = '';
        } else {
          selectSlot(selfBook.start.value);
        }
      }
    } catch (error) {
      resetAvailableSlots('Sin consulta.');
      notifyUser(normalizeErrorMessage(error), 'error', 'No se pudo consultar disponibilidad').catch(() => null);
    }
  }

  async function beginReschedule(reference) {
    const appointment = findManagedAppointment(reference);
    if (!appointment) return;

    editingAppointment = appointment;
    updateBookingModeUi();

    const startsAt = new Date(appointment.starts_at);
    selfBook.service.value = String(appointment.service || '');
    selfBook.collaborator.value = String(appointment.collaborator || '');
    selfBook.date.value = formatDateInput(startsAt);
    selfBook.start.value = formatTimeInput(startsAt);
    calculateEndTime();
    renderSummary();
    await checkAvailability();
    if (selfBook.start.value) {
      selectSlot(selfBook.start.value);
    }
    setStatusMessage('Elige un nuevo horario y guarda los cambios de la cita.', 'is-warning');
  }

  function cancelEditingMode() {
    editingAppointment = null;
    updateBookingModeUi();
    clearBookingSelection();
    setStatusMessage('Modo reprogramación cancelado.', 'is-success');
  }

  async function cancelAppointment(reference) {
    const appointment = findManagedAppointment(reference);
    if (!appointment) {
      throw new Error('No encontramos la reserva en este dispositivo.');
    }

    const payload = await request(`${getApiBase()}/agenda-events/self-book-cancel/`, {
      method: 'POST',
      body: JSON.stringify({
        reference: appointment.reference,
        access_code: appointment.access_code,
      }),
    });

    upsertManagedAppointment(payload.appointment, appointment.access_code);
    if (editingAppointment && editingAppointment.reference === appointment.reference) {
      cancelEditingMode();
    }
    setStatusMessage('La cita fue cancelada correctamente.', 'is-success');
  }

  selfBookForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const customer = await ensureCustomer();
      if (!selfBook.start.value) {
        throw new Error('Selecciona una hora disponible antes de agendar la cita.');
      }
      const payload = {
        organization: organizationId,
        event_type: eventTypeId,
        service: Number(selfBook.service.value),
        collaborator: Number(selfBook.collaborator.value),
        customer: customer.id,
        title: `Cita ${selfBook.legalName.value.trim()}`,
        starts_at: combineDateAndTime(selfBook.date.value, selfBook.start.value),
        status: 'pending',
        priority: 'medium',
        reminder_minutes: 30,
      };

      validatePayload(payload);

      if (editingAppointment) {
        const response = await request(`${getApiBase()}/agenda-events/self-book-reschedule/`, {
          method: 'POST',
          body: JSON.stringify({
            reference: editingAppointment.reference,
            access_code: editingAppointment.access_code,
            service: payload.service,
            collaborator: payload.collaborator,
            starts_at: payload.starts_at,
          }),
        });
        upsertManagedAppointment(response.appointment, editingAppointment.access_code);
        cancelEditingMode();
        await notifyUser(`La cita ${response.appointment.reference} fue reprogramada correctamente.`, 'success', 'Cita actualizada');
        return;
      }

      const response = await request(`${getApiBase()}/agenda-events/self-book/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const credentials = response.appointment.manage_credentials || {};
      upsertManagedAppointment(response.appointment, credentials.access_code);
      manageReferenceInput.value = credentials.reference || '';
      manageAccessCodeInput.value = credentials.access_code || '';
      clearBookingSelection();

      await notifyUser(
        `Tu cita quedó reservada. Guarda la referencia ${credentials.reference} y el código ${credentials.access_code}. También los dejamos guardados en este dispositivo.`,
        'success',
        'Cita agendada'
      );
    } catch (error) {
      const message = normalizeErrorMessage(error);
      if (isConflictErrorMessage(message)) {
        await checkAvailability();
        await notifyUser(
          `${message} Actualicé los horarios disponibles para que elijas otro espacio libre.`,
          'warning',
          'Horario recién ocupado'
        );
        return;
      }
      await notifyUser(message, 'error', editingAppointment ? 'No se pudo mover la cita' : 'No se pudo agendar la cita');
    }
  });

  manageBookingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const reference = manageReferenceInput.value.trim();
      const accessCode = manageAccessCodeInput.value.trim();
      if (!reference || !accessCode) {
        throw new Error('Ingresa la referencia y el código de acceso para abrir una reserva.');
      }
      await loadManagedAppointment(reference, accessCode, { notify: true, persist: true });
    } catch (error) {
      await notifyUser(normalizeErrorMessage(error), 'error', 'No se pudo abrir la reserva');
    }
  });

  selfBook.taxId.addEventListener('blur', () => {
    syncCustomerFromPadron().catch((error) => {
      notifyUser(normalizeErrorMessage(error), 'error', 'No se pudo validar la cédula').catch(() => null);
    });
  });

  selfBook.taxId.addEventListener('input', () => {
    selectedCustomer = null;
    if (padronTypingTimer) clearTimeout(padronTypingTimer);
    padronTypingTimer = setTimeout(() => {
      syncCustomerFromPadron().catch(() => null);
    }, 250);
  });

  selfBook.service.addEventListener('change', () => {
    resetAvailableSlots('Selecciona fecha y especialista, luego consulta horarios.');
    renderSummary();
  });
  selfBook.collaborator.addEventListener('change', () => {
    resetAvailableSlots('Selecciona fecha y especialista, luego consulta horarios.');
    renderSummary();
  });
  selfBook.date.addEventListener('change', () => {
    resetAvailableSlots('Selecciona fecha y especialista, luego consulta horarios.');
    renderSummary();
  });

  slotList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-start-time]');
    if (!button) return;
    selectSlot(button.dataset.startTime);
  });

  historyList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const reference = button.dataset.reference;
    if (action === 'reschedule') {
      await beginReschedule(reference);
      return;
    }
    if (action === 'cancel') {
      let confirmed = true;
      if (window.Swal) {
        const result = await window.Swal.fire({
          title: '¿Cancelar cita?',
          text: 'Esta acción liberará el espacio para otros clientes.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, cancelar',
          cancelButtonText: 'No',
        });
        confirmed = result.isConfirmed;
      }
      if (!confirmed) return;
      try {
        await cancelAppointment(reference);
      } catch (error) {
        await notifyUser(normalizeErrorMessage(error), 'error', 'No se pudo cancelar la cita');
      }
    }
  });

  cancelEditingButton.addEventListener('click', cancelEditingMode);
  checkAvailabilityButton.addEventListener('click', checkAvailability);

  try {
    organizationId = getOrganizationIdFromUrl();
    updateBookingModeUi();
    resetAvailableSlots('Selecciona servicio, especialista y fecha para consultar horarios.');
    renderHistory();
    loadPublicContext()
      .then(loadStoredAppointments)
      .catch((error) => {
        setStatusMessage(`No se pudo cargar el portal: ${normalizeErrorMessage(error)}`, 'is-error');
      });
  } catch (error) {
    setStatusMessage(error.message, 'is-error');
    checkAvailabilityButton.disabled = true;
    submitBookingButton.disabled = true;
    if (manageBookingForm) {
      Array.from(manageBookingForm.elements).forEach((element) => {
        element.disabled = true;
      });
    }
  }
})();
