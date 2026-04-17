(function initCustomersModule() {
  const API_BASE = '/api';
  const organizationIdInput = document.getElementById('organization-id');
  const searchInput = document.getElementById('search');
  const customersBody = document.getElementById('customers-body');
  const feedback = document.getElementById('feedback');

  const customerForm = document.getElementById('customer-form');
  const formTitle = document.getElementById('form-title');
  const cancelEditButton = document.getElementById('cancel-edit');

  const legalNameLabel = document.getElementById('legal-name-label');
  const taxIdLabel = document.getElementById('tax-id-label');
  const tradeNameWrapper = document.getElementById('trade-name-wrapper');
  const customersPager = window.TablePaginator?.create({
    key: 'customers',
    tableBody: customersBody,
    totalColumns: 5,
    emptyMessage: 'No hay clientes para mostrar.',
    rowRenderer: renderCustomerRow,
  });

  const fields = {
    id: document.getElementById('customer-id'),
    type: document.getElementById('customer-type'),
    code: document.getElementById('code'),
    legalName: document.getElementById('legal-name'),
    tradeName: document.getElementById('trade-name'),
    taxId: document.getElementById('tax-id'),
    status: document.getElementById('status'),
    email: document.getElementById('email'),
    phone: document.getElementById('phone'),
    creditLimit: document.getElementById('credit-limit'),
    paymentTermsDays: document.getElementById('payment-terms-days'),
    notes: document.getElementById('notes'),
  };

  let customers = [];
  let customerTypes = [];
  let organizations = [];
  let customersLoaded = false;
  let padronTypingTimer = null;
  const SESSION_KEY = 'cr360.session';
  const EDIT_SESSION_KEY = 'cr360.customers.edit-id';

  function renderCustomerRow(item) {
    const typeCode = getTypeCode(item.customer_type) || '-';
    return `
      <tr>
        <td>${item.code}</td>
        <td>${formatCustomerType(typeCode)}</td>
        <td>${item.legal_name}</td>
        <td><span class="status status-${item.status}">${formatCustomerStatus(item.status)}</span></td>
        <td>
          <button class="btn btn-secondary" data-action="edit" data-id="${item.id}">Editar</button>
          <button class="btn btn-secondary" data-action="delete" data-id="${item.id}">Eliminar</button>
        </td>
      </tr>
    `;
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

    if (!base.startsWith('http') && !base.startsWith('/')) {
      base = `/${base}`;
    }

    base = base.replace(/\/+$/, '');

    // Si el usuario pega una ruta de recurso, regresamos al root API.
    base = base.replace(/\/(customer-types|customers|customer-contacts|customer-addresses)(\/.*)?$/i, '');

    if (!/\/api$/i.test(base)) {
      base = `${base}/api`;
    }

    return base;
  }

  function getApiBase() {
    return normalizeApiBase(API_BASE);
  }

  function apiUrl(path) {
    return `${getApiBase()}${path}`;
  }

  function getOrganizationId() {
    const organizationId = Number(organizationIdInput.value);
    if (!organizationId || organizationId < 1) {
      throw new Error('Debe indicar un organization_id válido.');
    }
    const exists = organizations.some((item) => item.id === organizationId);
    if (!exists) {
      const available = organizations.map((item) => item.id).join(', ') || 'ninguna';
      throw new Error(`La organización ${organizationId} no existe. IDs disponibles: ${available}.`);
    }
    return organizationId;
  }

  function renderOrganizations() {
    if (!organizations.length) {
      organizationIdInput.innerHTML = '<option value="">Sin organizaciones</option>';
      return;
    }

    organizationIdInput.innerHTML = organizations
      .map((item) => `<option value="${item.id}">${item.name} (#${item.id})</option>`)
      .join('');
  }

  function setFeedback(message, isError) {
    feedback.textContent = message;
    feedback.style.color = isError ? '#ff7d7d' : 'var(--muted)';
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(message, isError ? 'error' : 'success');
    }
  }

  function toFriendlyFieldName(field) {
    const labels = {
      email: 'Correo',
      phone: 'Teléfono',
    };
    return labels[field] || field;
  }

  function formatApiError(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (payload.detail) return payload.detail;

    const entries = Object.entries(payload)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([field, value]) => {
        const messages = Array.isArray(value) ? value.join(', ') : String(value);
        return `${toFriendlyFieldName(field)}: ${messages}`;
      });

    return entries.join(' | ');
  }

  function nextCustomerCode() {
    const numbers = customers
      .map((item) => Number(String(item.code || '').replace(/\D/g, '')))
      .filter((value) => Number.isFinite(value) && value > 0);
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `C${String(next).padStart(6, '0')}`;
  }

  function getTypeCode(typeId) {
    const type = customerTypes.find((item) => item.id === Number(typeId));
    return type?.code || '';
  }

  function syncFormLabelsFromType(typeId) {
    if (!legalNameLabel || !taxIdLabel || !tradeNameWrapper) {
      return;
    }
    const code = getTypeCode(typeId);
    const isLegal = code !== 'fisico';
    legalNameLabel.firstChild.textContent = isLegal ? 'Razón social' : 'Nombre completo';
    taxIdLabel.firstChild.textContent = isLegal ? 'Cédula jurídica' : 'Cédula física';
    tradeNameWrapper.style.display = isLegal ? 'grid' : 'none';
  }

  function isPhysicalCustomer() {
    return getTypeCode(fields.type?.value) === 'fisico';
  }

  function isLegalCustomer() {
    return !isPhysicalCustomer();
  }

  function findCustomerByTaxId(taxId) {
    const normalizedTaxId = window.CedulaPadron?.normalizeCedula(taxId) || String(taxId || '').replace(/\D/g, '');
    if (!normalizedTaxId) return null;
    return customers.find((customer) => {
      const customerTaxId = window.CedulaPadron?.normalizeCedula(customer.tax_id) || String(customer.tax_id || '').replace(/\D/g, '');
      return customerTaxId === normalizedTaxId;
    }) || null;
  }

  async function syncCustomerNameFromPadron() {
    if (!window.CedulaPadron || !isPhysicalCustomer()) {
      return;
    }

    const taxId = fields.taxId.value.trim();
    if (!taxId) {
      return;
    }
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
        logInfo('No hubo coincidencia en padrón. Intentando fallback con clientes locales.', {
          taxId: normalizedTaxId,
          customersLoaded: customers.length,
        });
        const existingCustomer = findCustomerByTaxId(taxId);
        if (existingCustomer?.legal_name && !fields.legalName.value.trim()) {
          fields.legalName.value = existingCustomer.legal_name;
          logInfo('Nombre recuperado desde cliente local.', {
            customerId: existingCustomer.id,
            legalName: existingCustomer.legal_name,
          });
          setFeedback(`Nombre recuperado desde clientes registrados para la cédula ${taxId}.`);
          return;
        }
        setFeedback(`La cédula ${taxId} no existe en el padrón electoral.`, true);
        return;
      }

      logInfo('Coincidencia encontrada en padrón.', {
        taxId: normalizedTaxId,
        fullName: record.fullName,
      });
      if (!fields.legalName.value.trim()) {
        fields.legalName.value = record.fullName;
        setFeedback(`Nombre autocompletado desde padrón para la cédula ${taxId}.`);
        return;
      }

      const isSameName = window.CedulaPadron.compareName(fields.legalName.value, record);
      if (isSameName === false) {
        logInfo('Nombre ingresado no coincide con padrón.', {
          taxId: normalizedTaxId,
          enteredName: fields.legalName.value,
          padronName: record.fullName,
        });
        setFeedback(`La cédula ${taxId} corresponde a "${record.fullName}". Verifica el nombre ingresado.`, true);
      }
    } catch (error) {
      logError('Error validando cédula contra padrón.', {
        taxId: normalizedTaxId,
        message: error?.message || error,
      });
      setFeedback('No se pudo validar la cédula en este momento. Revisa la consola para más detalle.', true);
    }
  }

  async function syncCustomerNameFromTaxRegistry() {
    if (!isLegalCustomer()) {
      return;
    }

    const normalizedTaxId = String(fields.taxId.value || '').replace(/\D/g, '');
    if (normalizedTaxId.length !== 10) {
      return;
    }

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

    logInfo(`Response ${response.status} ${method} ${url}`, {
      contentType,
      preview: bodyText.slice(0, 180),
    });

    if (!response.ok) {
      if (contentType.includes('application/json')) {
        let detail = bodyText;
        try {
          const parsed = JSON.parse(bodyText);
          detail = formatApiError(parsed) || bodyText;
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

    if (response.status === 204 || !bodyText) {
      return null;
    }

    if (!contentType.includes('application/json')) {
      throw new Error('El endpoint respondió contenido no JSON.');
    }

    return JSON.parse(bodyText);
  }

  function resetForm() {
    if (!customerForm) {
      return;
    }
    customerForm.reset();
    fields.id.value = '';
    fields.code.value = nextCustomerCode();
    fields.creditLimit.value = '0';
    fields.paymentTermsDays.value = '0';
    formTitle.textContent = 'Nuevo cliente';
    syncFormLabelsFromType(fields.type.value);
  }

  function buildPayload() {
    const typeCode = getTypeCode(fields.type.value);
    const isLegal = typeCode !== 'fisico';

    return {
      organization: getOrganizationId(),
      customer_type: Number(fields.type.value),
      code: fields.code.value.trim(),
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
        await request(apiUrl('/customer-types/'), {
          method: 'POST',
          body: JSON.stringify(item),
        });
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

    const current = Number(organizationIdInput.value);
    const preferred = getActiveOrganizationFromSession();
    const selectedId = organizations.some((item) => item.id === preferred)
      ? preferred
      : organizations.some((item) => item.id === current)
        ? current
        : organizations[0].id;

    if (selectedId !== current) {
      organizationIdInput.value = selectedId;
      const selectedOrganization = organizations.find((item) => item.id === selectedId);
      setFeedback(`Se ajustó organization_id a ${selectedId} (${selectedOrganization?.name || 'N/D'}).`);
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
    if (!customersBody || !searchInput) {
      return;
    }
    const term = searchInput.value.trim().toLowerCase();

    const filtered = customers.filter((item) => {
      const haystack = `${item.code} ${item.legal_name} ${item.email || ''}`.toLowerCase();
      return haystack.includes(term);
    });

    if (customersPager) {
      customersPager.update(filtered);
      return;
    }

    customersBody.innerHTML = filtered.map((item) => renderCustomerRow(item)).join('') || '<tr><td colspan="5">No hay clientes para mostrar.</td></tr>';
  }

  async function loadCustomerTypes() {
    customerTypes = await request(apiUrl('/customer-types/'));

    if (!customerTypes.length) {
      logInfo('No hay tipos de cliente, intentando crear valores por defecto.');
      await ensureDefaultCustomerTypes();
      customerTypes = await request(apiUrl('/customer-types/'));
    }

    if (fields.type) {
      fields.type.innerHTML = customerTypes.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
    }

    if (!customerTypes.length) {
      throw new Error('No hay tipos de cliente configurados y no se pudieron crear automáticamente.');
    }

    syncFormLabelsFromType(fields.type?.value);
  }

  async function loadCustomers() {
    try {
      const organizationId = getOrganizationId();
      const data = await request(apiUrl(`/customers/?organization_id=${organizationId}`));
      customers = data;
      renderTable();
      if (fields.id && fields.code && !fields.id.value) {
        fields.code.value = nextCustomerCode();
      }
      openPendingEdit();
      customersLoaded = true;
      setFeedback(`Mostrando ${data.length} cliente${data.length === 1 ? '' : 's'} de la organización seleccionada.`);
    } catch (error) {
      logError('Error al cargar clientes', error.message);
      customersLoaded = false;
      setFeedback(`Error al cargar clientes: ${error.message}`, true);
    }
  }

  function fillForm(customer) {
    if (!customerForm) {
      return;
    }
    fields.id.value = customer.id;
    fields.type.value = customer.customer_type;
    syncFormLabelsFromType(customer.customer_type);
    fields.code.value = customer.code;
    fields.legalName.value = customer.legal_name;
    fields.tradeName.value = customer.trade_name || '';
    fields.taxId.value = customer.tax_id || '';
    fields.status.value = customer.status;
    fields.email.value = customer.email || '';
    fields.phone.value = customer.phone || '';
    fields.creditLimit.value = customer.credit_limit;
    fields.paymentTermsDays.value = customer.payment_terms_days;
    fields.notes.value = customer.notes || '';
    formTitle.textContent = `Editar cliente #${customer.id}`;
  }

  customerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      await syncCustomerNameFromPadron();
      await syncCustomerNameFromTaxRegistry();
      const id = fields.id.value;
      const payload = buildPayload();
      const isEdit = Boolean(id);
      logInfo('Payload cliente', payload);

      if (isEdit) {
        await request(apiUrl(`/customers/${id}/`), {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setFeedback('Cliente actualizado correctamente.');
      } else {
        await request(apiUrl('/customers/'), {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback('Cliente creado correctamente.');
      }

      resetForm();
      await loadCustomers();
    } catch (error) {
      logError('No se pudo guardar cliente', error.message);
      setFeedback(`No se pudo guardar: ${error.message}`, true);
    }
  });

  cancelEditButton?.addEventListener('click', resetForm);

  customersBody?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const target = customers.find((item) => item.id === id);

    if (!target) {
      return;
    }

    if (action === 'edit') {
      if (!customerForm) {
        sessionStorage.setItem(EDIT_SESSION_KEY, String(id));
        window.location.href = '/customers.html';
        return;
      }
      fillForm(target);
      return;
    }

    if (action === 'delete') {
      const shouldDelete = window.appAlerts?.confirm
        ? await window.appAlerts.confirm(`¿Desea eliminar al cliente ${target.legal_name}?`, 'Eliminar cliente')
        : window.confirm(`¿Desea eliminar al cliente ${target.legal_name}?`);
      if (!shouldDelete) {
        return;
      }

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

  fields.type?.addEventListener('change', () => {
    syncFormLabelsFromType(fields.type.value);
    syncCustomerNameFromPadron().catch(() => null);
    syncCustomerNameFromTaxRegistry().catch(() => null);
  });
  fields.taxId?.addEventListener('blur', () => {
    syncCustomerNameFromPadron().catch(() => null);
    syncCustomerNameFromTaxRegistry().catch(() => null);
  });
  fields.taxId?.addEventListener('input', () => {
    const normalizedTaxId = window.CedulaPadron?.normalizeCedula(fields.taxId.value) || fields.taxId.value.replace(/\D/g, '');

    if (padronTypingTimer) clearTimeout(padronTypingTimer);

    if (!normalizedTaxId && isPhysicalCustomer()) {
      fields.legalName.value = '';
      return;
    }
    padronTypingTimer = setTimeout(() => {
      syncCustomerNameFromPadron().catch(() => null);
      syncCustomerNameFromTaxRegistry().catch(() => null);
    }, 250);
  });
  searchInput?.addEventListener('input', renderTable);
  organizationIdInput?.addEventListener('change', loadCustomers);

  window.addEventListener('focus', () => {
    if (!customersLoaded) return;
    loadCustomers();
  });

  function openPendingEdit() {
    if (!customerForm) {
      return;
    }
    const pendingId = Number(sessionStorage.getItem(EDIT_SESSION_KEY) || 0);
    if (!pendingId) {
      return;
    }
    const target = customers.find((item) => item.id === pendingId);
    sessionStorage.removeItem(EDIT_SESSION_KEY);
    if (target) {
      fillForm(target);
    }
  }

  logInfo('Inicializando módulo clientes', { apiBase: getApiBase(), organizationId: organizationIdInput.value });

  loadOrganizations()
    .then(loadCustomerTypes)
    .then(loadCustomers)
    .catch((error) => {
      logError('Error inicial módulo clientes', error.message);
      setFeedback(`Error inicial: ${error.message}`, true);
    });
})();
