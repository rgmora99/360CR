(function initSelfBookingPortal() {
  const $ = (id) => document.getElementById(id);

  const subtitle = $('self-book-subtitle');
  const selfBookForm = $('self-book-form');
  const availabilityResult = $('availability-result');
  const checkAvailabilityButton = $('check-availability');

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

  function calculateEndTime() {
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

  function formatDate(value) {
    return new Date(value).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
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
      return payload.detail || error.message;
    } catch (_error) {
      return error.message;
    }
  }

  async function loadPublicContext() {
    const payload = await request(`${getApiBase()}/agenda-events/self-book-context/?organization_id=${organizationId}`);
    eventTypeId = payload.event_type_id;
    subtitle.textContent = `Reserva tu cita para ${payload.organization_name}.`;
    servicesById = new Map(payload.services.map((service) => [service.id, service]));

    populateSelect(selfBook.service, payload.services, 'Seleccione servicio', (item) => item.name);
    populateSelect(selfBook.collaborator, payload.collaborators, 'Seleccione colaborador', (item) => item.email);
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
      availabilityResult.textContent = 'No encontramos esta cédula. Completa los datos para crear tu perfil cliente.';
      return;
    }

    selectedCustomer = result.payload.customer;
    setExtraFieldsVisible(false);
    availabilityResult.textContent = `Cliente identificado: ${selectedCustomer.legal_name}.`;
  }

  async function syncCustomerFromPadron() {
    if (!window.CedulaPadron) {
      return;
    }

    const taxId = selfBook.taxId.value.trim();
    if (!taxId) {
      return;
    }

    const record = await window.CedulaPadron.resolveByCedula(taxId);
    if (!record) {
      return;
    }

    if (!selfBook.legalName.value.trim()) {
      selfBook.legalName.value = record.fullName;
      availabilityResult.textContent = `Nombre autocompletado desde padrón: ${record.fullName}.`;
      return;
    }

    const isSameName = window.CedulaPadron.compareName(selfBook.legalName.value, record);
    if (isSameName === false) {
      availabilityResult.textContent = `La cédula corresponde a "${record.fullName}". Verifica el nombre ingresado.`;
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
      if (!selfBook.date.value || !selfBook.collaborator.value) {
        throw new Error('Selecciona fecha y colaborador para consultar disponibilidad.');
      }

      const params = new URLSearchParams({
        organization_id: String(organizationId),
        collaborator_id: selfBook.collaborator.value,
        date: selfBook.date.value,
      });

      const result = await request(`${getApiBase()}/agenda-events/availability/?${params.toString()}`);
      if (!result.occupied.length) {
        availabilityResult.textContent = 'Disponible todo el día para ese colaborador.';
        return;
      }

      availabilityResult.textContent = result.occupied
        .map((item) => `${formatDate(item.starts_at)} - ${formatDate(item.ends_at)} | ${item.title}`)
        .join('\n');
    } catch (error) {
      availabilityResult.textContent = `Error: ${normalizeErrorMessage(error)}`;
    }
  }

  selfBookForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const customer = await ensureCustomer();
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

      availabilityResult.textContent = `Tu cita fue agendada correctamente para ${customer.legal_name}.`;
      selfBookForm.reset();
      selectedCustomer = null;
      setExtraFieldsVisible(false);
    } catch (error) {
      availabilityResult.textContent = `No se pudo autoagendar: ${normalizeErrorMessage(error)}`;
    }
  });

  selfBook.taxId.addEventListener('blur', () => {
    resolveCustomerByTaxId()
      .then(syncCustomerFromPadron)
      .catch((error) => {
        availabilityResult.textContent = `No se pudo validar la cédula: ${normalizeErrorMessage(error)}`;
      });
  });

  selfBook.taxId.addEventListener('input', () => {
    selectedCustomer = null;
  });
  selfBook.service.addEventListener('change', calculateEndTime);
  selfBook.start.addEventListener('input', calculateEndTime);

  checkAvailabilityButton.addEventListener('click', checkAvailability);

  try {
    organizationId = getOrganizationIdFromUrl();
    setExtraFieldsVisible(false);
    loadPublicContext().catch((error) => {
      availabilityResult.textContent = `No se pudo cargar el portal: ${normalizeErrorMessage(error)}`;
    });
  } catch (error) {
    availabilityResult.textContent = error.message;
    checkAvailabilityButton.disabled = true;
    selfBookForm.querySelector('button[type="submit"]').disabled = true;
  }
})();
