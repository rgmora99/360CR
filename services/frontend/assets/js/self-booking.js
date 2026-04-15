(function initSelfBookingPortal() {
  const $ = (id) => document.getElementById(id);

  const subtitle = $('self-book-subtitle');
  const selfBookForm = $('self-book-form');
  const availabilityResult = $('availability-result');
  const checkAvailabilityButton = $('check-availability');
  const slotList = $('self-slot-list');
  const scheduleHint = $('self-schedule-hint');
  const summaryContent = $('booking-summary-content');

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

  const customerExtraFields = {
    legalName: $('self-legal-name-wrap'),
    email: $('self-email-wrap'),
    phone: $('self-phone-wrap'),
  };

  let organizationId = null;
  let eventTypeId = null;
  let selectedCustomer = null;
  let servicesById = new Map();
  let collaboratorsById = new Map();
  let availableSlots = [];
  let padronTypingTimer = null;

  function getApiBase() {
    return '/api';
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

    if (!response.ok) {
      throw new Error(bodyText || 'Error inesperado del servidor.');
    }

    if (!bodyText) {
      return null;
    }

    if (!contentType.includes('application/json')) {
      throw new Error('El endpoint respondió contenido no JSON.');
    }

    return JSON.parse(bodyText);
  }

  async function requestAllow404(url) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();
    const payload = bodyText && contentType.includes('application/json') ? JSON.parse(bodyText) : null;

    if (response.status === 404) {
      return { notFound: true, payload };
    }

    if (!response.ok) {
      throw new Error((payload && payload.detail) || bodyText || 'Error inesperado del servidor.');
    }

    return { notFound: false, payload };
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

  function calculateEndTime() {
    const selectedSlot = availableSlots.find((slot) => slot.start_time === selfBook.start.value);
    if (selectedSlot) {
      selfBook.end.value = selectedSlot.end_time;
      return;
    }

    const serviceId = Number(selfBook.service.value);
    const service = servicesById.get(serviceId);
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

  function setExtraFieldsVisible(isVisible) {
    Object.values(customerExtraFields).forEach((node) => {
      node.classList.toggle('is-hidden', !isVisible);
    });
    selfBook.legalName.required = isVisible;
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

  function renderSummary() {
    const service = servicesById.get(Number(selfBook.service.value));
    const collaborator = collaboratorsById.get(Number(selfBook.collaborator.value));
    summaryContent.innerHTML = `
      <span>Servicio</span><strong>${service?.name || 'Pendiente'}</strong>
      <span>Colaborador</span><strong>${collaborator?.email || 'Pendiente'}</strong>
      <span>Fecha</span><strong>${formatDateOnly(selfBook.date.value)}</strong>
      <span>Hora</span><strong>${selfBook.start.value ? `${selfBook.start.value} - ${selfBook.end.value}` : 'Pendiente'}</strong>
    `;
  }

  function resetAvailableSlots(message = 'Sin consulta.') {
    availableSlots = [];
    selfBook.start.value = '';
    selfBook.end.value = '';
    slotList.innerHTML = '<p class="slot-list__empty">Todavía no has consultado horarios.</p>';
    scheduleHint.textContent = 'Selecciona servicio, colaborador y fecha para cargar los espacios.';
    setStatusMessage(message);
    renderSummary();
  }

  function isConflictErrorMessage(message) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('ya existe una cita') || normalized.includes('se cruza con ese horario');
  }

  function selectSlot(startTime) {
    selfBook.start.value = startTime;
    calculateEndTime();
    slotList.querySelectorAll('.slot-chip').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.startTime === startTime);
    });
    renderSummary();
  }

  function renderAvailableSlots(result) {
    availableSlots = Array.isArray(result.available_slots) ? result.available_slots : [];
    const serviceDuration = result.service?.duration_minutes;
    const stepMinutes = result.service?.slot_step_minutes;
    scheduleHint.textContent = result.schedule
      ? `Horario del colaborador: ${result.schedule.start_time} - ${result.schedule.end_time}.${serviceDuration ? ` Servicio: ${serviceDuration} min.` : ''}${stepMinutes ? ` Inicios cada ${stepMinutes} min.` : ''}`
      : 'El colaborador no tiene horario configurado para este día.';

    if (!availableSlots.length) {
      slotList.innerHTML = '<p class="slot-list__empty">No hay horarios disponibles para esta fecha.</p>';
      selfBook.start.value = '';
      selfBook.end.value = '';
      renderSummary();
      setStatusMessage(
        result.schedule
          ? `No hay espacios disponibles. Horario del colaborador: ${result.schedule.start_time} - ${result.schedule.end_time}.`
          : 'El colaborador no tiene horario configurado para ese día.',
        'is-warning'
      );
      return;
    }

    slotList.innerHTML = availableSlots
      .map(
        (slot) => `
          <button type="button" class="slot-chip" data-start-time="${slot.start_time}">
            <strong>${slot.start_time} - ${slot.end_time}</strong>
            <span>Disponible</span>
          </button>
        `
      )
      .join('');
    renderSummary();
    setStatusMessage(`Encontramos ${availableSlots.length} horario(s) disponible(s). Selecciona el que prefieras.`, 'is-success');
  }

  async function loadPublicContext() {
    const payload = await request(`${getApiBase()}/agenda-events/self-book-context/?organization_id=${organizationId}`);
    eventTypeId = payload.event_type_id;
    subtitle.textContent = `Reserva tu cita para ${payload.organization_name}.`;
    servicesById = new Map(payload.services.map((service) => [service.id, service]));
    collaboratorsById = new Map(payload.collaborators.map((collaborator) => [collaborator.id, collaborator]));

    populateSelect(selfBook.service, payload.services, 'Seleccione servicio', (item) => item.name);
    populateSelect(selfBook.collaborator, payload.collaborators, 'Seleccione colaborador', (item) => item.email);
    renderSummary();
  }

  async function resolveCustomerByTaxId() {
    const taxId = selfBook.taxId.value.trim();
    if (!taxId) {
      selectedCustomer = null;
      setExtraFieldsVisible(false);
      return;
    }

    const query = new URLSearchParams({ organization_id: String(organizationId), tax_id: taxId });
    const result = await requestAllow404(`${getApiBase()}/agenda-events/self-book-customer/?${query.toString()}`);

    if (result.notFound) {
      selectedCustomer = null;
      setExtraFieldsVisible(true);
      setStatusMessage('No encontramos esta cédula. Completa los datos para crear tu perfil cliente.', 'is-warning');
      return;
    }

    selectedCustomer = result.payload.customer;
    setExtraFieldsVisible(false);
    setStatusMessage(`Cliente identificado: ${selectedCustomer.legal_name}.`, 'is-success');
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
    if (selectedCustomer?.id) {
      return selectedCustomer;
    }

    const taxId = selfBook.taxId.value.trim();
    if (!taxId) {
      throw new Error('Ingresa la cédula del cliente.');
    }

    const payload = {
      organization_id: organizationId,
      tax_id: taxId,
      legal_name: selfBook.legalName.value.trim(),
      email: selfBook.email.value.trim(),
      phone: selfBook.phone.value.trim(),
    };

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
        throw new Error('Selecciona servicio, fecha y colaborador para consultar disponibilidad.');
      }

      const params = new URLSearchParams({
        organization_id: String(organizationId),
        collaborator_id: selfBook.collaborator.value,
        service_id: selfBook.service.value,
        date: selfBook.date.value,
      });

      const result = await request(`${getApiBase()}/agenda-events/availability/?${params.toString()}`);
      renderAvailableSlots(result);
      if (selfBook.start.value) {
        const stillAvailable = availableSlots.some((slot) => slot.start_time === selfBook.start.value);
        if (!stillAvailable) {
          selfBook.start.value = '';
          selfBook.end.value = '';
          renderSummary();
        }
      }
    } catch (error) {
      resetAvailableSlots('Sin consulta.');
      notifyUser(normalizeErrorMessage(error), 'error', 'No se pudo consultar disponibilidad').catch(() => null);
    }
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
        title: `Cita ${customer.legal_name}`,
        starts_at: combineDateAndTime(selfBook.date.value, selfBook.start.value),
        status: 'pending',
        priority: 'medium',
        reminder_minutes: 30,
      };

      validatePayload(payload);

      await request(`${getApiBase()}/agenda-events/self-book/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      await notifyUser(`Tu cita fue agendada correctamente para ${customer.legal_name}.`, 'success', 'Cita agendada');
      selfBookForm.reset();
      selectedCustomer = null;
      setExtraFieldsVisible(false);
      resetAvailableSlots('Sin consulta.');
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
      await notifyUser(message, 'error', 'No se pudo agendar la cita');
    }
  });

  selfBook.taxId.addEventListener('blur', () => {
    resolveCustomerByTaxId()
      .then(syncCustomerFromPadron)
      .catch((error) => {
        notifyUser(normalizeErrorMessage(error), 'error', 'No se pudo validar la cédula').catch(() => null);
      });
  });

  selfBook.taxId.addEventListener('input', () => {
    selectedCustomer = null;
    if (padronTypingTimer) clearTimeout(padronTypingTimer);
    padronTypingTimer = setTimeout(() => {
      resolveCustomerByTaxId()
        .then(syncCustomerFromPadron)
        .catch(() => null);
    }, 250);
  });

  selfBook.service.addEventListener('change', () => {
    resetAvailableSlots('Selecciona fecha y colaborador, luego consulta horarios.');
    renderSummary();
  });
  selfBook.collaborator.addEventListener('change', () => {
    resetAvailableSlots('Selecciona fecha y colaborador, luego consulta horarios.');
    renderSummary();
  });
  selfBook.date.addEventListener('change', () => {
    resetAvailableSlots('Selecciona fecha y colaborador, luego consulta horarios.');
    renderSummary();
  });

  slotList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-start-time]');
    if (!button) return;
    selectSlot(button.dataset.startTime);
  });

  checkAvailabilityButton.addEventListener('click', checkAvailability);

  try {
    organizationId = getOrganizationIdFromUrl();
    setExtraFieldsVisible(false);
    resetAvailableSlots('Selecciona servicio, colaborador y fecha para consultar horarios.');
    loadPublicContext().catch((error) => {
      setStatusMessage(`No se pudo cargar el portal: ${normalizeErrorMessage(error)}`, 'is-error');
    });
  } catch (error) {
    setStatusMessage(error.message, 'is-error');
    checkAvailabilityButton.disabled = true;
    selfBookForm.querySelector('button[type="submit"]').disabled = true;
  }
})();
