(function initAgendaModule() {
  const $ = (id) => document.getElementById(id);
  const BILLING_PREFILL_KEY = 'cr360.billing.prefill';
  const CREATE_PAGE_URL = '/agenda-crear.html';

  const searchInput = $('search');
  const statusFilter = $('status-filter');
  const serviceFilter = $('service-filter');
  const collaboratorFilter = $('collaborator-filter');
  const dateFromFilter = $('date-from-filter');
  const dateToFilter = $('date-to-filter');
  const loadButton = $('load-events');
  const eventsBody = $('events-body');
  const billingAlert = $('agenda-billing-alert');
  const feedback = $('feedback');
  const eventsPager = window.TablePaginator?.create({
    key: 'agenda-events',
    tableBody: eventsBody,
    totalColumns: 6,
    emptyMessage: 'No hay eventos para mostrar.',
    rowRenderer: renderEventRow,
  });

  const eventForm = $('event-form');
  const formTitle = $('form-title');
  const cancelEditButton = $('cancel-edit');

  const selfBookLinkInput = $('self-book-link');
  const openSelfBookLinkButton = $('open-self-book-link');
  const copySelfBookLinkButton = $('copy-self-book-link');
  const selfBookLinkFeedback = $('self-book-link-feedback');

  const fields = {
    id: $('event-id'),
    title: $('title'),
    eventType: $('event-type'),
    serviceId: $('service-id'),
    collaboratorId: $('collaborator-id'),
    status: $('status'),
    priority: $('priority'),
    startsAt: $('starts-at'),
    endsAt: $('ends-at'),
    customerId: $('customer-id'),
    supplierId: $('supplier-id'),
    location: $('location'),
    reminderMinutes: $('reminder-minutes'),
    allDay: $('all-day'),
    description: $('description'),
  };

  let events = [];
  let eventTypes = [];
  let services = [];
  let collaborators = [];
  let lastOverdueAlertCount = 0;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function isPastEvent(item) {
    const startsAt = new Date(item.starts_at);
    return !Number.isNaN(startsAt.getTime()) && startsAt < new Date();
  }

  function getEffectiveStatus(item) {
    return item.invoice && item.status === 'pending' ? 'done' : item.status;
  }

  function getEffectiveStatusLabel(item) {
    if (item.invoice && item.status === 'pending') {
      return 'Completado';
    }
    return item.status_display || item.status;
  }

  function isFinalStatus(item) {
    return ['done', 'cancelled'].includes(getEffectiveStatus(item));
  }

  function isOverdueUnbilled(item) {
    return Boolean(item.service) && getEffectiveStatus(item) !== 'cancelled' && !item.invoice && isPastEvent(item);
  }

  function renderStatus(item) {
    const label = getEffectiveStatusLabel(item);
    if (isOverdueUnbilled(item)) {
      return `
        <span class="agenda-status agenda-status--warning">Vencida sin factura</span>
        <span class="agenda-status-note">${escapeHtml(label)}</span>
      `;
    }
    return `<span class="agenda-status">${escapeHtml(label)}</span>`;
  }

  function renderEventRow(item) {
    const canInvoice = Boolean(item.service) && getEffectiveStatus(item) !== 'cancelled' && !item.invoice;
    const isUnbilledPast = isOverdueUnbilled(item);
    const canEdit = !isFinalStatus(item);
    return `
      <tr class="${isUnbilledPast ? 'agenda-row--overdue-unbilled' : ''}">
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(item.service_name || getServiceName(item.service))}</td>
        <td>${escapeHtml(item.collaborator_email || getCollaboratorName(item.collaborator))}</td>
        <td>${escapeHtml(formatDate(item.starts_at))}</td>
        <td>${renderStatus(item)}</td>
        <td>
          ${canEdit ? `<button class="btn btn-secondary" data-action="edit" data-id="${item.id}">Editar</button>` : ''}
          <button class="btn btn-secondary" data-action="delete" data-id="${item.id}">Eliminar</button>
          ${canInvoice ? `<button class="btn ${isUnbilledPast ? 'btn-primary' : 'btn-secondary'}" data-action="invoice" data-id="${item.id}">${isUnbilledPast ? 'Facturar ahora' : 'Facturar'}</button>` : ''}
          ${item.invoice ? `<button class="btn btn-secondary" data-action="view-invoice" data-id="${item.id}">Ver factura</button>` : ''}
        </td>
      </tr>
    `;
  }

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
    if (feedback) {
      feedback.textContent = message;
      feedback.style.color = isError ? '#ff7d7d' : 'var(--muted)';
    }
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
      let parsedError = '';
      try {
        const payload = JSON.parse(bodyText);
        if (payload.detail) parsedError = payload.detail;
        const firstKey = Object.keys(payload)[0];
        const firstValue = payload[firstKey];
        if (!parsedError && Array.isArray(firstValue)) parsedError = `${firstKey}: ${firstValue.join(', ')}`;
        if (!parsedError && typeof firstValue === 'string') parsedError = `${firstKey}: ${firstValue}`;
      } catch (_error) {
        parsedError = '';
      }
      throw new Error(parsedError || bodyText || 'Error inesperado del servidor.');
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

  function getServiceName(id) {
    return services.find((item) => item.id === Number(id))?.name || '-';
  }

  function getSelectedService() {
    return services.find((item) => item.id === Number(fields.serviceId?.value || 0)) || null;
  }

  function addMinutesToDateTimeLocal(value, minutes) {
    if (!value || !minutes) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const next = new Date(date.getTime() + Number(minutes) * 60000);
    const timezoneOffset = next.getTimezoneOffset() * 60000;
    return new Date(next.getTime() - timezoneOffset).toISOString().slice(0, 16);
  }

  function syncEndFromService() {
    if (!fields.startsAt || !fields.endsAt) return;
    const service = getSelectedService();
    const duration = Number(service?.service_duration_minutes || 0) || 30;
    if (!fields.startsAt.value || !service) return;
    fields.endsAt.value = addMinutesToDateTimeLocal(fields.startsAt.value, duration);
  }

  function getCollaboratorName(id) {
    return collaborators.find((item) => item.id === Number(id))?.email || '-';
  }

  function populateSelect(select, items, placeholder, labelFn) {
    if (!select) {
      return;
    }
    select.innerHTML = [`<option value="">${placeholder}</option>`]
      .concat(items.map((item) => `<option value="${item.id}">${labelFn(item)}</option>`))
      .join('');
  }

  function renderTable() {
    if (!eventsBody || !searchInput || !statusFilter || !serviceFilter || !collaboratorFilter) {
      return;
    }
    const term = searchInput.value.trim().toLowerCase();
    const selectedStatus = statusFilter.value;
    const selectedService = Number(serviceFilter.value || 0);
    const selectedCollaborator = Number(collaboratorFilter.value || 0);

    const filtered = events.filter((item) => {
      const matchText = `${item.title} ${item.description || ''}`.toLowerCase().includes(term);
      const effectiveStatus = getEffectiveStatus(item);
      const matchStatus = !selectedStatus
        || (selectedStatus === 'overdue_unbilled' ? isOverdueUnbilled(item) : selectedStatus === effectiveStatus);
      const matchService = !selectedService || Number(item.service) === selectedService;
      const matchCollaborator = !selectedCollaborator || Number(item.collaborator) === selectedCollaborator;
      return matchText && matchStatus && matchService && matchCollaborator;
    });

    if (eventsPager) {
      eventsPager.update(filtered);
      return;
    }

    eventsBody.innerHTML = filtered.map((item) => renderEventRow(item)).join('') || '<tr><td colspan="6">No hay eventos para mostrar.</td></tr>';
  }

  function renderBillingAlert() {
    if (!billingAlert) {
      return;
    }

    const overdueEvents = events.filter(isOverdueUnbilled);
    const count = overdueEvents.length;
    billingAlert.hidden = count === 0;

    if (!count) {
      billingAlert.innerHTML = '';
      lastOverdueAlertCount = 0;
      return;
    }

    const label = count === 1 ? '1 cita vencida sin facturar' : `${count} citas vencidas sin facturar`;
    billingAlert.innerHTML = `
      <strong>${escapeHtml(label)}</strong>
      <span>Revisa el filtro "Vencidas sin facturar" y usa "Facturar ahora" para cerrar el pendiente.</span>
    `;

    if (window.appAlerts?.toast && count !== lastOverdueAlertCount) {
      window.appAlerts.toast(label, 'warning');
    }
    lastOverdueAlertCount = count;
  }

  function persistBillingPrefill(target) {
    const payload = {
      source: 'agenda',
      organizationId: getOrganizationId(),
      eventId: target.id,
      customerId: target.customer || null,
      serviceId: target.service || null,
      title: target.title || '',
      startsAt: target.starts_at || '',
      collaboratorEmail: target.collaborator_email || getCollaboratorName(target.collaborator),
      notes: [
        `Facturación generada desde Agenda.`,
        target.title ? `Evento: ${target.title}` : '',
        target.starts_at ? `Fecha cita: ${formatDate(target.starts_at)}` : '',
        target.collaborator_email ? `Colaborador: ${target.collaborator_email}` : '',
      ].filter(Boolean).join(' '),
    };
    sessionStorage.setItem(BILLING_PREFILL_KEY, JSON.stringify(payload));
  }

  async function ensureDefaultEventTypes() {
    if (eventTypes.length > 0) {
      return;
    }

    const defaults = [
      { code: 'cita', name: 'Cita', color: '#2563eb' },
      { code: 'reunion', name: 'Reunión', color: '#16a34a' },
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
    if (fields.eventType) {
      fields.eventType.innerHTML = eventTypes.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
    }

    if (!eventTypes.length) {
      throw new Error('No hay tipos de evento configurados.');
    }
  }

  async function loadServicesAndCollaborators() {
    const organizationId = getOrganizationId();
    const [products, collaboratorRows] = await Promise.all([
      request(`${getApiBase()}/products/?organization_id=${organizationId}`).catch(() => []),
      request(`${getApiBase()}/agenda-events/collaborators/?organization_id=${organizationId}`).catch(() => []),
    ]);

    services = products.filter((item) => item.product_type === 'service' && item.is_active !== false);
    collaborators = collaboratorRows;

    populateSelect(fields.serviceId, services, 'Seleccione servicio', (item) => item.name);
    populateSelect(serviceFilter, services, 'Todos los servicios', (item) => item.name);

    populateSelect(fields.collaboratorId, collaborators, 'Seleccione colaborador', (item) => item.email);
    populateSelect(collaboratorFilter, collaborators, 'Todos los colaboradores', (item) => item.email);
  }

  async function loadRelationOptions() {
    if (!fields.customerId || !fields.supplierId) {
      return;
    }
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
    if (!eventForm) {
      return;
    }
    eventForm.reset();
    fields.id.value = '';
    fields.reminderMinutes.value = '30';
    fields.status.value = 'pending';
    fields.priority.value = 'medium';
    formTitle.textContent = 'Nueva cita';
  }

  function validateFormPayload(payload) {
    if (!payload.title || payload.title.length < 3) {
      throw new Error('El título debe tener al menos 3 caracteres.');
    }
    if (!payload.service || !payload.collaborator) {
      throw new Error('Debes seleccionar servicio y colaborador para evitar agendas ambiguas.');
    }
    if (!fields.startsAt.value || !fields.endsAt.value) {
      throw new Error('Debes indicar inicio y fin de la cita.');
    }
    if (payload.ends_at <= payload.starts_at) {
      throw new Error('La hora de fin debe ser mayor a la hora de inicio.');
    }
    if (payload.status === 'pending' && new Date(payload.starts_at) < new Date()) {
      throw new Error('No se pueden crear citas pendientes en el pasado.');
    }
    if (payload.customer && payload.supplier) {
      throw new Error('Relaciona la cita con cliente o proveedor, no con ambos.');
    }
    if (payload.reminder_minutes > 1440) {
      throw new Error('El recordatorio no puede superar 1440 minutos.');
    }
  }

  function buildPayload() {
    syncEndFromService();
    const payload = {
      organization: getOrganizationId(),
      event_type: Number(fields.eventType.value),
      service: fields.serviceId.value ? Number(fields.serviceId.value) : null,
      collaborator: fields.collaboratorId.value ? Number(fields.collaboratorId.value) : null,
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

    validateFormPayload(payload);
    return payload;
  }

  async function validateBackendAvailability(payload) {
    const startValue = fields.startsAt.value;
    const endValue = fields.endsAt.value;
    const params = new URLSearchParams({
      organization_id: String(payload.organization),
      collaborator_id: String(payload.collaborator),
      service_id: String(payload.service),
      date: startValue.slice(0, 10),
      start_time: startValue.slice(11, 16),
      end_time: endValue.slice(11, 16),
    });
    if (fields.id.value) {
      params.set('exclude_event_id', fields.id.value);
    }
    const result = await request(`${getApiBase()}/agenda-events/availability/?${params.toString()}`);
    if (!result.slot_available) {
      throw new Error(result.slot_message || 'Ese espacio no está disponible.');
    }
  }

  function buildSelfBookingLink() {
    const organizationId = getOrganizationId();
    const query = new URLSearchParams({ organization_id: String(organizationId) });
    return `${window.location.origin}/self-booking.html?${query.toString()}`;
  }

  function renderSelfBookingLink() {
    if (!selfBookLinkInput || !selfBookLinkFeedback) {
      return;
    }
    try {
      const link = buildSelfBookingLink();
      selfBookLinkInput.value = link;
      selfBookLinkFeedback.textContent = 'Este link es único por organización y abre un portal exclusivo para agendar.';
    } catch (error) {
      selfBookLinkInput.value = '';
      selfBookLinkFeedback.textContent = error.message;
    }
  }

  async function loadEvents() {
    if (!statusFilter || !serviceFilter || !collaboratorFilter || !searchInput || !dateFromFilter || !dateToFilter) {
      return;
    }
    try {
      const organizationId = getOrganizationId();
      const params = new URLSearchParams({ organization_id: organizationId });
      if (statusFilter.value && statusFilter.value !== 'overdue_unbilled') params.set('status', statusFilter.value);
      if (serviceFilter.value) params.set('service_id', serviceFilter.value);
      if (collaboratorFilter.value) params.set('collaborator_id', collaboratorFilter.value);
      if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
      if (dateFromFilter.value) params.set('date_from', `${dateFromFilter.value}T00:00:00`);
      if (dateToFilter.value) params.set('date_to', `${dateToFilter.value}T23:59:59`);

      events = await request(`${getApiBase()}/agenda-events/?${params.toString()}`);
      renderBillingAlert();
      renderTable();
    } catch (error) {
      setFeedback(`Error al cargar agenda: ${error.message}`, true);
    }
  }

  function fillForm(item) {
    if (!eventForm) {
      return;
    }
    fields.id.value = item.id;
    fields.title.value = item.title;
    fields.eventType.value = item.event_type;
    fields.serviceId.value = item.service || '';
    fields.collaboratorId.value = item.collaborator || '';
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

  async function loadEventForEdit(eventId) {
    if (!eventId || !eventForm) {
      return;
    }
    const item = await request(`${getApiBase()}/agenda-events/${eventId}/?organization_id=${getOrganizationId()}`);
    fillForm(item);
  }

  eventForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const id = fields.id.value;
      const payload = buildPayload();
      await validateBackendAvailability(payload);

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
      if (eventsBody) {
        await loadEvents();
      }
    } catch (error) {
      setFeedback(`No se pudo guardar el evento: ${error.message}`, true);
    }
  });

  cancelEditButton?.addEventListener('click', resetForm);

  eventsBody?.addEventListener('click', async (event) => {
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
      if (eventForm) {
        fillForm(target);
      } else {
        window.location.href = `${CREATE_PAGE_URL}?event_id=${target.id}`;
      }
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

    if (action === 'invoice') {
      persistBillingPrefill(target);
      window.location.href = '/facturacion.html';
      return;
    }

    if (action === 'view-invoice' && target.invoice) {
      window.location.href = `/facturas.html?invoice_id=${target.invoice}`;
    }
  });

  searchInput?.addEventListener('input', renderTable);
  statusFilter?.addEventListener('change', loadEvents);
  serviceFilter?.addEventListener('change', loadEvents);
  collaboratorFilter?.addEventListener('change', loadEvents);
  dateFromFilter?.addEventListener('change', loadEvents);
  dateToFilter?.addEventListener('change', loadEvents);
  loadButton?.addEventListener('click', loadEvents);
  fields.serviceId?.addEventListener('change', syncEndFromService);
  fields.startsAt?.addEventListener('change', syncEndFromService);
  fields.endsAt?.setAttribute('readonly', 'readonly');

  openSelfBookLinkButton?.addEventListener('click', () => {
    if (selfBookLinkInput.value) {
      window.open(selfBookLinkInput.value, '_blank', 'noopener,noreferrer');
    }
  });

  copySelfBookLinkButton?.addEventListener('click', async () => {
    if (!selfBookLinkInput.value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(selfBookLinkInput.value);
      selfBookLinkFeedback.textContent = 'Link copiado al portapapeles.';
    } catch (_error) {
      selfBookLinkFeedback.textContent = 'No se pudo copiar automáticamente. Copia el link manualmente.';
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target?.id === 'organization-switcher') {
      renderSelfBookingLink();
    }
  });

  const startupTasks = [loadServicesAndCollaborators()];
  if (eventForm) {
    startupTasks.push(loadEventTypes(), loadRelationOptions());
  }

  Promise.all(startupTasks)
    .then(() => {
      const requestedEventId = Number(new URLSearchParams(window.location.search).get('event_id') || 0);
      if (eventForm) {
        resetForm();
        renderSelfBookingLink();
      }
      const followUps = [];
      if (eventsBody) {
        followUps.push(loadEvents());
      }
      if (requestedEventId) {
        followUps.push(loadEventForEdit(requestedEventId));
      }
      return Promise.all(followUps);
    })
    .catch((error) => setFeedback(`Error inicial: ${error.message}`, true));
})();
