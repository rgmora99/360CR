(function initSuppliersModule() {
  const searchInput = document.getElementById('search');
  const suppliersBody = document.getElementById('suppliers-body');
  const feedback = document.getElementById('feedback');
  const supplierForm = document.getElementById('supplier-form');
  const editModal = document.getElementById('supplier-edit-modal');
  const editForm = document.getElementById('supplier-edit-form');
  const editCloseButton = document.getElementById('supplier-edit-close');
  const editCancelButton = document.getElementById('supplier-edit-cancel');

  const suppliersPager = window.TablePaginator?.create({
    key: 'suppliers',
    tableBody: suppliersBody,
    totalColumns: 5,
    emptyMessage: 'No hay proveedores para mostrar.',
    rowRenderer: renderSupplierRow,
  });

  const createFields = createFieldRefs('');
  const editFields = createFieldRefs('edit-');
  const createLabels = createLabelRefs('');
  const editLabels = createLabelRefs('edit-');

  let suppliers = [];
  let supplierTypes = [];
  let suppliersLoaded = false;
  let createTypingTimer = null;
  let editTypingTimer = null;

  function createFieldRefs(prefix) {
    return {
      id: document.getElementById(`${prefix}supplier-id`) || document.getElementById(`${prefix}id`) || document.getElementById(`${prefix}supplier-id`),
      type: document.getElementById(`${prefix}supplier-type`),
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

  function renderSupplierRow(item) {
    const typeCode = getTypeCode(item.supplier_type) || '-';
    return `
      <tr>
        <td>${escapeHtml(item.code)}</td>
        <td>${escapeHtml(formatSupplierType(typeCode))}</td>
        <td>${escapeHtml(item.legal_name)}</td>
        <td><span class="status status-${item.status}">${escapeHtml(formatSupplierStatus(item.status))}</span></td>
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

  function getApiBase() {
    const value = '/api';
    return value.endsWith('/') ? value.slice(0, -1) : value;
  }

  function getOrganizationId() {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    if (!organizationId || organizationId < 1) {
      throw new Error('No hay organización activa. Selecciona una organización en la barra superior.');
    }
    return organizationId;
  }

  function setFeedback(message, isError) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.style.color = isError ? '#ff7d7d' : 'var(--muted)';
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

  function nextSupplierCodeFallback() {
    const numbers = suppliers
      .map((item) => {
        const match = String(item.code || '').trim().toUpperCase().match(/^P(\d+)$/);
        return match ? Number(match[1]) : NaN;
      })
      .filter((value) => Number.isFinite(value) && value > 0);
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `P${String(next).padStart(6, '0')}`;
  }

  async function refreshCreateCode() {
    if (!supplierForm || !createFields.code) return;

    try {
      const organizationId = getOrganizationId();
      const data = await request(`${getApiBase()}/suppliers/next-code/?organization_id=${organizationId}`);
      createFields.code.value = data?.code || nextSupplierCodeFallback();
    } catch (_error) {
      createFields.code.value = nextSupplierCodeFallback();
    }
  }

  function getTypeCode(typeId) {
    const type = supplierTypes.find((item) => item.id === Number(typeId));
    return type?.code || '';
  }

  function syncFormLabels(fields, labels) {
    if (!fields?.type || !labels.legalNameLabel || !labels.taxIdLabel || !labels.tradeNameWrapper) return;
    const isLegal = getTypeCode(fields.type.value) !== 'fisico';
    labels.legalNameLabel.firstChild.textContent = isLegal ? 'Razón social' : 'Nombre completo';
    labels.taxIdLabel.firstChild.textContent = isLegal ? 'Cédula jurídica' : 'Cédula física';
    labels.tradeNameWrapper.style.display = isLegal ? 'grid' : 'none';
  }

  function isPhysicalSupplier(fields) {
    return getTypeCode(fields.type.value) === 'fisico';
  }

  function isLegalSupplier(fields) {
    return !isPhysicalSupplier(fields);
  }

  async function syncSupplierNameFromPadron(fields) {
    if (!window.CedulaPadron || !isPhysicalSupplier(fields)) return;
    const taxId = fields.taxId.value.trim();
    if (!taxId) return;
    const normalizedTaxId = window.CedulaPadron.normalizeCedula(taxId);
    if (normalizedTaxId.length < 9) return;

    const record = await window.CedulaPadron.resolveByCedula(taxId);
    if (!record) {
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
  }

  async function syncSupplierNameFromTaxRegistry(fields) {
    if (!isLegalSupplier(fields)) return;
    const normalizedTaxId = String(fields.taxId.value || '').replace(/\D/g, '');
    if (normalizedTaxId.length !== 10) return;

    try {
      const record = await request(`${getApiBase()}/suppliers/tax-registry/?tax_id=${normalizedTaxId}`);
      if (!record) return;
      if (!fields.legalName.value.trim()) {
        fields.legalName.value = record.nombre || '';
      }
      const status = record?.situacion?.estado || 'Sin estado';
      const administration = record?.situacion?.administracionTributaria || 'Sin administración';
      setFeedback(`Razón social validada en Hacienda. Estado: ${status}. Administración: ${administration}.`);
    } catch (error) {
      console.info('[Proveedores] No se pudo consultar Hacienda para persona jurídica.', error?.message || error);
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
        throw new Error('La respuesta no es JSON. Verifica API base.');
      }
      throw new Error(bodyText || 'Error inesperado del servidor.');
    }

    if (response.status === 204 || !bodyText) return null;
    if (!contentType.includes('application/json')) {
      throw new Error('El endpoint respondió contenido no JSON. Revisa API base.');
    }
    return JSON.parse(bodyText);
  }

  function populateTypeSelect(select) {
    if (!select) return;
    select.innerHTML = supplierTypes.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  }

  function resetCreateForm() {
    if (!supplierForm) return;
    supplierForm.reset();
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
    const personKind = getTypeCode(fields.type.value) === 'fisico' ? 'individual' : 'legal';
    return {
      organization: getOrganizationId(),
      supplier_type: Number(fields.type.value),
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

  function formatSupplierType(typeCode) {
    if (typeCode === 'fisico') return 'Persona física';
    if (typeCode === 'juridico') return 'Persona jurídica';
    return typeCode || '-';
  }

  function formatSupplierStatus(status) {
    const labels = { active: 'Activo', inactive: 'Inactivo', blocked: 'Bloqueado' };
    return labels[status] || status || '-';
  }

  function renderTable() {
    if (!suppliersBody || !searchInput) return;
    const term = searchInput.value.trim().toLowerCase();
    const filtered = suppliers.filter((item) => `${item.code} ${item.legal_name} ${item.email || ''}`.toLowerCase().includes(term));
    if (suppliersPager) {
      suppliersPager.update(filtered);
      return;
    }
    suppliersBody.innerHTML = filtered.map((item) => renderSupplierRow(item)).join('') || '<tr><td colspan="5">No hay proveedores para mostrar.</td></tr>';
  }

  async function ensureDefaultSupplierTypes() {
    if (supplierTypes.length > 0) return;
    const defaults = [
      { code: 'juridico', name: 'Persona jurídica' },
      { code: 'fisico', name: 'Persona física' },
    ];
    for (const item of defaults) {
      await request(`${getApiBase()}/supplier-types/`, { method: 'POST', body: JSON.stringify(item) }).catch(() => null);
    }
  }

  async function loadSupplierTypes() {
    await ensureDefaultSupplierTypes();
    supplierTypes = await request(`${getApiBase()}/supplier-types/`);
    if (!supplierTypes.length) {
      throw new Error('No hay tipos de proveedor configurados.');
    }
    populateTypeSelect(createFields.type);
    populateTypeSelect(editFields.type);
    syncFormLabels(createFields, createLabels);
    syncFormLabels(editFields, editLabels);
  }

  async function loadSuppliers() {
    try {
      const organizationId = getOrganizationId();
      const data = await request(`${getApiBase()}/suppliers/?organization_id=${organizationId}`);
      suppliers = Array.isArray(data) ? data : [];
      renderTable();
      await refreshCreateCode();
      suppliersLoaded = true;
    } catch (error) {
      suppliersLoaded = false;
      setFeedback(`Error al cargar proveedores: ${error.message}`, true);
    }
  }

  function fillEditForm(supplier) {
    if (!editForm) return;
    editFields.id.value = supplier.id;
    editFields.type.value = String(supplier.supplier_type);
    syncFormLabels(editFields, editLabels);
    editFields.code.value = supplier.code;
    editFields.legalName.value = supplier.legal_name;
    editFields.tradeName.value = supplier.trade_name || '';
    editFields.taxId.value = supplier.tax_id || '';
    editFields.status.value = supplier.status;
    editFields.email.value = supplier.email || '';
    editFields.phone.value = supplier.phone || '';
    editFields.creditLimit.value = supplier.credit_limit;
    editFields.paymentTermsDays.value = supplier.payment_terms_days;
    editFields.notes.value = supplier.notes || '';
  }

  function openEditModal(supplier) {
    if (!editModal || !supplier) return;
    fillEditForm(supplier);
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

  async function saveSupplier(fields, isEdit) {
    await syncSupplierNameFromPadron(fields);
    await syncSupplierNameFromTaxRegistry(fields);
    const payload = buildPayload(fields);
    const id = fields.id?.value;

    if (isEdit) {
      await request(`${getApiBase()}/suppliers/${id}/`, { method: 'PUT', body: JSON.stringify(payload) });
      setFeedback('Proveedor actualizado correctamente.');
    } else {
      await request(`${getApiBase()}/suppliers/`, { method: 'POST', body: JSON.stringify(payload) });
      setFeedback('Proveedor creado correctamente.');
    }
  }

  function registerTaxListeners(fields, labels, timerName) {
    fields.type?.addEventListener('change', () => {
      syncFormLabels(fields, labels);
      syncSupplierNameFromPadron(fields).catch(() => null);
      syncSupplierNameFromTaxRegistry(fields).catch(() => null);
    });

    fields.taxId?.addEventListener('blur', () => {
      syncSupplierNameFromPadron(fields).catch(() => null);
      syncSupplierNameFromTaxRegistry(fields).catch(() => null);
    });

    fields.taxId?.addEventListener('input', () => {
      if (timerName === 'create' && createTypingTimer) clearTimeout(createTypingTimer);
      if (timerName === 'edit' && editTypingTimer) clearTimeout(editTypingTimer);
      const timer = setTimeout(() => {
        syncSupplierNameFromPadron(fields).catch(() => null);
        syncSupplierNameFromTaxRegistry(fields).catch(() => null);
      }, 250);
      if (timerName === 'create') createTypingTimer = timer;
      if (timerName === 'edit') editTypingTimer = timer;
    });
  }

  supplierForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveSupplier(createFields, false);
      resetCreateForm();
      await loadSuppliers();
    } catch (error) {
      setFeedback(`No se pudo guardar: ${error.message}`, true);
    }
  });

  editForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveSupplier(editFields, true);
      closeEditModal();
      await loadSuppliers();
    } catch (error) {
      setFeedback(`No se pudo guardar: ${error.message}`, true);
    }
  });

  editCloseButton?.addEventListener('click', closeEditModal);
  editCancelButton?.addEventListener('click', closeEditModal);
  editModal?.addEventListener('click', (event) => {
    if (event.target === editModal) closeEditModal();
  });

  suppliersBody?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const target = suppliers.find((item) => item.id === id);
    if (!target) return;

    if (action === 'edit') {
      openEditModal(target);
      return;
    }

    if (action === 'delete') {
      const shouldDelete = window.appAlerts?.confirm
        ? await window.appAlerts.confirm(`¿Desea eliminar al proveedor ${target.legal_name}?`, 'Eliminar proveedor')
        : window.confirm(`¿Desea eliminar al proveedor ${target.legal_name}?`);
      if (!shouldDelete) return;

      try {
        await request(`${getApiBase()}/suppliers/${id}/`, { method: 'DELETE' });
        setFeedback('Proveedor eliminado correctamente.');
        await loadSuppliers();
      } catch (error) {
        setFeedback(`No se pudo eliminar: ${error.message}`, true);
      }
    }
  });

  searchInput?.addEventListener('input', renderTable);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && editModal && !editModal.classList.contains('hidden')) {
      closeEditModal();
    }
  });
  window.addEventListener('focus', () => {
    if (!suppliersLoaded) return;
    loadSuppliers();
  });

  registerTaxListeners(createFields, createLabels, 'create');
  registerTaxListeners(editFields, editLabels, 'edit');

  loadSupplierTypes()
    .then(() => {
      resetCreateForm();
      resetEditForm();
      return loadSuppliers();
    })
    .catch((error) => setFeedback(`Error inicial: ${error.message}`, true));
})();
