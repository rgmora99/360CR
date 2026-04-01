(function initCustomersModule() {
  const apiBaseInput = document.getElementById('api-base');
  const organizationIdInput = document.getElementById('organization-id');
  const searchInput = document.getElementById('search');
  const loadButton = document.getElementById('load-customers');
  const customersBody = document.getElementById('customers-body');
  const feedback = document.getElementById('feedback');

  const customerForm = document.getElementById('customer-form');
  const formTitle = document.getElementById('form-title');
  const cancelEditButton = document.getElementById('cancel-edit');

  const personKindInput = document.getElementById('person-kind');
  const legalNameLabel = document.getElementById('legal-name-label');
  const taxIdLabel = document.getElementById('tax-id-label');
  const tradeNameWrapper = document.getElementById('trade-name-wrapper');

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

  function logInfo(message, payload) {
    console.info(`[Clientes] ${message}`, payload || '');
  }

  function logError(message, payload) {
    console.error(`[Clientes] ${message}`, payload || '');
  }

  function normalizeApiBase(rawBase) {
    let base = (rawBase || '/api').trim();

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
    const normalized = normalizeApiBase(apiBaseInput.value);
    if (apiBaseInput.value !== normalized) {
      logInfo('API base normalizada automáticamente', { from: apiBaseInput.value, to: normalized });
      apiBaseInput.value = normalized;
    }
    return normalized;
  }

  function apiUrl(path) {
    return `${getApiBase()}${path}`;
  }

  function getOrganizationId() {
    const organizationId = Number(organizationIdInput.value);
    if (!organizationId || organizationId < 1) {
      throw new Error('Debe indicar un organization_id válido.');
    }
    return organizationId;
  }

  function setFeedback(message, isError) {
    feedback.textContent = message;
    feedback.style.color = isError ? '#ff7d7d' : 'var(--muted)';
  }

  function getTypeCode(typeId) {
    const type = customerTypes.find((item) => item.id === Number(typeId));
    return type?.code || '';
  }

  function syncPersonKindFromType(typeId) {
    const code = getTypeCode(typeId);
    personKindInput.value = code === 'fisico' ? 'individual' : 'legal';
    refreshPersonKindLabels();
  }

  function refreshPersonKindLabels() {
    const isLegal = personKindInput.value === 'legal';
    legalNameLabel.firstChild.textContent = isLegal ? 'Razón social' : 'Nombre completo';
    taxIdLabel.firstChild.textContent = isLegal ? 'Cédula jurídica' : 'Cédula física';
    tradeNameWrapper.style.display = isLegal ? 'grid' : 'none';
  }

  async function request(url, options) {
    const method = options?.method || 'GET';
    logInfo(`Request ${method} ${url}`);

    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
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
        throw new Error(bodyText || 'Error inesperado del servidor.');
      }

      if (bodyText.startsWith('<!doctype html') || bodyText.startsWith('<html')) {
        throw new Error('La respuesta no es JSON. Verifica API base (ej: http://localhost:8000/api).');
      }

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

  function resetForm() {
    customerForm.reset();
    fields.id.value = '';
    fields.creditLimit.value = '0';
    fields.paymentTermsDays.value = '0';
    formTitle.textContent = 'Nuevo cliente';
    syncPersonKindFromType(fields.type.value);
  }

  function buildPayload() {
    const personKind = personKindInput.value;

    return {
      organization: getOrganizationId(),
      customer_type: Number(fields.type.value),
      code: fields.code.value.trim(),
      legal_name: fields.legalName.value.trim(),
      trade_name: personKind === 'legal' ? fields.tradeName.value.trim() : '',
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

  function renderTable() {
    const term = searchInput.value.trim().toLowerCase();

    const filtered = customers.filter((item) => {
      const haystack = `${item.code} ${item.legal_name} ${item.email || ''}`.toLowerCase();
      return haystack.includes(term);
    });

    customersBody.innerHTML = '';

    if (!filtered.length) {
      customersBody.innerHTML = '<tr><td colspan="5">No hay clientes para mostrar.</td></tr>';
      return;
    }

    filtered.forEach((item) => {
      const tr = document.createElement('tr');
      const typeCode = getTypeCode(item.customer_type) || '-';
      tr.innerHTML = `
        <td>${item.code}</td>
        <td>${typeCode}</td>
        <td>${item.legal_name}</td>
        <td>${item.status}</td>
        <td>
          <button class="btn btn-secondary" data-action="edit" data-id="${item.id}">Editar</button>
          <button class="btn btn-secondary" data-action="delete" data-id="${item.id}">Eliminar</button>
        </td>
      `;
      customersBody.appendChild(tr);
    });
  }

  async function loadCustomerTypes() {
    customerTypes = await request(apiUrl('/customer-types/'));

    if (!customerTypes.length) {
      logInfo('No hay tipos de cliente, intentando crear valores por defecto.');
      await ensureDefaultCustomerTypes();
      customerTypes = await request(apiUrl('/customer-types/'));
    }

    fields.type.innerHTML = customerTypes.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');

    if (!customerTypes.length) {
      throw new Error('No hay tipos de cliente configurados y no se pudieron crear automáticamente.');
    }

    syncPersonKindFromType(fields.type.value);
  }

  async function loadCustomers() {
    try {
      const organizationId = getOrganizationId();
      const data = await request(apiUrl(`/customers/?organization_id=${organizationId}`));
      customers = data;
      renderTable();
      setFeedback(`Se cargaron ${data.length} clientes.`);
    } catch (error) {
      logError('Error al cargar clientes', error.message);
      setFeedback(`Error al cargar clientes: ${error.message}`, true);
    }
  }

  function fillForm(customer) {
    fields.id.value = customer.id;
    fields.type.value = customer.customer_type;
    syncPersonKindFromType(customer.customer_type);
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

  customerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
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

  cancelEditButton.addEventListener('click', resetForm);

  customersBody.addEventListener('click', async (event) => {
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
      fillForm(target);
      return;
    }

    if (action === 'delete') {
      if (!window.confirm(`¿Desea eliminar al cliente ${target.legal_name}?`)) {
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

  personKindInput.addEventListener('change', () => {
    const targetCode = personKindInput.value === 'individual' ? 'fisico' : 'juridico';
    const targetType = customerTypes.find((item) => item.code === targetCode);
    if (targetType) {
      fields.type.value = targetType.id;
    }
    refreshPersonKindLabels();
  });

  apiBaseInput.addEventListener('blur', () => {
    const normalized = getApiBase();
    setFeedback(`API base configurada: ${normalized}`);
  });

  fields.type.addEventListener('change', () => syncPersonKindFromType(fields.type.value));
  searchInput.addEventListener('input', renderTable);
  loadButton.addEventListener('click', loadCustomers);

  logInfo('Inicializando módulo clientes', { apiBase: getApiBase(), organizationId: organizationIdInput.value });

  loadCustomerTypes()
    .then(loadCustomers)
    .catch((error) => {
      logError('Error inicial módulo clientes', error.message);
      setFeedback(`Error inicial: ${error.message}`, true);
    });
})();
