(function initEnvios() {
  const $ = (id) => document.getElementById(id);
  const apiBase = () => '/api';
  const shipmentsPager = window.TablePaginator?.create({
    key: 'shipments',
    tableBody: $('shipments-body'),
    totalColumns: 6,
    emptyMessage: 'Sin envios registrados',
    rowRenderer: (shipment) => `
      <tr>
        <td>${escapeHtml(shipment.invoice_number)}</td>
        <td>${escapeHtml(shipment.customer_name)}</td>
        <td>${escapeHtml(shipment.method_label)}</td>
        <td>${escapeHtml(shipment.destination)}</td>
        <td><span class="shipment-status-badge shipment-status-badge--${escapeHtml(shipment.status)}">${escapeHtml(shipment.status_label)}</span></td>
        <td>
          <select data-status-select="${shipment.invoice_id}">
            <option value="pending" ${shipment.status === 'pending' ? 'selected' : ''}>Pendiente</option>
            <option value="in_transit" ${shipment.status === 'in_transit' ? 'selected' : ''}>En ruta</option>
            <option value="delivered" ${shipment.status === 'delivered' ? 'selected' : ''}>Entregado</option>
            <option value="cancelled" ${shipment.status === 'cancelled' ? 'selected' : ''}>Cancelado</option>
          </select>
          <a class="btn btn-secondary" href="/facturas.html?invoice_id=${shipment.invoice_id}">Ver factura</a>
        </td>
      </tr>
    `,
  });

  let currentShipments = [];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function feedback(message, error = false, { showInline = true, showToast = true } = {}) {
    $('feedback').textContent = showInline ? message : '';
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
    if (showToast && window.appAlerts?.toast) {
      window.appAlerts.toast(message, error ? 'error' : 'success');
    }
  }

  function orgId() {
    const id = Number($('organization-id')?.value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) {
      throw new Error('No hay organizacion activa. Selecciona una organizacion en la barra superior.');
    }
    return id;
  }

  async function request(path, options) {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      if (contentType.includes('application/json') && text) {
        const payload = JSON.parse(text);
        throw new Error(payload.detail || Object.values(payload).flat().join(' | ') || 'Error de API');
      }
      throw new Error('No fue posible cargar la informacion de envios.');
    }
    return text ? JSON.parse(text) : null;
  }

  function renderOrganizations() {
    const select = $('organization-id');
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    select.innerHTML = organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('');
    if (activeId) select.value = String(activeId);
  }

  function getFilteredShipments() {
    const status = ($('status-filter').value || '').trim();
    const query = ($('search-filter').value || '').trim().toLowerCase();
    return currentShipments.filter((shipment) => {
      const matchesStatus = !status || shipment.status === status;
      const haystack = `${shipment.invoice_number} ${shipment.customer_name} ${shipment.destination} ${shipment.recipient_name} ${shipment.correos_guide || ''}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      return matchesStatus && matchesQuery;
    });
  }

  function renderSummary(shipments) {
    const delivered = shipments.filter((item) => item.status === 'delivered').length;
    const pending = shipments.filter((item) => item.status === 'pending' || item.status === 'in_transit').length;
    $('shipment-count').textContent = String(shipments.length);
    $('shipment-delivered-count').textContent = String(delivered);
    $('shipment-pending-count').textContent = `Pendientes: ${pending}`;
  }

  function renderTable() {
    const shipments = getFilteredShipments();
    renderSummary(shipments);
    shipmentsPager?.update(shipments);
  }

  async function loadShipments() {
    currentShipments = await request(`/invoices/shipments/?organization_id=${orgId()}`);
    renderTable();
  }

  async function updateShipmentStatus(invoiceId, statusValue) {
    await request(`/invoices/${invoiceId}/shipment-status/?organization_id=${orgId()}`, {
      method: 'POST',
      body: JSON.stringify({ status: statusValue }),
    });
    await loadShipments();
    feedback('Estado de envio actualizado.', false, { showInline: false, showToast: true });
  }

  $('reload')?.addEventListener('click', () => loadShipments().catch((error) => feedback(error.message, true)));
  $('clear-filters')?.addEventListener('click', () => {
    $('status-filter').value = '';
    $('search-filter').value = '';
    renderTable();
  });
  $('organization-id')?.addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    loadShipments().catch((error) => feedback(error.message, true));
  });
  $('status-filter')?.addEventListener('change', renderTable);
  $('search-filter')?.addEventListener('input', renderTable);
  $('shipments-body')?.addEventListener('change', (event) => {
    const invoiceId = event.target.dataset.statusSelect;
    if (!invoiceId) return;
    updateShipmentStatus(invoiceId, event.target.value).catch((error) => feedback(error.message, true));
  });

  renderOrganizations();
  loadShipments().catch((error) => feedback(error.message, true));
})();
