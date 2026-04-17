(function initCustomersModule() {
  const API_BASE = '/api';
  const SESSION_KEY = 'cr360.session';
  const organizationIdInput = document.getElementById('organization-id');
  const searchInput = document.getElementById('search');
  const customersBody = document.getElementById('customers-body');
  const feedback = document.getElementById('feedback');
  const customerForm = document.getElementById('customer-form');
  const editModal = document.getElementById('customer-edit-modal');
  const editForm = document.getElementById('customer-edit-form');
  const editCloseButton = document.getElementById('customer-edit-close');
  const editCancelButton = document.getElementById('customer-edit-cancel');

  const customersPager = window.TablePaginator?.create({
    key: 'customers',
    tableBody: customersBody,
    totalColumns: 5,
    emptyMessage: 'No hay clientes para mostrar.',
    rowRenderer: renderCustomerRow,
  });

  const createFields = createFieldRefs('');
  const editFields = createFieldRefs('edit-');
  const createLabels = createLabelRefs('');
  const editLabels = createLabelRefs('edit-');

  let customers = [];
  let customerTypes = [];
  let organizations = [];
  let customersLoaded = false;
  let createTypingTimer = null;
  let editTypingTimer = null;

  function createFieldRefs(prefix) {
    return {
      id: document.getElementById(`${prefix}customer-id`) || document.getElementById(`${prefix}id`) || document.getElementById(`${prefix}customer-id`),
      type: document.getElementById(`${prefix}customer-type`),
      code: document.getElementById(`${prefix}code`),
      legalName: document.getElementById(`${prefix}legal-name`),
      tradeName: document.getElementById(`${prefix}trade-name`),
      taxId: document.getElementById(`${prefix}tax-id`),
      status: document.getElementById(`${prefix}status`),
      email: document.getElementById(`${prefix}email`),
      phone: document.getElementById(`${prefix}phone`),
      creditLimit: document.getElementById(`${prefix}credit-limit`),
      paymentTermsDays: document.getElementById(`${prefix}payment-terms-days`),
      notes: document.getElementById(`${prefix}notes`),
    };
  }

  function createLabelRefs(prefix) {
    return {
      legalNameLabel: document.getElementById(`${prefix}legal-name-label`),
      taxIdLabel: document.getElementById(`${prefix}tax-id-label`),
      tradeNameWrapper: document.getElementById(`${prefix}trade-name-wrapper`),
    };
  }

  function renderCustomerRow(item) {
    const typeCode = getTypeCode(item.customer_type) || '-';
    return `
      <tr>
        <td>${escapeHtml(item.code)}</td>
        <td>${escapeHtml(formatCustomerType(typeCode))}</td>
        <td>${escapeHtml(item.legal_name)}</td>
        <td><span class="status status-${item.status}">${escapeHtml(formatCustomerStatus(item.status))}</span></td>
        <td>
          <button class="btn btn-secondary" data-action="edit" data-id="${item.id}">Editar</button>
          <button class="btn btn-secondary" data-action="delete" data-id="${item.id}">Eliminar</button>
        </td>
      </tr>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function getActiveOrganizationFromSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
      return Number(session?.active_organization_id) || null;
    } catch (_error) {
      return null;
    }
  }

  function logInfo(message, payload) {
    console.info(`[Clientes] ${message}`, payload || '');
  }

  function logError(message, payload) {
    console.error(`[Clientes] ${message}`, payload || '');
  }

  function normalizeApiBase(rawBase) {
    let base = (rawBase || API_BASE).trim();
    if (!base.startsWith('http') && !base.startsWith('/')) base = `/${base}`;
    base = base.replace(/\/+$/, '');
    base = base.replace(/\/(customer-types|customers|customer-contacts|customer-addresses)(\/.*)?$/i, '');
    if (!/\/api$/i.test(base)) base = `${base}/api`;
    return base;
  }

  function getApiBase() {
    return normalizeApiBase(API_BASE);
  }

  function apiUrl(path) {
    return `${getApiBase()}${path}`;
  }

  function getOrganizationId() {
    const organizationId = Number(organizationIdInput?.value);
    if (!organizationId || organizationId < 1) {
      throw new Error('Debe indicar una organización válida.');
    }
    const exists = organizations.some((item) => item.id === organizationId);
    if (!exists) {
      const available = organizations.map((item) => item.id).join(', ') || 'ninguna';
      throw new Error(`La organización ${organizationId} no existe. IDs disponibles: ${available}.`);
    }
    return organizationId;
  }

  function renderOrganizations() {
    if (!organizationIdInput) return;
    if (!organizations.length) {
      organizationIdInput.innerHTML = '<option value="">Sin organizaciones</option>';
      return;
    }
    organizationIdInput.innerHTML = organizations.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (#${item.id})</option>`).join('');
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

  function toFriendlyFieldName(field) {
    const labels = { email: 'Correo', phone: 'Teléfono' };
    return labels[field] || field;
  }

  function formatApiError(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (payload.detail) return payload.detail;
    return Object.entries(payload)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([field, value]) => `${toFriendlyFieldName(field)}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' | ');
  }

  function nextCustomerCodeFallback() {
    const numbers = customers
      .map((item) => {
        const match = String(item.code || '').trim().toUpperCase().match(/^C(\d+)$/);
        return match ? Number(match[1]) : NaN;
      })
      .filter((value) => Number.isFinite(value) && value > 0);
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `C${String(next).padStart(6, '0')}`;
  }

  async function refreshCreateCode() {
    if (!customerForm || !createFields.code) return;

    try {
      const organizationId = getOrganizationId();
      const data = await request(apiUrl(`/customers/next-code/?organization_id=${organizationId}`));
      createFields.code.value = data?.code || nextCustomerCodeFallback();
    } catch (_error) {
      createFields.code.value = nextCustomerCodeFallback();
    }
  }

  function getTypeCode(typeId) {
    const type = customerTypes.find((item) => item.id === Number(typeId));
    return type?.code || '';
  }

  function syncFormLabels(fields, labels) {
    if (!fields?.type || !labels.legalNameLabel || !labels.taxIdLabel || !labels.tradeNameWrapper) return;
    const code = getTypeCode(fields.type.value);
    const isLegal = code !== 'fisico';
    labels.legalNameLabel.firstChild.textContent = isLegal ? 'Razón social' : 'Nombre completo';
    labels.taxIdLabel.firstChild.textContent = isLegal ? 'Cédula jurídica' : 'Cédula física';
    labels.tradeNameWrapper.style.display = isLegal ? 'grid' : 'none';
  }

  function isPhysicalCustomer(fields) {
    return getTypeCode(fields.type?.value) === 'fisico';
  }

  function isLegalCustomer(fields) {
    return !isPhysicalCustomer(fields);
  }

  function findCustomerByTaxId(taxId) {
    const normalizedTaxId = window.CedulaPadron?.normalizeCedula(taxId) || String(taxId || '').replace(/\D/g, '');
    if (!normalizedTaxId) return null;
    return (
      customers.find((customer) => {
        const customerTaxId = window.CedulaPadron?.normalizeCedula(customer.tax_id) || String(customer.tax_id || '').replace(/\D/g, '');
        return customerTaxId === normalizedTaxId;
      }) || null
    );
  }

  async function syncCustomerNameFromPadron(fields) {
    if (!window.CedulaPadron || !isPhysicalCustomer(fields)) return;
    const taxId = fields.taxId.value.trim();
    if (!taxId) return;
    const normalizedTaxId = window.CedulaPadron.normalizeCedula(taxId);
    if (normalizedTaxId.length < 9) return;

    logInfo('Iniciando validación de cédula en padrón.', {
      taxId,
      normalizedTaxId,
      currentLegalName: fields.legalName.value.trim(),
    });

    try {
      const record = await window.CedulaPadron.resolveByCedula(taxId);
      if (!record) {
        const existingCustomer = findCustomerByTaxId(taxId);
        if (existingCustomer?.legal_name && !fields.legalName.value.trim()) {
          fields.legalName.value = existingCustomer.legal_name;
          setFeedback(`Nombre recuperado desde clientes registrados para la cédula ${taxId}.`);
          return;
        }
        setFeedback(`La cédula ${taxId} no existe en el padrón electoral.`, true);
        return;
      }

      if (!fields.legalName.value.trim()) {
        fields.legalName.value = record.fullName;
        setFeedback(`Nombre autocompletado desde padrón para la cédula ${taxId}.`);
        return;
      }

      const isSameName = window.CedulaPadron.compareName(fields.legalName.value, record);
      if (isSameName === false) {
        setFeedback(`La cédula ${taxId} corresponde a "${record.fullName}". Verifica el nombre ingresado.`, true);
      }
    } catch (error) {
      logError('Error validando cédula contra padrón.', { taxId: normalizedTaxId, message: error?.message || error });
      setFeedback('No se pudo validar la cédula en este momento. Revisa la consola para más detalle.', true);
    }
  }

  async function syncCustomerNameFromTaxRegistry(fields) {
    if (!isLegalCustomer(fields)) return;
    const normalizedTaxId = String(fields.taxId.value || '').replace(/\D/g, '');
    if (normalizedTaxId.length !== 10) return;

    try {
      const record = await request(apiUrl(`/customers/tax-registry/?tax_id=${normalizedTaxId}`));
      if (!record) return;
      if (!fields.legalName.value.trim()) {
        fields.legalName.value = record.nombre || '';
      }
      const status = record?.situacion?.estado || 'Sin estado';
      const administration = record?.situacion?.administracionTributaria || 'Sin administración';
      setFeedback(`Razón social validada en Hacienda. Estado: ${status}. Administración: ${administration}.`);
    } catch (error) {
      logInfo('No se pudo consultar Hacienda para cliente jurídico.', { taxId: normalizedTaxId, detail: error?.message || error });
    }
  }

  async function request(url, options) {
    const method = options?.method || 'GET';
    logInfo(`Request ${method} ${url}`);
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      credentials: 'include',
      ...options,
    });
    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();

    logInfo(`Response ${response.status} ${method} ${url}`, { contentType, preview: bodyText.slice(0, 180) });

    if (!response.ok) {
      if (contentType.includes('application/json')) {
        let detail = bodyText;
        try {
          detail = formatApiError(JSON.parse(bodyText)) || bodyText;
        } catch (_error) {
          detail = bodyText;
        }
        throw new Error(detail || 'Error inesperado del servidor.');
      }
      if (bodyText.startsWith('<!doctype html') || bodyText.startsWith('<html')) {
        throw new Error('La respuesta no es JSON. Verifica la configuración del proxy o backend.');
      }
      throw new Error(bodyText || 'Error inesperado del servidor.');
    }

    if (response.status === 204 || !bodyText) return null;
    if (!contentType.includes('application/json')) {
      throw new Error('El endpoint respondió contenido no JSON.');
    }
    return JSON.parse(bodyText);
  }

  function populateTypeSelect(select) {
    if (!select) return;
    select.innerHTML = customerTypes.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  }

  function resetCreateForm() {
    if (!customerForm) return;
    customerForm.reset();
    createFields.code.value = '';
    createFields.creditLimit.value = '0';
    createFields.paymentTermsDays.value = '0';
    syncFormLabels(createFields, createLabels);
  }

  function resetEditForm() {
    if (!editForm) return;
    editForm.reset();
    if (editFields.id) editFields.id.value = '';
    syncFormLabels(editFields, editLabels);
  }

  function buildPayload(fields) {
    const typeCode = getTypeCode(fields.type.value);
    const isLegal = typeCode !== 'fisico';
    return {
      organization: getOrganizationId(),
      customer_type: Number(fields.type.value),
      legal_name: fields.legalName.value.trim(),
      trade_name: isLegal ? fields.tradeName.value.trim() : '',
      tax_id: fields.taxId.value.trim(),
      status: fields.status.value,
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      credit_limit: Number(fields.creditLimit.value || 0),
      payment_terms_days: Number(fields.paymentTermsDays.value || 0),
      notes: fields.notes.value.trim(),
    };
  }

  async function ensureDefaultCustomerTypes() {
    const defaults = [
      { code: 'fisico', name: 'Persona física' },
      { code: 'juridico', name: 'Persona jurídica' },
    ];
    for (const item of defaults) {
      try {
        await request(apiUrl('/customer-types/'), { method: 'POST', body: JSON.stringify(item) });
      } catch (error) {
        logInfo('Tipo de cliente ya existente o no se pudo crear automáticamente', { item, detail: error.message });
      }
    }
  }

  async function loadOrganizations() {
    organizations = await request(apiUrl('/organizations/'));
    if (!organizations.length) {
      renderOrganizations();
      setFeedback('No hay organizaciones disponibles. Créala desde Configuración > Mantenimiento de organizaciones.', true);
      return;
    }

    renderOrganizations();
    const current = Number(organizationIdInput?.value);
    const preferred = getActiveOrganizationFromSession();
    const selectedId = organizations.some((item) => item.id === preferred)
      ? preferred
      : organizations.some((item) => item.id === current)
        ? current
        : organizations[0].id;

    if (organizationIdInput && selectedId !== current) {
      organizationIdInput.value = String(selectedId);
      const selectedOrganization = organizations.find((item) => item.id === selectedId);
      setFeedback(`Se ajustó organización a ${selectedId} (${selectedOrganization?.name || 'N/D'}).`);
    }
  }

  function formatCustomerType(typeCode) {
    if (typeCode === 'fisico') return 'Persona física';
    if (typeCode === 'juridico') return 'Persona jurídica';
    return typeCode || '-';
  }

  function formatCustomerStatus(status) {
    const labels = { active: 'Activo', inactive: 'Inactivo', blocked: 'Bloqueado' };
    return labels[status] || status || '-';
  }

  function renderTable() {
    if (!customersBody || !searchInput) return;
    const term = searchInput.value.trim().toLowerCase();
    const filtered = customers.filter((item) => `${item.code} ${item.legal_name} ${item.email || ''}`.toLowerCase().includes(term));
    if (customersPager) {
      customersPager.update(filtered);
      return;
    }
    customersBody.innerHTML = filtered.map((item) => renderCustomerRow(item)).join('') || '<tr><td colspan="5">No hay clientes para mostrar.</td></tr>';
  }

  async function loadCustomerTypes() {
    customerTypes = await request(apiUrl('/customer-types/'));
    if (!customerTypes.length) {
      await ensureDefaultCustomerTypes();
      customerTypes = await request(apiUrl('/customer-types/'));
    }
    if (!customerTypes.length) {
      throw new Error('No hay tipos de cliente configurados y no se pudieron crear automáticamente.');
    }
    populateTypeSelect(createFields.type);
    populateTypeSelect(editFields.type);
    syncFormLabels(createFields, createLabels);
    syncFormLabels(editFields, editLabels);
  }

  async function loadCustomers() {
    try {
      const organizationId = getOrganizationId();
      const data = await request(apiUrl(`/customers/?organization_id=${organizationId}`));
      customers = Array.isArray(data) ? data : [];
      renderTable();
      await refreshCreateCode();
      customersLoaded = true;
    } catch (error) {
      logError('Error al cargar clientes', error.message);
      customersLoaded = false;
      setFeedback(`Error al cargar clientes: ${error.message}`, true);
    }
  }

  function fillEditForm(customer) {
    if (!editForm) return;
    editFields.id.value = customer.id;
    editFields.type.value = String(customer.customer_type);
    syncFormLabels(editFields, editLabels);
    editFields.code.value = customer.code;
    editFields.legalName.value = customer.legal_name;
    editFields.tradeName.value = customer.trade_name || '';
    editFields.taxId.value = customer.tax_id || '';
    editFields.status.value = customer.status;
    editFields.email.value = customer.email || '';
    editFields.phone.value = customer.phone || '';
    editFields.creditLimit.value = customer.credit_limit;
    editFields.paymentTermsDays.value = customer.payment_terms_days;
    editFields.notes.value = customer.notes || '';
  }

  function openEditModal(customer) {
    if (!editModal || !editForm || !customer) return;
    fillEditForm(customer);
    editModal.classList.remove('hidden');
    editModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeEditModal() {
    if (!editModal) return;
    editModal.classList.add('hidden');
    editModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    resetEditForm();
  }

  async function saveCustomer(fields, isEdit) {
    await syncCustomerNameFromPadron(fields);
    await syncCustomerNameFromTaxRegistry(fields);
    const payload = buildPayload(fields);
    const id = fields.id?.value;

    if (isEdit) {
      await request(apiUrl(`/customers/${id}/`), { method: 'PUT', body: JSON.stringify(payload) });
      setFeedback('Cliente actualizado correctamente.');
    } else {
      await request(apiUrl('/customers/'), { method: 'POST', body: JSON.stringify(payload) });
      setFeedback('Cliente creado correctamente.');
    }
  }

  function registerPadronListeners(fields, labels, timerName) {
    fields.type?.addEventListener('change', () => {
      syncFormLabels(fields, labels);
      syncCustomerNameFromPadron(fields).catch(() => null);
      syncCustomerNameFromTaxRegistry(fields).catch(() => null);
    });

    fields.taxId?.addEventListener('blur', () => {
      syncCustomerNameFromPadron(fields).catch(() => null);
      syncCustomerNameFromTaxRegistry(fields).catch(() => null);
    });

    fields.taxId?.addEventListener('input', () => {
      const normalizedTaxId = window.CedulaPadron?.normalizeCedula(fields.taxId.value) || fields.taxId.value.replace(/\D/g, '');
      if (timerName === 'create' && createTypingTimer) clearTimeout(createTypingTimer);
      if (timerName === 'edit' && editTypingTimer) clearTimeout(editTypingTimer);

      if (!normalizedTaxId && isPhysicalCustomer(fields)) {
        fields.legalName.value = '';
        return;
      }

      const timer = setTimeout(() => {
        syncCustomerNameFromPadron(fields).catch(() => null);
        syncCustomerNameFromTaxRegistry(fields).catch(() => null);
      }, 250);

      if (timerName === 'create') createTypingTimer = timer;
      if (timerName === 'edit') editTypingTimer = timer;
    });
  }

  customerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveCustomer(createFields, false);
      resetCreateForm();
      await loadCustomers();
    } catch (error) {
      logError('No se pudo guardar cliente', error.message);
      setFeedback(`No se pudo guardar: ${error.message}`, true);
    }
  });

  editForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveCustomer(editFields, true);
      closeEditModal();
      await loadCustomers();
    } catch (error) {
      logError('No se pudo actualizar cliente', error.message);
      setFeedback(`No se pudo guardar: ${error.message}`, true);
    }
  });

  editCloseButton?.addEventListener('click', closeEditModal);
  editCancelButton?.addEventListener('click', closeEditModal);
  editModal?.addEventListener('click', (event) => {
    if (event.target === editModal) closeEditModal();
  });

  customersBody?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const target = customers.find((item) => item.id === id);
    if (!target) return;

    if (action === 'edit') {
      openEditModal(target);
      return;
    }

    if (action === 'delete') {
      const shouldDelete = window.appAlerts?.confirm
        ? await window.appAlerts.confirm(`¿Desea eliminar al cliente ${target.legal_name}?`, 'Eliminar cliente')
        : window.confirm(`¿Desea eliminar al cliente ${target.legal_name}?`);
      if (!shouldDelete) return;

      try {
        await request(apiUrl(`/customers/${id}/`), { method: 'DELETE' });
        setFeedback('Cliente eliminado correctamente.');
        await loadCustomers();
      } catch (error) {
        logError('No se pudo eliminar cliente', error.message);
        setFeedback(`No se pudo eliminar: ${error.message}`, true);
      }
    }
  });

  searchInput?.addEventListener('input', renderTable);
  organizationIdInput?.addEventListener('change', loadCustomers);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && editModal && !editModal.classList.contains('hidden')) {
      closeEditModal();
    }
  });
  window.addEventListener('focus', () => {
    if (!customersLoaded) return;
    loadCustomers();
  });

  registerPadronListeners(createFields, createLabels, 'create');
  registerPadronListeners(editFields, editLabels, 'edit');

  logInfo('Inicializando módulo clientes', { apiBase: getApiBase(), organizationId: organizationIdInput?.value });

  loadOrganizations()
    .then(loadCustomerTypes)
    .then(() => {
      resetCreateForm();
      resetEditForm();
      return loadCustomers();
    })
    .catch((error) => {
      logError('Error inicial módulo clientes', error.message);
      setFeedback(`Error inicial: ${error.message}`, true);
    });
})();
