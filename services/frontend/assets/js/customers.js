(function initCustomersModule() {
  const API_BASE = '/api';

  const organizationIdInput = document.getElementById('organization-id');
  const searchInput = document.getElementById('search');
  const loadButton = document.getElementById('load-customers');
  const customersBody = document.getElementById('customers-body');
  const feedback = document.getElementById('feedback');

  const customerForm = document.getElementById('customer-form');
  const formTitle = document.getElementById('form-title');
  const cancelEditButton = document.getElementById('cancel-edit');

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

  function getOrganizationId() {
    const organizationId = Number(organizationIdInput.value);
    if (!organizationId || organizationId < 1) {
      throw new Error('Debe indicar un organization_id válido.');
    }
    return organizationId;
  }

  function resetForm() {
    customerForm.reset();
    fields.id.value = '';
    fields.creditLimit.value = '0';
    fields.paymentTermsDays.value = '0';
    formTitle.textContent = 'Nuevo cliente';
  }

  function setFeedback(message, isError) {
    feedback.textContent = message;
    feedback.style.color = isError ? '#ff7d7d' : 'var(--muted)';
  }

  async function request(url, options) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(JSON.stringify(errorData) || 'Error inesperado del servidor.');
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
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
      tr.innerHTML = `
        <td>${item.code}</td>
        <td>${item.legal_name}</td>
        <td>${item.status}</td>
        <td>${item.email || '-'}</td>
        <td>
          <button class="btn btn-secondary" data-action="edit" data-id="${item.id}">Editar</button>
          <button class="btn btn-secondary" data-action="delete" data-id="${item.id}">Eliminar</button>
        </td>
      `;
      customersBody.appendChild(tr);
    });
  }

  function fillForm(customer) {
    fields.id.value = customer.id;
    fields.type.value = customer.customer_type;
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

  function buildPayload() {
    return {
      organization: getOrganizationId(),
      customer_type: Number(fields.type.value),
      code: fields.code.value.trim(),
      legal_name: fields.legalName.value.trim(),
      trade_name: fields.tradeName.value.trim(),
      tax_id: fields.taxId.value.trim(),
      status: fields.status.value,
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      credit_limit: Number(fields.creditLimit.value || 0),
      payment_terms_days: Number(fields.paymentTermsDays.value || 0),
      notes: fields.notes.value.trim(),
    };
  }

  async function loadCustomerTypes() {
    const data = await request(`${API_BASE}/customer-types/`);
    fields.type.innerHTML = data
      .map((item) => `<option value="${item.id}">${item.name}</option>`)
      .join('');
  }

  async function loadCustomers() {
    try {
      const organizationId = getOrganizationId();
      const data = await request(`${API_BASE}/customers/?organization_id=${organizationId}`);
      customers = data;
      renderTable();
      setFeedback(`Se cargaron ${data.length} clientes.`);
    } catch (error) {
      setFeedback(`Error al cargar clientes: ${error.message}`, true);
    }
  }

  customerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const id = fields.id.value;
      const payload = buildPayload();
      const isEdit = Boolean(id);

      if (isEdit) {
        await request(`${API_BASE}/customers/${id}/`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setFeedback('Cliente actualizado correctamente.');
      } else {
        await request(`${API_BASE}/customers/`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback('Cliente creado correctamente.');
      }

      resetForm();
      await loadCustomers();
    } catch (error) {
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
        await request(`${API_BASE}/customers/${id}/`, { method: 'DELETE' });
        setFeedback('Cliente eliminado correctamente.');
        await loadCustomers();
      } catch (error) {
        setFeedback(`No se pudo eliminar: ${error.message}`, true);
      }
    }
  });

  searchInput.addEventListener('input', renderTable);
  loadButton.addEventListener('click', loadCustomers);

  loadCustomerTypes()
    .then(loadCustomers)
    .catch((error) => setFeedback(`Error inicial: ${error.message}`, true));
})();
