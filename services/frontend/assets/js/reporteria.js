(function initReporteria() {
  const $ = (id) => document.getElementById(id);
  const apiBase = () => '/api';
  const state = {
    invoices: [],
    receivables: [],
    shipments: [],
    purchases: [],
    agenda: [],
    dashboard: null,
    rows: [],
    columns: [],
  };
  const reportPager = window.TablePaginator?.create({
    key: 'reporteria',
    tableBody: $('report-body'),
    totalColumns: 8,
    emptyMessage: 'Sin datos para los filtros seleccionados.',
    defaultPageSize: 10,
    rowRenderer: (row) => `<tr>${state.columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join('')}</tr>`,
  });

  const statusOptions = {
    sales: [
      ['', 'Todos'],
      ['issued', 'Emitida'],
      ['sent', 'Enviada'],
      ['paid', 'Pagada'],
      ['overdue', 'Vencida'],
      ['void', 'Anulada'],
    ],
    receivables: [
      ['', 'Todos'],
      ['pending', 'Pendiente'],
      ['partial', 'Parcial'],
      ['overdue', 'Vencida'],
      ['paid', 'Pagada'],
    ],
    shipments: [
      ['', 'Todos'],
      ['pending', 'Pendiente'],
      ['in_transit', 'En ruta'],
      ['delivered', 'Entregado'],
      ['cancelled', 'Cancelado'],
    ],
    purchases: [['', 'Todos']],
    agenda: [
      ['', 'Todos'],
      ['pending', 'Pendiente'],
      ['overdue_unbilled', 'Vencidas sin facturar'],
      ['done', 'Completado'],
      ['cancelled', 'Cancelado'],
    ],
    executive: [['', 'Todos']],
  };

  const labels = {
    payment: { '01': 'Efectivo', '02': 'Tarjeta', '03': 'Transferencia', '04': 'SINPE Movil', '05': 'A plazos' },
    document: { '01': 'Factura electronica', '03': 'Nota de credito' },
    salesStatus: { draft: 'Borrador', issued: 'Emitida', sent: 'Enviada', paid: 'Pagada', overdue: 'Vencida', void: 'Anulada' },
    receivableStatus: { pending: 'Pendiente', partial: 'Parcial', overdue: 'Vencida', paid: 'Pagada', due_today: 'Vence hoy', not_applicable: 'N/A' },
    agendaStatus: { pending: 'Pendiente', done: 'Completado', cancelled: 'Cancelado' },
    report: { sales: 'Ventas y facturas', receivables: 'Cuentas por cobrar', shipments: 'Envios', purchases: 'Compras', agenda: 'Agenda', executive: 'Resumen ejecutivo' },
  };

  function orgId() {
    const id = Number($('organization-id')?.value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) throw new Error('No hay organizacion activa.');
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
    if (!response.ok) throw new Error(text || 'Error de API');
    if (!text) return null;
    if (!contentType.includes('application/json')) throw new Error('Respuesta no JSON.');
    return JSON.parse(text);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatMoney(value, currency = 'CRC') {
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: String(currency || 'CRC').toUpperCase() }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('es-CR', { dateStyle: 'medium' });
  }

  function dateOnly(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  function inDateRange(value) {
    const current = dateOnly(value);
    const from = $('date-from').value;
    const to = $('date-to').value;
    return (!from || current >= from) && (!to || current <= to);
  }

  function groupCount(rows, keyFn) {
    return rows.reduce((acc, row) => {
      const key = keyFn(row) || 'Sin clasificar';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function groupSum(rows, keyFn, valueFn) {
    return rows.reduce((acc, row) => {
      const key = keyFn(row) || 'Sin clasificar';
      acc[key] = (acc[key] || 0) + Number(valueFn(row) || 0);
      return acc;
    }, {});
  }

  function renderCharts(charts) {
    $('charts-grid').innerHTML = charts
      .map((chart) => {
        const entries = Object.entries(chart.data || {}).sort((left, right) => Number(right[1]) - Number(left[1])).slice(0, 8);
        const max = Math.max(...entries.map((entry) => Number(entry[1])), 1);
        const rows = entries
          .map(([label, value]) => {
            const width = Math.max(4, (Number(value) / max) * 100);
            return `
              <div class="report-chart-row">
                <span>${escapeHtml(label)}</span>
                <div class="report-chart-track"><div style="width: ${width.toFixed(2)}%"></div></div>
                <strong>${escapeHtml(chart.formatter ? chart.formatter(value) : value)}</strong>
              </div>
            `;
          })
          .join('');
        return `
          <article class="card report-chart-card">
            <div class="report-chart-header">
              <h3>${escapeHtml(chart.title)}</h3>
              <p class="subtitle">${escapeHtml(chart.caption || '')}</p>
            </div>
            <div class="report-chart-body">${rows || '<p class="subtitle">Sin datos para graficar.</p>'}</div>
          </article>
        `;
      })
      .join('');
  }

  function effectiveStatus(invoice) {
    return invoice.effective_status || invoice.status || 'issued';
  }

  function setFeedback(message, error = false) {
    $('feedback').textContent = message;
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
    if (message && window.appAlerts?.toast) window.appAlerts.toast(message, error ? 'error' : 'success');
  }

  function renderOrganizations() {
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML = organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('');
    if (activeId) $('organization-id').value = String(activeId);
  }

  function defaultMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    $('date-from').value = start.toISOString().slice(0, 10);
    $('date-to').value = end.toISOString().slice(0, 10);
  }

  function syncStatusOptions() {
    const type = $('report-type').value;
    $('status-filter').innerHTML = (statusOptions[type] || statusOptions.sales)
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join('');
    document.querySelectorAll('.report-sales-filter').forEach((node) => {
      node.classList.toggle('hidden', type !== 'sales');
    });
  }

  async function loadData() {
    const organizationId = orgId();
    const from = $('date-from').value;
    const to = $('date-to').value;
    const dashboardPath = `/invoices/sales-dashboard/?organization_id=${organizationId}&period=custom&date_from=${from}&date_to=${to}`;
    const [invoices, receivables, shipments, purchases, agenda, dashboard] = await Promise.all([
      request(`/invoices/?organization_id=${organizationId}`),
      request(`/invoices/accounts-receivable/?organization_id=${organizationId}`),
      request(`/invoices/shipments/?organization_id=${organizationId}`),
      request(`/purchases/?organization_id=${organizationId}`).catch(() => []),
      request(`/agenda-events/?organization_id=${organizationId}`).catch(() => []),
      request(dashboardPath).catch(() => null),
    ]);
    state.invoices = Array.isArray(invoices) ? invoices : [];
    state.receivables = Array.isArray(receivables) ? receivables : [];
    state.shipments = Array.isArray(shipments) ? shipments : [];
    state.purchases = Array.isArray(purchases) ? purchases : [];
    state.agenda = Array.isArray(agenda) ? agenda : [];
    state.dashboard = dashboard;
  }

  function visibleSales() {
    const status = $('status-filter').value;
    const payment = $('payment-filter').value;
    const documentType = $('document-filter').value;
    const query = $('search-filter').value.trim().toLowerCase();
    return state.invoices.filter((invoice) => {
      const haystack = `${invoice.invoice_number || ''} ${invoice.customer_name || ''} ${invoice.notes || ''}`.toLowerCase();
      return (
        inDateRange(invoice.issue_date) &&
        (!status || effectiveStatus(invoice) === status) &&
        (!payment || invoice.payment_method === payment) &&
        (!documentType || invoice.document_type === documentType) &&
        (!query || haystack.includes(query))
      );
    });
  }

  function visibleReceivables() {
    const status = $('status-filter').value;
    const query = $('search-filter').value.trim().toLowerCase();
    return state.receivables.filter((invoice) => {
      const haystack = `${invoice.invoice_number || ''} ${invoice.customer_name || ''} ${invoice.notes || ''}`.toLowerCase();
      return inDateRange(invoice.issue_date) && (!status || invoice.receivable_status === status) && (!query || haystack.includes(query));
    });
  }

  function visibleShipments() {
    const status = $('status-filter').value;
    const query = $('search-filter').value.trim().toLowerCase();
    return state.shipments.filter((shipment) => {
      const haystack = `${shipment.invoice_number || ''} ${shipment.customer_name || ''} ${shipment.destination || ''} ${shipment.recipient_name || ''} ${shipment.correos_guide || ''}`.toLowerCase();
      const invoice = state.invoices.find((item) => Number(item.id) === Number(shipment.invoice_id));
      return (!invoice || inDateRange(invoice.issue_date)) && (!status || shipment.status === status) && (!query || haystack.includes(query));
    });
  }

  function visiblePurchases() {
    const query = $('search-filter').value.trim().toLowerCase();
    return state.purchases.filter((purchase) => {
      const haystack = `${purchase.supplier_name || ''} ${purchase.invoice_number || ''} ${purchase.numeric_key || ''}`.toLowerCase();
      return inDateRange(purchase.issue_date) && (!query || haystack.includes(query));
    });
  }

  function getAgendaEffectiveStatus(event) {
    if (event.invoice && event.status === 'pending') return 'done';
    return event.status || 'pending';
  }

  function isPastEvent(event) {
    const startsAt = new Date(event.starts_at);
    return !Number.isNaN(startsAt.getTime()) && startsAt < new Date();
  }

  function isOverdueUnbilled(event) {
    return Boolean(event.service) && getAgendaEffectiveStatus(event) !== 'cancelled' && !event.invoice && isPastEvent(event);
  }

  function visibleAgenda() {
    const status = $('status-filter').value;
    const query = $('search-filter').value.trim().toLowerCase();
    return state.agenda.filter((event) => {
      const haystack = `${event.title || ''} ${event.description || ''} ${event.service_name || ''} ${event.collaborator_email || ''}`.toLowerCase();
      const effectiveStatus = getAgendaEffectiveStatus(event);
      const matchesStatus = !status || (status === 'overdue_unbilled' ? isOverdueUnbilled(event) : effectiveStatus === status);
      return inDateRange(event.starts_at) && matchesStatus && (!query || haystack.includes(query));
    });
  }

  function renderSummaryCards(cards) {
    $('summary-grid').innerHTML = cards
      .map(
        (card, index) => `
          <article class="card invoice-summary-card ${index === 0 ? 'invoice-summary-card--primary' : ''}">
            <span class="invoice-summary-card__eyebrow">${escapeHtml(card.label)}</span>
            <strong class="invoice-summary-card__value">${escapeHtml(card.value)}</strong>
            <p class="subtitle">${escapeHtml(card.caption)}</p>
          </article>
        `,
      )
      .join('');
  }

  function setTable(columns, rows) {
    state.columns = columns;
    state.rows = rows;
    $('report-head').innerHTML = `<tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>`;
    if (reportPager) {
      reportPager.update(rows, { resetPage: true });
    } else {
      $('report-body').innerHTML =
        rows
          .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join('')}</tr>`)
          .join('') || `<tr><td colspan="${columns.length}">Sin datos para los filtros seleccionados.</td></tr>`;
    }
    $('report-row-count').textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}`;
  }

  function renderSalesReport() {
    const rows = visibleSales();
    const signedTotal = rows.reduce((sum, invoice) => sum + (invoice.document_type === '03' ? -1 : 1) * Number(invoice.total || 0), 0);
    const topCustomer = state.dashboard?.by_customer?.[0];
    const topService = state.dashboard?.by_service?.[0];
    renderSummaryCards([
      { label: 'Ingreso del periodo', value: formatMoney(signedTotal), caption: 'Notas de credito restadas del total.' },
      { label: 'Facturas visibles', value: String(rows.length), caption: `Promedio: ${formatMoney(rows.length ? signedTotal / rows.length : 0)}.` },
      { label: 'Cliente destacado', value: topCustomer?.customer_name || '-', caption: topCustomer ? `${formatMoney(topCustomer.total)} en ${topCustomer.count} factura(s).` : 'Sin datos para el periodo.' },
      { label: 'Servicio / producto destacado', value: topService?.product_name || '-', caption: topService ? `${formatMoney(topService.total)} en ${Number(topService.quantity || 0).toFixed(2)} unidades.` : 'Sin datos para el periodo.' },
    ]);
    renderCharts([
      {
        title: 'Ventas por medio de pago',
        caption: 'Distribucion del monto vendido.',
        data: groupSum(rows, (row) => labels.payment[row.payment_method] || row.payment_method, (row) => (row.document_type === '03' ? -1 : 1) * Number(row.total || 0)),
        formatter: (value) => formatMoney(value),
      },
      {
        title: 'Facturas por estado',
        caption: 'Cantidad de documentos visibles.',
        data: groupCount(rows, (row) => labels.salesStatus[effectiveStatus(row)] || effectiveStatus(row)),
      },
    ]);
    $('report-title').textContent = 'Ventas y facturas';
    $('report-caption').textContent = 'Facturas emitidas segun filtros de fecha, estado, documento, pago y busqueda.';
    setTable(
      [
        { label: 'Numero', value: (row) => row.invoice_number },
        { label: 'Cliente', value: (row) => row.customer_name },
        { label: 'Documento', value: (row) => labels.document[row.document_type] || row.document_type },
        { label: 'Estado', value: (row) => labels.salesStatus[effectiveStatus(row)] || effectiveStatus(row) },
        { label: 'Medio pago', value: (row) => labels.payment[row.payment_method] || row.payment_method },
        { label: 'Total', value: (row) => formatMoney(row.total, row.currency) },
        { label: 'Fecha', value: (row) => formatDate(row.issue_date) },
      ],
      rows,
    );
  }

  function renderReceivablesReport() {
    const rows = visibleReceivables();
    const balance = rows.reduce((sum, invoice) => sum + Number(invoice.receivable_amount_due || 0), 0);
    const paid = rows.reduce((sum, invoice) => sum + Number(invoice.receivable_amount_paid || 0), 0);
    const overdue = rows.filter((invoice) => invoice.receivable_status === 'overdue');
    renderSummaryCards([
      { label: 'Saldo pendiente', value: formatMoney(balance), caption: 'Cartera actual segun filtros.' },
      { label: 'Vencidas', value: String(overdue.length), caption: overdue.length ? `${overdue.length} cuenta(s) con mora activa.` : 'Sin cuentas vencidas.' },
      { label: 'Cobrado', value: formatMoney(paid), caption: `Abonos registrados en ${rows.length} venta(s) a plazo.` },
    ]);
    renderCharts([
      {
        title: 'Cartera por estado',
        caption: 'Saldo pendiente agrupado.',
        data: groupSum(rows, (row) => labels.receivableStatus[row.receivable_status] || row.receivable_status, (row) => row.receivable_amount_due),
        formatter: (value) => formatMoney(value),
      },
      {
        title: 'Clientes con mayor saldo',
        caption: 'Top de cuentas pendientes.',
        data: groupSum(rows, (row) => row.customer_name, (row) => row.receivable_amount_due),
        formatter: (value) => formatMoney(value),
      },
    ]);
    $('report-title').textContent = 'Cuentas por cobrar';
    $('report-caption').textContent = 'Cartera por cobrar filtrada por fecha de factura, estado y busqueda.';
    setTable(
      [
        { label: 'Factura', value: (row) => row.invoice_number },
        { label: 'Cliente', value: (row) => row.customer_name },
        { label: 'Total', value: (row) => formatMoney(row.total, row.currency) },
        { label: 'Abonado', value: (row) => formatMoney(row.receivable_amount_paid, row.currency) },
        { label: 'Saldo', value: (row) => formatMoney(row.receivable_amount_due, row.currency) },
        { label: 'Proximo venc.', value: (row) => formatDate(row.receivable_next_due_date || row.receivable_final_due_date) },
        { label: 'Estado', value: (row) => labels.receivableStatus[row.receivable_status] || row.receivable_status },
      ],
      rows,
    );
  }

  function renderShipmentsReport() {
    const rows = visibleShipments();
    const delivered = rows.filter((item) => item.status === 'delivered').length;
    const pending = rows.filter((item) => item.status === 'pending' || item.status === 'in_transit').length;
    renderSummaryCards([
      { label: 'Envios visibles', value: String(rows.length), caption: 'Despachos segun filtros actuales.' },
      { label: 'Entregados', value: String(delivered), caption: `Pendientes o en ruta: ${pending}.` },
    ]);
    renderCharts([
      {
        title: 'Envios por estado',
        caption: 'Seguimiento operativo de despachos.',
        data: groupCount(rows, (row) => row.status_label || row.status),
      },
      {
        title: 'Envios por metodo',
        caption: 'Canales de entrega utilizados.',
        data: groupCount(rows, (row) => row.method_label || row.method),
      },
    ]);
    $('report-title').textContent = 'Envios';
    $('report-caption').textContent = 'Despachos filtrados por estado, fecha de factura y busqueda.';
    setTable(
      [
        { label: 'Factura', value: (row) => row.invoice_number },
        { label: 'Cliente', value: (row) => row.customer_name },
        { label: 'Metodo', value: (row) => row.method_label },
        { label: 'Destino', value: (row) => row.destination },
        { label: 'Recibe', value: (row) => row.recipient_name || '-' },
        { label: 'Estado', value: (row) => row.status_label || row.status },
      ],
      rows,
    );
  }

  function renderPurchasesReport() {
    const rows = visiblePurchases();
    const totalsByCurrency = rows.reduce((acc, purchase) => {
      const currency = purchase.currency || 'CRC';
      if (!acc[currency]) acc[currency] = { total: 0, tax: 0, count: 0 };
      acc[currency].total += Number(purchase.total || 0);
      acc[currency].tax += Number(purchase.tax_total || 0);
      acc[currency].count += 1;
      return acc;
    }, {});
    const preferredCurrency = totalsByCurrency.CRC ? 'CRC' : Object.keys(totalsByCurrency)[0] || 'CRC';
    const summary = totalsByCurrency[preferredCurrency] || { total: 0, tax: 0, count: 0 };
    renderSummaryCards([
      { label: 'Gasto visible', value: formatMoney(summary.total, preferredCurrency), caption: 'Compras segun filtros actuales.' },
      { label: 'IVA registrado', value: formatMoney(summary.tax, preferredCurrency), caption: 'Impuesto acumulado en compras visibles.' },
      { label: 'Compras visibles', value: String(rows.length), caption: `Promedio: ${formatMoney(summary.count ? summary.total / summary.count : 0, preferredCurrency)}.` },
    ]);
    renderCharts([
      {
        title: 'Compras por proveedor',
        caption: 'Proveedores con mayor monto.',
        data: groupSum(rows, (row) => row.supplier_name, (row) => row.total),
        formatter: (value) => formatMoney(value, preferredCurrency),
      },
      {
        title: 'Compras por mes',
        caption: 'Tendencia de gasto visible.',
        data: groupSum(rows, (row) => String(row.issue_date || '').slice(0, 7), (row) => row.total),
        formatter: (value) => formatMoney(value, preferredCurrency),
      },
    ]);
    $('report-title').textContent = 'Compras';
    $('report-caption').textContent = 'Compras registradas filtradas por fecha y busqueda.';
    setTable(
      [
        { label: 'Fecha', value: (row) => row.issue_date },
        { label: 'Proveedor', value: (row) => row.supplier_name },
        { label: 'Factura', value: (row) => row.invoice_number },
        { label: 'Subtotal', value: (row) => formatMoney(row.subtotal, row.currency) },
        { label: 'IVA', value: (row) => formatMoney(row.tax_total, row.currency) },
        { label: 'Total', value: (row) => formatMoney(row.total, row.currency) },
      ],
      rows,
    );
  }

  function renderAgendaReport() {
    const rows = visibleAgenda();
    const overdue = rows.filter(isOverdueUnbilled).length;
    const done = rows.filter((row) => getAgendaEffectiveStatus(row) === 'done').length;
    const pending = rows.filter((row) => getAgendaEffectiveStatus(row) === 'pending').length;
    renderSummaryCards([
      { label: 'Eventos visibles', value: String(rows.length), caption: 'Citas segun filtros actuales.' },
      { label: 'Pendientes', value: String(pending), caption: `${overdue} vencida(s) sin facturar.` },
      { label: 'Completados', value: String(done), caption: 'Incluye eventos ya facturados.' },
    ]);
    renderCharts([
      {
        title: 'Agenda por estado',
        caption: 'Carga operativa de citas.',
        data: groupCount(rows, (row) => (isOverdueUnbilled(row) ? 'Vencida sin facturar' : labels.agendaStatus[getAgendaEffectiveStatus(row)] || getAgendaEffectiveStatus(row))),
      },
      {
        title: 'Agenda por servicio',
        caption: 'Servicios mas agendados.',
        data: groupCount(rows, (row) => row.service_name || 'Sin servicio'),
      },
    ]);
    $('report-title').textContent = 'Agenda';
    $('report-caption').textContent = 'Eventos programados filtrados por fecha, estado y busqueda.';
    setTable(
      [
        { label: 'Titulo', value: (row) => row.title },
        { label: 'Servicio', value: (row) => row.service_name || '-' },
        { label: 'Colaborador', value: (row) => row.collaborator_email || '-' },
        { label: 'Inicio', value: (row) => formatDate(row.starts_at) },
        { label: 'Estado', value: (row) => (isOverdueUnbilled(row) ? 'Vencida sin facturar' : labels.agendaStatus[getAgendaEffectiveStatus(row)] || getAgendaEffectiveStatus(row)) },
        { label: 'Factura', value: (row) => row.invoice || '-' },
      ],
      rows,
    );
  }

  function renderExecutiveReport() {
    const sales = visibleSales();
    const receivables = visibleReceivables();
    const shipments = visibleShipments();
    const purchases = visiblePurchases();
    const agenda = visibleAgenda();
    const salesTotal = sales.reduce((sum, invoice) => sum + (invoice.document_type === '03' ? -1 : 1) * Number(invoice.total || 0), 0);
    const balance = receivables.reduce((sum, invoice) => sum + Number(invoice.receivable_amount_due || 0), 0);
    const paid = receivables.reduce((sum, invoice) => sum + Number(invoice.receivable_amount_paid || 0), 0);
    const purchaseTotal = purchases.reduce((sum, purchase) => sum + Number(purchase.total || 0), 0);
    const overdue = receivables.filter((invoice) => invoice.receivable_status === 'overdue').length;
    const delivered = shipments.filter((shipment) => shipment.status === 'delivered').length;
    const overdueAgenda = agenda.filter(isOverdueUnbilled).length;
    const rows = [
      { area: 'Ventas', indicador: 'Ingreso del periodo', valor: formatMoney(salesTotal), detalle: `${sales.length} factura(s) visibles` },
      { area: 'Ventas', indicador: 'Promedio de factura', valor: formatMoney(sales.length ? salesTotal / sales.length : 0), detalle: 'Calculado con documentos visibles' },
      { area: 'Cuentas por cobrar', indicador: 'Saldo pendiente', valor: formatMoney(balance), detalle: `${overdue} cuenta(s) vencidas` },
      { area: 'Cuentas por cobrar', indicador: 'Cobrado', valor: formatMoney(paid), detalle: `${receivables.length} venta(s) a plazo` },
      { area: 'Envios', indicador: 'Despachos visibles', valor: String(shipments.length), detalle: `${delivered} entregado(s)` },
      { area: 'Compras', indicador: 'Gasto del periodo', valor: formatMoney(purchaseTotal), detalle: `${purchases.length} compra(s) visibles` },
      { area: 'Agenda', indicador: 'Eventos visibles', valor: String(agenda.length), detalle: `${overdueAgenda} vencida(s) sin facturar` },
    ];
    renderSummaryCards([
      { label: 'Ingreso del periodo', value: formatMoney(salesTotal), caption: `${sales.length} documento(s) visibles.` },
      { label: 'Saldo pendiente', value: formatMoney(balance), caption: `${overdue} cuenta(s) vencidas.` },
      { label: 'Gasto del periodo', value: formatMoney(purchaseTotal), caption: `${purchases.length} compra(s) visibles.` },
      { label: 'Envios visibles', value: String(shipments.length), caption: `${delivered} entregado(s).` },
    ]);
    renderCharts([
      {
        title: 'Resumen financiero',
        caption: 'Comparativo de montos principales.',
        data: { Ingresos: salesTotal, Compras: purchaseTotal, 'Saldo CxC': balance, Cobrado: paid },
        formatter: (value) => formatMoney(value),
      },
      {
        title: 'Actividad operativa',
        caption: 'Volumen de registros visibles.',
        data: { Facturas: sales.length, Compras: purchases.length, Envios: shipments.length, Agenda: agenda.length },
      },
    ]);
    $('report-title').textContent = 'Resumen ejecutivo';
    $('report-caption').textContent = 'Lectura consolidada de ventas, cartera y envios.';
    setTable(
      [
        { label: 'Area', value: (row) => row.area },
        { label: 'Indicador', value: (row) => row.indicador },
        { label: 'Valor', value: (row) => row.valor },
        { label: 'Detalle', value: (row) => row.detalle },
      ],
      rows,
    );
  }

  function renderReport() {
    const type = $('report-type').value;
    if (type === 'receivables') return renderReceivablesReport();
    if (type === 'shipments') return renderShipmentsReport();
    if (type === 'purchases') return renderPurchasesReport();
    if (type === 'agenda') return renderAgendaReport();
    if (type === 'executive') return renderExecutiveReport();
    return renderSalesReport();
  }

  function exportRowsForFile() {
    return state.rows.map((row) => Object.fromEntries(state.columns.map((column) => [column.label, column.value(row)])));
  }

  function selectedText(id) {
    const input = $(id);
    return input?.selectedOptions?.[0]?.textContent || input?.value || '-';
  }

  function exportSummaryCardsForFile() {
    return [...document.querySelectorAll('#summary-grid .invoice-summary-card')].map((card) => ({
      label: card.querySelector('.invoice-summary-card__eyebrow')?.textContent || '',
      value: card.querySelector('.invoice-summary-card__value')?.textContent || '',
      caption: card.querySelector('.subtitle')?.textContent || '',
    }));
  }

  function escapeXml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  function columnName(index) {
    let name = '';
    let current = index;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      current = Math.floor((current - 1) / 26);
    }
    return name;
  }

  function crc32(bytes) {
    if (!crc32.table) {
      crc32.table = Array.from({ length: 256 }, (_, index) => {
        let current = index;
        for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
        return current >>> 0;
      });
    }
    let crc = 0xffffffff;
    bytes.forEach((byte) => {
      crc = crc32.table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    });
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosDate, dosTime };
  }

  function uint16(value) {
    return [value & 0xff, (value >>> 8) & 0xff];
  }

  function uint32(value) {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
  }

  function createZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = encoder.encode(file.content);
      const checksum = crc32(dataBytes);
      const { dosDate, dosTime } = dosDateTime();
      const localHeader = new Uint8Array([
        ...uint32(0x04034b50),
        ...uint16(20),
        ...uint16(0x0800),
        ...uint16(0),
        ...uint16(dosTime),
        ...uint16(dosDate),
        ...uint32(checksum),
        ...uint32(dataBytes.length),
        ...uint32(dataBytes.length),
        ...uint16(nameBytes.length),
        ...uint16(0),
      ]);
      localParts.push(localHeader, nameBytes, dataBytes);
      centralParts.push(
        new Uint8Array([
          ...uint32(0x02014b50),
          ...uint16(20),
          ...uint16(20),
          ...uint16(0x0800),
          ...uint16(0),
          ...uint16(dosTime),
          ...uint16(dosDate),
          ...uint32(checksum),
          ...uint32(dataBytes.length),
          ...uint32(dataBytes.length),
          ...uint16(nameBytes.length),
          ...uint16(0),
          ...uint16(0),
          ...uint16(0),
          ...uint16(0),
          ...uint32(0),
          ...uint32(offset),
        ]),
        nameBytes,
      );
      offset += localHeader.length + nameBytes.length + dataBytes.length;
    });
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array([
      ...uint32(0x06054b50),
      ...uint16(0),
      ...uint16(0),
      ...uint16(files.length),
      ...uint16(files.length),
      ...uint32(centralSize),
      ...uint32(offset),
      ...uint16(0),
    ]);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function createXlsxBlob({ title, caption, generatedAt, filters, summaryCards, rows, columnCount }) {
    const merges = [];
    const worksheetRows = [];
    const pushRow = (cells, height) => {
      const rowIndex = worksheetRows.length + 1;
      let columnIndex = 1;
      const xmlCells = cells
        .map((cell) => {
          const startColumn = columnIndex;
          const span = Math.max(Number(cell.colspan || 1), 1);
          const ref = `${columnName(startColumn)}${rowIndex}`;
          if (span > 1) merges.push(`${ref}:${columnName(startColumn + span - 1)}${rowIndex}`);
          columnIndex += span;
          return `<c r="${ref}" t="inlineStr" s="${cell.style || 0}"><is><t>${escapeXml(cell.value)}</t></is></c>`;
        })
        .join('');
      const rowHeight = height ? ` ht="${height}" customHeight="1"` : '';
      worksheetRows.push(`<row r="${rowIndex}"${rowHeight}>${xmlCells}</row>`);
    };
    const spacer = () => pushRow([{ value: '', colspan: columnCount, style: 0 }], 8);

    pushRow([{ value: `360CR - ${title}`, colspan: columnCount, style: 1 }], 28);
    pushRow([{ value: `${caption} | Generado: ${generatedAt} | Registros: ${rows.length}`, colspan: columnCount, style: 2 }], 22);
    spacer();
    pushRow([{ value: 'Filtros aplicados', colspan: columnCount, style: 3 }], 20);
    filters.forEach((pair, index) => {
      if (index % 2 !== 0) return;
      const next = filters[index + 1] || ['', ''];
      pushRow(
        [
          { value: pair[0], style: 4 },
          { value: pair[1], colspan: 2, style: 5 },
          { value: next[0], style: 4 },
          { value: next[1], colspan: Math.max(columnCount - 4, 1), style: 5 },
        ],
        22,
      );
    });
    spacer();
    pushRow([{ value: 'Indicadores', colspan: columnCount, style: 3 }], 20);
    if (summaryCards.length) {
      summaryCards.forEach((card) => {
        pushRow(
          [
            { value: card.label, colspan: 2, style: 6 },
            { value: card.value, colspan: 2, style: 7 },
            { value: card.caption, colspan: Math.max(columnCount - 4, 1), style: 8 },
          ],
          24,
        );
      });
    } else {
      pushRow([{ value: 'Sin indicadores disponibles.', colspan: columnCount, style: 10 }], 22);
    }
    spacer();
    pushRow([{ value: 'Detalle', colspan: columnCount, style: 3 }], 20);
    pushRow(state.columns.map((column) => ({ value: column.label, style: 9 })), 22);
    if (rows.length) {
      rows.forEach((row) => pushRow(state.columns.map((column) => ({ value: row[column.label], style: 10 })), 21));
    } else {
      pushRow([{ value: 'Sin datos para los filtros seleccionados.', colspan: state.columns.length, style: 10 }], 22);
    }

    const cols = Array.from({ length: columnCount }, (_, index) => {
      const width = index === 0 ? 22 : index === 1 ? 28 : index === 2 ? 24 : 18;
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    }).join('');
    const mergeCells = merges.length ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <cols>${cols}</cols>
        <sheetData>${worksheetRows.join('')}</sheetData>
        ${mergeCells}
        <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
      </worksheet>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <fonts count="5">
          <font><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font>
          <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
          <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
          <font><b/><sz val="11"/><color rgb="FF315176"/><name val="Arial"/></font>
          <font><sz val="11"/><color rgb="FF64748B"/><name val="Arial"/></font>
        </fonts>
        <fills count="8">
          <fill><patternFill patternType="none"/></fill>
          <fill><patternFill patternType="gray125"/></fill>
          <fill><patternFill patternType="solid"><fgColor rgb="FF10213F"/><bgColor indexed="64"/></patternFill></fill>
          <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>
          <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill>
          <fill><patternFill patternType="solid"><fgColor rgb="FFEDF4FF"/><bgColor indexed="64"/></patternFill></fill>
          <fill><patternFill patternType="solid"><fgColor rgb="FFF7FBFF"/><bgColor indexed="64"/></patternFill></fill>
          <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
        </fills>
        <borders count="2">
          <border><left/><right/><top/><bottom/><diagonal/></border>
          <border><left style="thin"><color rgb="FFD7E1F1"/></left><right style="thin"><color rgb="FFD7E1F1"/></right><top style="thin"><color rgb="FFD7E1F1"/></top><bottom style="thin"><color rgb="FFD7E1F1"/></bottom><diagonal/></border>
        </borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="11">
          <xf numFmtId="0" fontId="0" fillId="7" borderId="0" xfId="0"/>
          <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
          <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
          <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
          <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
          <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
          <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
          <xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
          <xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf>
          <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
          <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf>
        </cellXfs>
        <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
      </styleSheet>`;
    return createZip([
      {
        name: '[Content_Types].xml',
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      },
      {
        name: '_rels/.rels',
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      },
      {
        name: 'xl/workbook.xml',
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(title).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      },
      { name: 'xl/worksheets/sheet1.xml', content: sheet },
      { name: 'xl/styles.xml', content: styles },
    ]);
  }

  function exportExcel() {
    if (!state.columns.length) {
      setFeedback('Genera un reporte antes de descargar Excel.', true);
      return;
    }
    const rows = exportRowsForFile();
    const reportType = $('report-type').value;
    const title = labels.report[reportType] || $('report-title').textContent || 'Reporte';
    const generatedAt = new Date().toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
    const filters = [
      ['Organizacion', selectedText('organization-id')],
      ['Reporte', title],
      ['Desde', $('date-from').value || 'Sin limite'],
      ['Hasta', $('date-to').value || 'Sin limite'],
      ['Estado', selectedText('status-filter')],
      ['Busqueda', $('search-filter').value.trim() || 'Sin busqueda'],
    ];
    if (reportType === 'sales') {
      filters.push(['Medio de pago', selectedText('payment-filter')], ['Documento', selectedText('document-filter')]);
    }
    const columnCount = Math.max(state.columns.length, 6);
    const summaryCards = exportSummaryCardsForFile();
    const blob = createXlsxBlob({
      title,
      caption: $('report-caption').textContent,
      generatedAt,
      filters,
      summaryCards,
      rows,
      columnCount,
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reporteria-${reportType}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
    setFeedback('Excel descargado con el reporte visible.');
  }

  function exportPdf() {
    const title = $('report-title').textContent;
    const caption = $('report-caption').textContent;
    const table = $('report-table').outerHTML;
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      setFeedback('El navegador bloqueo la ventana de exportacion PDF.', true);
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            p { margin: 0 0 18px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(caption)}</p>
          ${table}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function generate() {
    try {
      setFeedback('');
      await loadData();
      renderReport();
    } catch (error) {
      setFeedback(error.message || 'No fue posible generar el reporte.', true);
    }
  }

  $('report-type').addEventListener('change', () => {
    syncStatusOptions();
    renderReport();
  });
  ['date-from', 'date-to', 'status-filter', 'payment-filter', 'document-filter'].forEach((id) => {
    $(id)?.addEventListener('change', renderReport);
  });
  $('search-filter').addEventListener('input', renderReport);
  $('reload').addEventListener('click', generate);
  $('clear-filters').addEventListener('click', () => {
    defaultMonthRange();
    $('status-filter').value = '';
    $('search-filter').value = '';
    $('payment-filter').value = '';
    $('document-filter').value = '';
    renderReport();
  });
  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    generate();
  });
  document.querySelectorAll('[data-export-excel]').forEach((button) => button.addEventListener('click', exportExcel));
  $('export-pdf').addEventListener('click', exportPdf);

  renderOrganizations();
  defaultMonthRange();
  syncStatusOptions();
  generate();
})();
