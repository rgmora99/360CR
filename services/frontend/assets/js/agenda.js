(function initAgendaModule() {
  const searchInput = document.getElementById('search');
  const statusFilter = document.getElementById('status-filter');
  const loadButton = document.getElementById('load-events');
  const eventsBody = document.getElementById('events-body');
  const feedback = document.getElementById('feedback');

  const eventForm = document.getElementById('event-form');
  const formTitle = document.getElementById('form-title');
  const cancelEditButton = document.getElementById('cancel-edit');

  const fields = {
    id: document.getElementById('event-id'),
    title: document.getElementById('title'),
    eventType: document.getElementById('event-type'),
    status: document.getElementById('status'),
    priority: document.getElementById('priority'),
    startsAt: document.getElementById('starts-at'),
    endsAt: document.getElementById('ends-at'),
    customerId: document.getElementById('customer-id'),
    supplierId: document.getElementById('supplier-id'),
    location: document.getElementById('location'),
    reminderMinutes: document.getElementById('reminder-minutes'),
    allDay: document.getElementById('all-day'),
    description: document.getElementById('description'),
  };

  let events = [];
  let eventTypes = [];

  function getApiBase() {
    return '/api';
  }

  function getOrganizationId() {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    if (!organizationId || organizationId < 1) {
      throw new Error('No hay organización activa. Selecciona una organización en la barra superior.');
    }
    return organizationId;
  }

  function setFeedback(message, isError) {
    feedback.textContent = message;
    feedback.style.color = isError ? '#ff7d7d' : 'var(--muted)';
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(message, isError ? 'error' : 'success');
    }
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

    if (response.status === 204 || !bodyText) {
      return null;
    }

    if (!contentType.includes('application/json')) {
      throw new Error('El endpoint respondió contenido no JSON. Revisa API base.');
    }

    return JSON.parse(bodyText);
  }

  function toIso(datetimeLocalValue) {
    return new Date(datetimeLocalValue).toISOString();
  }

  function toDateTimeLocal(value) {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
  }

  function formatDate(value) {
    return new Date(value).toLocaleString('es-CR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  function getEventTypeCode(eventTypeId) {
    const type = eventTypes.find((item) => item.id === Number(eventTypeId));
    return type?.name || '-';
  }

  function renderTable() {
    const term = searchInput.value.trim().toLowerCase();
    const selectedStatus = statusFilter.value;

    const filtered = events.filter((item) => {
      const matchText = `${item.title} ${item.description || ''}`.toLowerCase().includes(term);
      const matchStatus = !selectedStatus || selectedStatus === item.status;
      return matchText && matchStatus;
    });

    eventsBody.innerHTML = '';

    if (!filtered.length) {
      eventsBody.innerHTML = '<tr><td colspan="5">No hay eventos para mostrar.</td></tr>';
      return;
    }

    filtered.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.title}</td>
        <td>${getEventTypeCode(item.event_type)}</td>
        <td>${formatDate(item.starts_at)}</td>
        <td>${item.status}</td>
        <td>
          <button class="btn btn-secondary" data-action="edit" data-id="${item.id}">Editar</button>
          <button class="btn btn-secondary" data-action="delete" data-id="${item.id}">Eliminar</button>
        </td>
      `;
      eventsBody.appendChild(tr);
    });
  }

  async function ensureDefaultEventTypes() {
    if (eventTypes.length > 0) {
      return;
    }

    const defaults = [
      { code: 'reunion', name: 'Reunión', color: '#2563eb' },
      { code: 'llamada', name: 'Llamada', color: '#16a34a' },
      { code: 'tarea', name: 'Tarea', color: '#f59e0b' },
      { code: 'recordatorio', name: 'Recordatorio', color: '#9333ea' },
    ];

    for (const item of defaults) {
      await request(`${getApiBase()}/agenda-event-types/`, {
        method: 'POST',
        body: JSON.stringify(item),
      }).catch(() => null);
    }
  }

  async function loadEventTypes() {
    await ensureDefaultEventTypes();
    eventTypes = await request(`${getApiBase()}/agenda-event-types/`);
    fields.eventType.innerHTML = eventTypes.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');

    if (!eventTypes.length) {
      throw new Error('No hay tipos de evento configurados.');
    }
  }

  async function loadRelationOptions() {
    const organizationId = getOrganizationId();

    const [customers, suppliers] = await Promise.all([
      request(`${getApiBase()}/customers/?organization_id=${organizationId}`).catch(() => []),
      request(`${getApiBase()}/suppliers/?organization_id=${organizationId}`).catch(() => []),
    ]);

    fields.customerId.innerHTML = ['<option value="">Sin cliente</option>']
      .concat(customers.map((item) => `<option value="${item.id}">${item.legal_name}</option>`))
      .join('');

    fields.supplierId.innerHTML = ['<option value="">Sin proveedor</option>']
      .concat(suppliers.map((item) => `<option value="${item.id}">${item.legal_name}</option>`))
      .join('');
  }

  function resetForm() {
    eventForm.reset();
    fields.id.value = '';
    fields.reminderMinutes.value = '30';
    fields.status.value = 'pending';
    fields.priority.value = 'medium';
    formTitle.textContent = 'Nuevo evento';
  }

  function buildPayload() {
    return {
      organization: getOrganizationId(),
      event_type: Number(fields.eventType.value),
      customer: fields.customerId.value ? Number(fields.customerId.value) : null,
      supplier: fields.supplierId.value ? Number(fields.supplierId.value) : null,
      title: fields.title.value.trim(),
      description: fields.description.value.trim(),
      starts_at: toIso(fields.startsAt.value),
      ends_at: toIso(fields.endsAt.value),
      all_day: fields.allDay.checked,
      status: fields.status.value,
      priority: fields.priority.value,
      reminder_minutes: Number(fields.reminderMinutes.value || 0),
      location: fields.location.value.trim(),
    };
  }

  async function loadEvents() {
    try {
      const organizationId = getOrganizationId();
      events = await request(`${getApiBase()}/agenda-events/?organization_id=${organizationId}`);
      renderTable();
      setFeedback(`Se cargaron ${events.length} eventos de agenda.`);
    } catch (error) {
      setFeedback(`Error al cargar agenda: ${error.message}`, true);
    }
  }

  function fillForm(item) {
    fields.id.value = item.id;
    fields.title.value = item.title;
    fields.eventType.value = item.event_type;
    fields.status.value = item.status;
    fields.priority.value = item.priority;
    fields.startsAt.value = toDateTimeLocal(item.starts_at);
    fields.endsAt.value = toDateTimeLocal(item.ends_at);
    fields.customerId.value = item.customer || '';
    fields.supplierId.value = item.supplier || '';
    fields.location.value = item.location || '';
    fields.reminderMinutes.value = item.reminder_minutes || 0;
    fields.allDay.checked = Boolean(item.all_day);
    fields.description.value = item.description || '';
    formTitle.textContent = `Editar evento #${item.id}`;
  }

  eventForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const id = fields.id.value;
      const payload = buildPayload();

      if (id) {
        await request(`${getApiBase()}/agenda-events/${id}/`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setFeedback('Evento actualizado correctamente.');
      } else {
        await request(`${getApiBase()}/agenda-events/`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback('Evento creado correctamente.');
      }

      resetForm();
      await loadEvents();
    } catch (error) {
      setFeedback(`No se pudo guardar el evento: ${error.message}`, true);
    }
  });

  cancelEditButton.addEventListener('click', resetForm);

  eventsBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const target = events.find((item) => item.id === id);

    if (!target) {
      return;
    }

    if (action === 'edit') {
      fillForm(target);
      return;
    }

    if (action === 'delete') {
      const shouldDelete = window.appAlerts?.confirm
        ? await window.appAlerts.confirm(`¿Desea eliminar el evento ${target.title}?`, 'Eliminar evento')
        : window.confirm(`¿Desea eliminar el evento ${target.title}?`);

      if (!shouldDelete) {
        return;
      }

      try {
        await request(`${getApiBase()}/agenda-events/${id}/`, { method: 'DELETE' });
        setFeedback('Evento eliminado correctamente.');
        await loadEvents();
      } catch (error) {
        setFeedback(`No se pudo eliminar: ${error.message}`, true);
      }
    }
  });

  searchInput.addEventListener('input', renderTable);
  statusFilter.addEventListener('change', renderTable);
  loadButton.addEventListener('click', loadEvents);

  Promise.all([loadEventTypes(), loadRelationOptions()])
    .then(() => {
      resetForm();
      return loadEvents();
    })
    .catch((error) => setFeedback(`Error inicial: ${error.message}`, true));
})();
