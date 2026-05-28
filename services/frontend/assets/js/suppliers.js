(function initSuppliersModule() {
  const SESSION_KEY = 'cr360.session';
  const searchInput = document.getElementById('search');
  const suppliersBody = document.getElementById('suppliers-body');
  const feedback = document.getElementById('feedback');
  const supplierForm = document.getElementById('supplier-form');
  const editModal = document.getElementById('supplier-edit-modal');
  const editForm = document.getElementById('supplier-edit-form');
  const editCloseButton = document.getElementById('supplier-edit-close');
  const editCancelButton = document.getElementById('supplier-edit-cancel');
  const importCsvButton = document.getElementById('supplier-import-csv-button');
  const importCsvInput = document.getElementById('supplier-import-csv-input');

  const suppliersPager = window.TablePaginator?.create({
    key: 'suppliers',
    tableBody: suppliersBody,
    totalColumns: 6,
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
        <td>${escapeHtml(item.tax_id || '-')}</td>
        <td>${escapeHtml(item.legal_name)}</td>
        <td><span class="status status-${item.status}">${escapeHtml(formatSupplierStatus(item.status))}</span></td>
        <td>${renderSupplierActions(item)}</td>
      </tr>
    `;
  }

  function renderSupplierActions(item) {
    return `
      <div class="row-actions-cell">
        <button class="btn btn-secondary row-action-primary" type="button" data-action="edit" data-id="${item.id}">Editar</button>
        <div class="row-actions-menu">
          <button class="btn btn-secondary row-actions-trigger" type="button" data-supplier-actions-toggle="${item.id}" aria-haspopup="true" aria-expanded="false">Mas</button>
          <div class="row-actions-dropdown" data-supplier-actions-menu="${item.id}" role="menu">
            <button type="button" class="is-danger" data-action="delete" data-id="${item.id}" role="menuitem">Eliminar proveedor</button>
          </div>
        </div>
      </div>
    `;
  }

  function positionActionMenu(toggle, menu) {
    const rect = toggle.getBoundingClientRect();
    const menuWidth = 178;
    const margin = 10;
    const left = Math.min(window.innerWidth - menuWidth - margin, Math.max(margin, rect.right - menuWidth));
    const top = Math.min(window.innerHeight - margin, rect.bottom + 6);
    menu.style.setProperty('--menu-left', `${left}px`);
    menu.style.setProperty('--menu-top', `${top}px`);
  }

  function closeActionMenus() {
    document.querySelectorAll('.row-actions-dropdown.is-open').forEach((node) => node.classList.remove('is-open'));
    document.querySelectorAll('[data-supplier-actions-toggle][aria-expanded="true"]').forEach((node) => node.setAttribute('aria-expanded', 'false'));
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
    console.info(`[Proveedores] ${message}`, payload || '');
  }

  function logError(message, payload) {
    console.error(`[Proveedores] ${message}`, payload || '');
  }

  function getApiBase() {
    const value = '/api';
    return value.endsWith('/') ? value.slice(0, -1) : value;
  }

  function getOrganizationId() {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.() || getActiveOrganizationFromSession());
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

  function normalizeHeader(value) {
    return String(value || '')
      .trim()
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  function parseCsv(text) {
    const normalizedText = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!normalizedText) return [];

    const firstLine = normalizedText.split('\n')[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let index = 0; index < normalizedText.length; index += 1) {
      const char = normalizedText[index];
      const nextChar = normalizedText[index + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === delimiter && !inQuotes) {
        row.push(cell);
        cell = '';
        continue;
      }
      if (char === '\n' && !inQuotes) {
        row.push(cell);
        if (row.some((value) => String(value).trim())) rows.push(row);
        row = [];
        cell = '';
        continue;
      }
      cell += char;
    }

    row.push(cell);
    if (row.some((value) => String(value).trim())) rows.push(row);
    if (!rows.length) return [];

    const headers = rows[0].map(normalizeHeader);
    return rows.slice(1).map((values, index) => {
      const item = { rowNumber: index + 2 };
      headers.forEach((header, headerIndex) => {
        item[header] = String(values[headerIndex] || '').trim();
      });
      return item;
    });
  }

  function readCsvValue(row, aliases) {
    for (const alias of aliases) {
      const key = normalizeHeader(alias);
      if (row[key] !== undefined && row[key] !== '') return row[key];
    }
    return '';
  }

  function parseCsvNumber(value) {
    const normalized = String(value || '').trim().replace(/\s+/g, '').replace(',', '.');
    const number = Number(normalized || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function findTypeIdByCsvValue(value) {
    const normalized = normalizeHeader(value);
    const aliases = {
      fisico: ['fisico', 'persona_fisica'],
      juridico: ['juridico', 'juridica', 'persona_juridica'],
    };
    const typeCode = Object.entries(aliases).find(([, values]) => values.includes(normalized))?.[0] || normalized;
    const type = supplierTypes.find((item) => item.code === typeCode);
    if (!type) {
      throw new Error(`Tipo "${value}" no existe. Use fisico o juridico.`);
    }
    return type.id;
  }

  function buildSupplierPayloadFromCsv(row) {
    const legalName = readCsvValue(row, ['nombre', 'legal_name', 'razon_social']);
    if (!legalName) throw new Error('La columna nombre es obligatoria.');

    const typeValue = readCsvValue(row, ['tipo', 'type', 'tipo_proveedor']);
    if (!typeValue) throw new Error('La columna tipo es obligatoria. Use fisico o juridico.');

    const typeId = findTypeIdByCsvValue(typeValue);
    const typeCode = getTypeCode(typeId);
    const isLegal = typeCode !== 'fisico';

    return {
      organization: getOrganizationId(),
      supplier_type: typeId,
      legal_name: legalName,
      trade_name: isLegal ? readCsvValue(row, ['nombre_comercial', 'trade_name']) : '',
      tax_id: readCsvValue(row, ['cedula', 'tax_id', 'identificacion']),
      status: readCsvValue(row, ['estado', 'status']) || 'active',
      email: readCsvValue(row, ['correo', 'email']),
      phone: readCsvValue(row, ['telefono', 'phone']),
      credit_limit: parseCsvNumber(readCsvValue(row, ['limite_credito', 'credit_limit'])),
      payment_terms_days: Math.max(0, Math.trunc(parseCsvNumber(readCsvValue(row, ['dias_pago', 'payment_terms_days'])))),
      notes: readCsvValue(row, ['notas', 'notes']),
    };
  }

  async function confirmSupplierPadronMismatch(payload, rowNumber) {
    const typeCode = getTypeCode(payload.supplier_type);
    if (typeCode !== 'fisico' || !window.CedulaPadron) return true;

    const normalizedTaxId = window.CedulaPadron.normalizeCedula(payload.tax_id);
    const record = await window.CedulaPadron.resolveByCedula(normalizedTaxId);
    if (!record) {
      const message = `Fila ${rowNumber}: la cedula ${payload.tax_id} no existe en el padron electoral. Desea guardarla de igual manera?`;
      return window.appAlerts?.confirm ? window.appAlerts.confirm(message, 'Cedula no encontrada') : window.confirm(message);
    }

    const matchesName = window.CedulaPadron.compareName(payload.legal_name, record);
    if (matchesName === false) {
      const message = `Fila ${rowNumber}: la cedula ${payload.tax_id} corresponde a "${record.fullName}", pero el CSV indica "${payload.legal_name}". Desea guardarlo de igual manera?`;
      return window.appAlerts?.confirm ? window.appAlerts.confirm(message, 'Nombre no coincide') : window.confirm(message);
    }

    return true;
  }

  async function importSuppliersFromCsv(file) {
    const rows = parseCsv(await file.text());
    if (!rows.length) throw new Error('El archivo CSV no contiene filas para importar.');

    let created = 0;
    const errors = [];
    for (const row of rows) {
      try {
        const payload = buildSupplierPayloadFromCsv(row);
        const shouldSave = await confirmSupplierPadronMismatch(payload, row.rowNumber);
        if (!shouldSave) {
          errors.push(`Fila ${row.rowNumber}: omitida para verificar datos de padron.`);
          continue;
        }
        await request(`${getApiBase()}/suppliers/`, { method: 'POST', body: JSON.stringify(payload) });
        created += 1;
      } catch (error) {
        errors.push(`Fila ${row.rowNumber}: ${error.message}`);
      }
    }

    await loadSuppliers();
    if (errors.length) {
      setFeedback(`Carga CSV finalizada: ${created} creados, ${errors.length} con error. ${errors.slice(0, 3).join(' | ')}`, true);
      logError('Errores de carga CSV', errors);
      return;
    }
    setFeedback(`Carga CSV finalizada: ${created} proveedores creados correctamente.`);
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

    try {
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
    } catch (error) {
      logError('Error validando cédula contra padrón.', { taxId: normalizedTaxId, message: error?.message || error });
      setFeedback('No se pudo validar la cédula en este momento. Revisa la consola para más detalle.', true);
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
      logInfo('No se pudo consultar Hacienda para persona jurídica.', error?.message || error);
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

  function renderTable(resetPage = false) {
    if (!suppliersBody) return;
    const term = searchInput?.value.trim().toLowerCase() || '';
    const filtered = suppliers.filter((item) => `${item.code} ${item.tax_id || ''} ${item.legal_name} ${item.email || ''} ${item.phone || ''}`.toLowerCase().includes(term));
    if (suppliersPager) {
      suppliersPager.update(filtered, { resetPage });
      return;
    }
    suppliersBody.innerHTML = filtered.map((item) => renderSupplierRow(item)).join('') || '<tr><td colspan="6">No hay proveedores para mostrar.</td></tr>';
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
      logError('Error al cargar proveedores', error.message);
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
      logError('No se pudo guardar proveedor', error.message);
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
      logError('No se pudo actualizar proveedor', error.message);
      setFeedback(`No se pudo guardar: ${error.message}`, true);
    }
  });

  editCloseButton?.addEventListener('click', closeEditModal);
  editCancelButton?.addEventListener('click', closeEditModal);
  editModal?.addEventListener('click', (event) => {
    if (event.target === editModal) closeEditModal();
  });

  suppliersBody?.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-supplier-actions-toggle]');
    if (toggle) {
      const menu = document.querySelector(`[data-supplier-actions-menu="${toggle.dataset.supplierActionsToggle}"]`);
      const isOpen = menu?.classList.contains('is-open');
      closeActionMenus();
      if (menu && !isOpen) {
        positionActionMenu(toggle, menu);
        menu.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    const button = event.target.closest('button[data-action]');
    if (!button) return;
    closeActionMenus();

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
        logError('No se pudo eliminar proveedor', error.message);
        setFeedback(`No se pudo eliminar: ${error.message}`, true);
      }
    }
  });

  searchInput?.addEventListener('input', () => renderTable(true));
  importCsvButton?.addEventListener('click', () => {
    if (!importCsvInput) return;
    importCsvInput.value = '';
    importCsvInput.click();
  });
  importCsvInput?.addEventListener('change', async () => {
    const file = importCsvInput.files?.[0];
    if (!file) return;
    try {
      setFeedback('Importando proveedores desde CSV...');
      await importSuppliersFromCsv(file);
    } catch (error) {
      logError('No se pudo importar CSV', error.message);
      setFeedback(`No se pudo importar CSV: ${error.message}`, true);
    } finally {
      importCsvInput.value = '';
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.row-actions-menu')) closeActionMenus();
  });
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

  logInfo('Inicializando módulo proveedores', { apiBase: getApiBase(), organizationId: getActiveOrganizationFromSession() });

  loadSupplierTypes()
    .then(() => {
      resetCreateForm();
      resetEditForm();
      return loadSuppliers();
    })
    .catch((error) => {
      logError('Error inicial módulo proveedores', error.message);
      setFeedback(`Error inicial: ${error.message}`, true);
    });
})();
