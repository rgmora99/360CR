(function initSuppliersModule() {
  const apiBaseInput = document.getElementById('api-base');
  const organizationIdInput = document.getElementById('organization-id');
  const searchInput = document.getElementById('search');
  const loadButton = document.getElementById('load-suppliers');
  const suppliersBody = document.getElementById('suppliers-body');
  const feedback = document.getElementById('feedback');

  const supplierForm = document.getElementById('supplier-form');
  const formTitle = document.getElementById('form-title');
  const cancelEditButton = document.getElementById('cancel-edit');

  const personKindInput = document.getElementById('person-kind');
  const legalNameLabel = document.getElementById('legal-name-label');
  const taxIdLabel = document.getElementById('tax-id-label');
  const tradeNameWrapper = document.getElementById('trade-name-wrapper');

  const fields = {
    id: document.getElementById('supplier-id'),
    type: document.getElementById('supplier-type'),
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

  let suppliers = [];
  let supplierTypes = [];

  function getApiBase() {
    const value = apiBaseInput.value.trim() || '/api';
    return value.endsWith('/') ? value.slice(0, -1) : value;
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
    const type = supplierTypes.find((item) => item.id === Number(typeId));
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
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();

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
    supplierForm.reset();
    fields.id.value = '';
    fields.creditLimit.value = '0';
    fields.paymentTermsDays.value = '0';
    formTitle.textContent = 'Nuevo proveedor';
    syncPersonKindFromType(fields.type.value);
  }

  function buildPayload() {
    const personKind = personKindInput.value;

    return {
      organization: getOrganizationId(),
      supplier_type: Number(fields.type.value),
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

  function renderTable() {
    const term = searchInput.value.trim().toLowerCase();

    const filtered = suppliers.filter((item) => {
      const haystack = `${item.code} ${item.legal_name} ${item.email || ''}`.toLowerCase();
      return haystack.includes(term);
    });

    suppliersBody.innerHTML = '';

    if (!filtered.length) {
      suppliersBody.innerHTML = '<tr><td colspan="5">No hay proveedores para mostrar.</td></tr>';
      return;
    }

    filtered.forEach((item) => {
      const tr = document.createElement('tr');
      const typeCode = getTypeCode(item.supplier_type) || '-';
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
      suppliersBody.appendChild(tr);
    });
  }

  async function ensureDefaultSupplierTypes() {
    if (supplierTypes.length > 0) {
      return;
    }

    const defaults = [
      { code: 'juridico', name: 'Persona jurídica' },
      { code: 'fisico', name: 'Persona física' },
    ];

    for (const item of defaults) {
      await request(`${getApiBase()}/supplier-types/`, {
        method: 'POST',
        body: JSON.stringify(item),
      }).catch(() => null);
    }
  }

  async function loadSupplierTypes() {
    await ensureDefaultSupplierTypes();
    supplierTypes = await request(`${getApiBase()}/supplier-types/`);

    fields.type.innerHTML = supplierTypes.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');

    if (!supplierTypes.length) {
      throw new Error('No hay tipos de proveedor configurados.');
    }

    syncPersonKindFromType(fields.type.value);
  }

  async function loadSuppliers() {
    try {
      const organizationId = getOrganizationId();
      const data = await request(`${getApiBase()}/suppliers/?organization_id=${organizationId}`);
      suppliers = data;
      renderTable();
      setFeedback(`Se cargaron ${data.length} proveedores.`);
    } catch (error) {
      setFeedback(`Error al cargar proveedores: ${error.message}`, true);
    }
  }

  function fillForm(supplier) {
    fields.id.value = supplier.id;
    fields.type.value = supplier.supplier_type;
    syncPersonKindFromType(supplier.supplier_type);
    fields.code.value = supplier.code;
    fields.legalName.value = supplier.legal_name;
    fields.tradeName.value = supplier.trade_name || '';
    fields.taxId.value = supplier.tax_id || '';
    fields.status.value = supplier.status;
    fields.email.value = supplier.email || '';
    fields.phone.value = supplier.phone || '';
    fields.creditLimit.value = supplier.credit_limit;
    fields.paymentTermsDays.value = supplier.payment_terms_days;
    fields.notes.value = supplier.notes || '';
    formTitle.textContent = `Editar proveedor #${supplier.id}`;
  }

  supplierForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const id = fields.id.value;
      const payload = buildPayload();
      const isEdit = Boolean(id);

      if (isEdit) {
        await request(`${getApiBase()}/suppliers/${id}/`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setFeedback('Proveedor actualizado correctamente.');
      } else {
        await request(`${getApiBase()}/suppliers/`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback('Proveedor creado correctamente.');
      }

      resetForm();
      await loadSuppliers();
    } catch (error) {
      setFeedback(`No se pudo guardar: ${error.message}`, true);
    }
  });

  cancelEditButton.addEventListener('click', resetForm);

  suppliersBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const target = suppliers.find((item) => item.id === id);

    if (!target) {
      return;
    }

    if (action === 'edit') {
      fillForm(target);
      return;
    }

    if (action === 'delete') {
      if (!window.confirm(`¿Desea eliminar al proveedor ${target.legal_name}?`)) {
        return;
      }

      try {
        await request(`${getApiBase()}/suppliers/${id}/`, { method: 'DELETE' });
        setFeedback('Proveedor eliminado correctamente.');
        await loadSuppliers();
      } catch (error) {
        setFeedback(`No se pudo eliminar: ${error.message}`, true);
      }
    }
  });

  personKindInput.addEventListener('change', () => {
    const targetCode = personKindInput.value === 'individual' ? 'fisico' : 'juridico';
    const targetType = supplierTypes.find((item) => item.code === targetCode);
    if (targetType) {
      fields.type.value = targetType.id;
    }
    refreshPersonKindLabels();
  });

  fields.type.addEventListener('change', () => syncPersonKindFromType(fields.type.value));
  searchInput.addEventListener('input', renderTable);
  loadButton.addEventListener('click', loadSuppliers);

  loadSupplierTypes()
    .then(loadSuppliers)
    .catch((error) => setFeedback(`Error inicial: ${error.message}`, true));
})();
