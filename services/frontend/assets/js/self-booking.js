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
    title: $('self-title'),
  };

  let organizationId = null;
  let eventTypeId = null;

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
    if (payload.ends_at <= payload.starts_at) {
      throw new Error('La hora final debe ser mayor que la inicial.');
    }
  }

  function formatDate(value) {
    return new Date(value).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function loadPublicContext() {
    const payload = await request(`${getApiBase()}/agenda-events/self-book-context/?organization_id=${organizationId}`);
    eventTypeId = payload.event_type_id;
    subtitle.textContent = `Reserva tu cita para ${payload.organization_name}.`;

    populateSelect(selfBook.service, payload.services, 'Seleccione servicio', (item) => item.name);
    populateSelect(selfBook.collaborator, payload.collaborators, 'Seleccione colaborador', (item) => item.email);
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
      availabilityResult.textContent = `Error: ${error.message}`;
    }
  }

  selfBookForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const payload = {
        organization: organizationId,
        event_type: eventTypeId,
        service: Number(selfBook.service.value),
        collaborator: Number(selfBook.collaborator.value),
        title: selfBook.title.value.trim(),
        starts_at: combineDateAndTime(selfBook.date.value, selfBook.start.value),
        ends_at: combineDateAndTime(selfBook.date.value, selfBook.end.value),
        status: 'pending',
        priority: 'medium',
        reminder_minutes: 30,
      };

      validatePayload(payload);

      await request(`${getApiBase()}/agenda-events/self-book/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      availabilityResult.textContent = 'Tu cita fue agendada correctamente.';
      selfBookForm.reset();
    } catch (error) {
      availabilityResult.textContent = `No se pudo autoagendar: ${error.message}`;
    }
  });

  checkAvailabilityButton.addEventListener('click', checkAvailability);

  try {
    organizationId = getOrganizationIdFromUrl();
    loadPublicContext().catch((error) => {
      availabilityResult.textContent = `No se pudo cargar el portal: ${error.message}`;
    });
  } catch (error) {
    availabilityResult.textContent = error.message;
    checkAvailabilityButton.disabled = true;
    selfBookForm.querySelector('button[type="submit"]').disabled = true;
  }
})();
