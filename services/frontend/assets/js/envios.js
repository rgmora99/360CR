(function initEnvios() {
  const $ = (id) => document.getElementById(id);
  const apiBase = () => '/api';
  const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pendiente' },
    { value: 'in_transit', label: 'En ruta' },
    { value: 'delivered', label: 'Entregado' },
    { value: 'cancelled', label: 'Cancelado' },
  ];

  let currentShipments = [];
  let activeShipment = null;

  const shipmentsPager = window.TablePaginator?.create({
    key: 'shipments',
    tableBody: $('shipments-body'),
    totalColumns: 5,
    emptyMessage: 'Sin envios registrados',
    rowRenderer: (shipment) => renderShipmentRow(shipment),
  });

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatDate(value) {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || 'Sin fecha';
    return date.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function formatMoney(value, currency = 'CRC') {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return `${currency} 0.00`;
    return `${currency} ${amount.toFixed(2)}`;
  }

  function statusLabel(status) {
    return STATUS_OPTIONS.find((option) => option.value === status)?.label || status || 'Sin estado';
  }

  function feedback(message, error = false, { showInline = false, showToast = true } = {}) {
    if ($('feedback')) {
      $('feedback').textContent = showInline ? message : '';
      $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
    }
    if (showToast && message && window.appAlerts?.toast) {
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
      const haystack = [
        shipment.invoice_number,
        shipment.customer_name,
        shipment.destination,
        shipment.recipient_name,
        shipment.phone_primary,
        shipment.correos_guide,
        shipment.correos_branch,
      ].join(' ').toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }

  function renderSummary(shipments) {
    const counts = shipments.reduce(
      (acc, shipment) => {
        acc[shipment.status] = (acc[shipment.status] || 0) + 1;
        return acc;
      },
      { pending: 0, in_transit: 0, delivered: 0, cancelled: 0 },
    );
    $('shipments-pending-count').textContent = String(counts.pending || 0);
    $('shipments-transit-count').textContent = String(counts.in_transit || 0);
    $('shipments-delivered-count').textContent = String(counts.delivered || 0);
    $('shipments-cancelled-count').textContent = String(counts.cancelled || 0);
  }

  function renderTable() {
    const shipments = getFilteredShipments();
    shipmentsPager?.update(shipments);
    renderSummary(currentShipments);
    $('shipments-visible-count').textContent = `${shipments.length} envio${shipments.length === 1 ? '' : 's'} visible${shipments.length === 1 ? '' : 's'}`;
  }

  function renderShipmentRow(shipment) {
    const guide = shipment.correos_guide || shipment.correos_branch || '';
    const isDelivered = shipment.status === 'delivered';
    const statusWarning = shipment.method === 'correos_cr' && shipment.status !== 'delivered' && !shipment.correos_guide
      ? '<span class="shipment-row-warning">Guia pendiente</span>'
      : '';
    return `
      <tr>
        <td>
          <strong>${escapeHtml(shipment.invoice_number)}</strong>
          <span class="shipment-row-meta">${escapeHtml(formatDate(shipment.issue_date))} · ${escapeHtml(formatMoney(shipment.total, shipment.currency || 'CRC'))}</span>
        </td>
        <td>
          <strong>${escapeHtml(shipment.customer_name)}</strong>
          <span class="shipment-row-meta">${escapeHtml(shipment.recipient_name || 'Sin receptor')} · ${escapeHtml(shipment.destination || 'Sin destino')}</span>
          ${shipment.phone_primary ? `<span class="shipment-row-meta">Tel. ${escapeHtml(shipment.phone_primary)}</span>` : ''}
        </td>
        <td>
          <strong>${escapeHtml(shipment.method_label || 'Sin metodo')}</strong>
          <span class="shipment-row-meta">${guide ? escapeHtml(guide) : 'Sin guia o referencia'}</span>
          ${statusWarning}
        </td>
        <td>
          <span class="shipment-status-badge shipment-status-badge--${escapeHtml(shipment.status)}">${escapeHtml(statusLabel(shipment.status))}</span>
          <span class="shipment-row-meta">${shipment.status_updated_at ? `Actualizado ${escapeHtml(formatDate(shipment.status_updated_at))}` : 'Sin actualizacion'}</span>
        </td>
        <td>
          <div class="shipment-actions">
            <button class="btn btn-primary" type="button" data-shipment-status="${shipment.invoice_id}" ${isDelivered ? 'disabled' : ''}>${isDelivered ? 'Finalizado' : 'Actualizar'}</button>
            <a class="btn btn-secondary" href="/facturas.html?invoice_id=${shipment.invoice_id}">Ver factura</a>
          </div>
        </td>
      </tr>
    `;
  }

  async function loadShipments() {
    currentShipments = await request(`/invoices/shipments/?organization_id=${orgId()}`);
    renderTable();
  }

  function renderModalDetail(shipment) {
    $('shipment-status-modal-title').textContent = `Envio ${shipment.invoice_number}`;
    $('shipment-status-modal-subtitle').textContent = `${shipment.customer_name} · ${shipment.destination || 'Sin destino'}`;
    $('shipment-status-detail').innerHTML = [
      ['Estado actual', statusLabel(shipment.status)],
      ['Metodo', shipment.method_label || 'Sin metodo'],
      ['Receptor', shipment.recipient_name || 'Sin receptor'],
      ['Telefono', shipment.phone_primary || 'Sin telefono'],
      ['Destino', shipment.destination || 'Sin destino'],
      ['Direccion', shipment.address_line_1 || 'Sin direccion'],
      ['Guia / sucursal', shipment.correos_guide || shipment.correos_branch || 'Sin referencia'],
      ['Ultima actualizacion', shipment.status_updated_at ? formatDate(shipment.status_updated_at) : 'Sin actualizacion'],
    ]
      .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join('');
  }

  function syncModalValidation() {
    if (!activeShipment) return;
    const nextStatus = $('shipment-status-value').value;
    const deliveredWithoutCorreosGuide =
      activeShipment.method === 'correos_cr' && nextStatus === 'delivered' && !String(activeShipment.correos_guide || '').trim();
    $('shipment-status-save').disabled = deliveredWithoutCorreosGuide;
    $('shipment-status-help').textContent = deliveredWithoutCorreosGuide
      ? 'Para marcar como entregado por Correos primero registra la guia o referencia desde la factura.'
      : nextStatus === activeShipment.status
        ? 'El estado seleccionado es igual al estado actual. Puedes guardar solo si necesitas registrar una nota.'
        : 'El cambio actualizara la trazabilidad del envio.';
    $('shipment-status-help').classList.toggle('is-error', deliveredWithoutCorreosGuide);
  }

  function openStatusModal(invoiceId) {
    activeShipment = currentShipments.find((shipment) => Number(shipment.invoice_id) === Number(invoiceId)) || null;
    if (!activeShipment) {
      feedback('No se encontro el envio seleccionado.', true);
      return;
    }
    if (activeShipment.status === 'delivered') {
      feedback('El envio ya fue entregado y no se puede modificar.', true);
      return;
    }
    renderModalDetail(activeShipment);
    $('shipment-status-invoice-id').value = String(activeShipment.invoice_id);
    $('shipment-status-value').value = activeShipment.status || 'pending';
    $('shipment-status-note').value = '';
    syncModalValidation();
    $('shipment-status-modal').classList.add('is-open');
    $('shipment-status-modal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    window.setTimeout(() => $('shipment-status-value')?.focus(), 20);
  }

  function closeStatusModal() {
    $('shipment-status-modal').classList.remove('is-open');
    $('shipment-status-modal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    activeShipment = null;
  }

  async function updateShipmentStatus(invoiceId, statusValue, statusNote) {
    const shipment = currentShipments.find((item) => Number(item.invoice_id) === Number(invoiceId));
    if (shipment?.status === 'delivered') {
      throw new Error('El envio ya fue entregado y no se puede modificar.');
    }
    const updated = await request(`/invoices/${invoiceId}/shipment-status/?organization_id=${orgId()}`, {
      method: 'POST',
      body: JSON.stringify({ status: statusValue, status_note: statusNote }),
    });
    currentShipments = currentShipments.map((shipment) => (Number(shipment.invoice_id) === Number(invoiceId) ? updated : shipment));
    renderTable();
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
  $('shipments-body')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-shipment-status]');
    if (!button) return;
    openStatusModal(button.dataset.shipmentStatus);
  });
  $('shipment-status-value')?.addEventListener('change', syncModalValidation);
  $('shipment-status-close')?.addEventListener('click', closeStatusModal);
  $('shipment-status-cancel')?.addEventListener('click', closeStatusModal);
  $('shipment-status-modal')?.addEventListener('click', (event) => {
    if (event.target === $('shipment-status-modal')) closeStatusModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('shipment-status-modal')?.classList.contains('is-open')) {
      closeStatusModal();
    }
  });
  $('shipment-status-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!$('shipment-status-invoice-id').value || $('shipment-status-save').disabled) return;
    try {
      $('shipment-status-save').disabled = true;
      await updateShipmentStatus(
        $('shipment-status-invoice-id').value,
        $('shipment-status-value').value,
        $('shipment-status-note').value.trim(),
      );
      closeStatusModal();
    } catch (error) {
      feedback(error.message, true);
      syncModalValidation();
    }
  });

  renderOrganizations();
  loadShipments().catch((error) => feedback(error.message, true));
})();
