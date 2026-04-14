(function initBandeja() {
  const $ = (id) => document.getElementById(id);
  const orgId = () => Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
  const syncMeta = $('sync-meta');
  const syncNowButton = $('sync-now');
  const syncProgress = $('sync-progress');
  const syncElapsed = $('sync-elapsed');
  const syncYear = $('sync-year');
  const syncRange = $('sync-range');
  const syncNewCount = $('sync-new-count');
  const syncProcessedCount = $('sync-processed-count');
  const syncScannedCount = $('sync-scanned-count');
  const syncSkippedCount = $('sync-skipped-count');
  const syncDateFromInput = $('sync-date-from');
  const syncDateToInput = $('sync-date-to');
  const syncLimitInput = $('sync-limit');
  const syncToast = $('sync-toast');
  const modal = $('invoice-modal');
  const modalTitle = $('invoice-modal-title');
  const modalSubtitle = $('invoice-modal-subtitle');
  const modalMeta = $('invoice-modal-meta');
  const modalPdf = $('invoice-modal-pdf');
  const modalLines = $('invoice-modal-lines');
  const modalStatus = $('invoice-modal-status');
  const modalClose = $('invoice-modal-close');
  let syncTimer = null;
  let syncPollTimer = null;
  let syncStartedAt = 0;
  let currentRows = [];

  async function request(path, options) {
    const response = await fetch(`/api${path}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Error de API');
    return text ? JSON.parse(text) : null;
  }

  function feedback(msg, err = false) {
    $('feedback').textContent = msg;
    $('feedback').style.color = err ? '#ff7d7d' : 'var(--muted)';
  }

  function showToast(message, isError = false) {
    if (!syncToast) return;
    syncToast.textContent = message;
    syncToast.classList.toggle('is-error', isError);
    syncToast.classList.add('is-visible');
    window.clearTimeout(showToast.hideTimer);
    showToast.hideTimer = window.setTimeout(() => {
      syncToast.classList.remove('is-visible');
    }, 4200);
  }

  function renderOrganizations() {
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML = organizations.map((org) => `<option value="${org.id}">${org.name}</option>`).join('');
    if (activeId) $('organization-id').value = String(activeId);
  }

  function getSyncFilters() {
    const dateFrom = syncDateFromInput.value || '2026-01-01';
    const dateTo = syncDateToInput.value || '2026-12-31';
    const limit = Math.min(500, Math.max(1, Number(syncLimitInput.value || 150)));
    syncDateFromInput.value = dateFrom;
    syncDateToInput.value = dateTo;
    syncLimitInput.value = String(limit);
    return { date_from: dateFrom, date_to: dateTo, limit };
  }

  function renderSyncRange(dateFrom, dateTo) {
    syncRange.textContent = `Rango ${dateFrom} a ${dateTo}`;
  }

  function currencySymbol(code) {
    return code === 'USD' ? '$' : 'CRC ';
  }

  function formatMoney(amount, currency = 'CRC') {
    const numeric = Number(amount || 0);
    if (!Number.isFinite(numeric)) return `${currencySymbol(currency)}0.00`;
    return `${currencySymbol(currency)}${numeric.toFixed(2)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function startSyncProgress() {
    const filters = getSyncFilters();
    syncStartedAt = Date.now();
    syncNowButton.disabled = true;
    syncProgress.classList.add('is-active');
    syncElapsed.textContent = '0s';
    syncYear.textContent = 'Año 2026';
    renderSyncRange(filters.date_from, filters.date_to);
    syncNewCount.textContent = 'Nuevas: 0';
    syncProcessedCount.textContent = 'Procesadas: 0';
    syncScannedCount.textContent = 'Leídas: 0';
    syncSkippedCount.textContent = 'Descartadas: 0';
    syncNowButton.textContent = 'Sincronizando...';
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      const seconds = Math.max(0, Math.floor((Date.now() - syncStartedAt) / 1000));
      syncElapsed.textContent = `${seconds}s`;
    }, 1000);
  }

  function finishSyncProgress(result) {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
    if (syncPollTimer) clearInterval(syncPollTimer);
    syncPollTimer = null;
    syncNowButton.disabled = false;
    syncNowButton.textContent = 'Sincronizar ahora';
    if (result) {
      updateProgressFromStatus(result);
    } else {
      syncProgress.classList.remove('is-active');
    }
  }

  function updateProgressFromStatus(result) {
    syncProgress.classList.add('is-active');
    syncYear.textContent = `Año ${result?.year || 2026}`;
    renderSyncRange(result?.date_from || '2026-01-01', result?.date_to || '2026-12-31');
    syncNewCount.textContent = `Nuevas: ${result?.created || 0}`;
    syncProcessedCount.textContent = `Procesadas: ${result?.processed_messages || 0}`;
    syncScannedCount.textContent = `Leídas: ${result?.scanned_messages || 0}`;
    syncSkippedCount.textContent = `Descartadas: ${(result?.skipped_non_invoice || 0) + (result?.skipped_out_of_range || 0)}`;
    if (syncMeta) {
      const message = result?.message ? ` · ${result.message}` : '';
      syncMeta.textContent =
        `Estado: ${result?.status || 'idle'} · Rango ${result?.date_from || '2026-01-01'} a ${result?.date_to || '2026-12-31'} · ` +
        `Candidatos: ${result?.total_candidates || 0}${message}`;
    }
  }

  async function pollSyncStatus(filters) {
    if (syncPollTimer) clearInterval(syncPollTimer);
    syncPollTimer = setInterval(async () => {
      try {
        const result = await request(
          `/purchase-inbox/sync-status/?organization_id=${orgId()}&date_from=${encodeURIComponent(filters.date_from)}&date_to=${encodeURIComponent(filters.date_to)}&limit=${filters.limit}`
        );
        updateProgressFromStatus(result);
        if (result?.status === 'completed') {
          finishSyncProgress(result);
          await loadInbox(false);
          feedback(
            `Sync completada. Nuevas: ${result?.created || 0}. Actualizadas: ${result?.updated || 0}. Procesadas: ${result?.processed_messages || 0}.`,
            false
          );
          showToast('Sincronización terminada correctamente.', false);
        } else if (result?.status === 'error') {
          finishSyncProgress(result);
          const errors = Array.isArray(result?.errors) ? result.errors.filter(Boolean) : [];
          feedback(errors.join(' | ') || 'La sincronización terminó con error.', true);
          showToast('La sincronización terminó con error.', true);
        }
      } catch (error) {
        finishSyncProgress();
        feedback(error.message, true);
        showToast('No se pudo consultar el estado de la sincronización.', true);
      }
    }, 1000);
  }

  async function syncInbox() {
    const filters = getSyncFilters();
    startSyncProgress();
    try {
      const result = await request('/purchase-inbox/sync/', {
        method: 'POST',
        body: JSON.stringify({ organization: orgId(), ...filters }),
      });
      updateProgressFromStatus(result);
      await pollSyncStatus(filters);
    } catch (error) {
      finishSyncProgress();
      throw error;
    }
  }

  function renderMeta(container, entries) {
    container.innerHTML = entries
      .map(
        ([label, value]) =>
          `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
      )
      .join('');
  }

  function openModal(invoice) {
    const payload = invoice.payload || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    const currency = invoice.currency || 'CRC';
    modalTitle.textContent = `Factura ${invoice.invoice_number}`;
    modalSubtitle.textContent = `${invoice.supplier_name} · ${invoice.issue_date}`;
    renderMeta(modalMeta, [
      ['Proveedor', invoice.supplier_name],
      ['Cédula proveedor', invoice.supplier_tax_id || 'No disponible'],
      ['Comprador', invoice.buyer_name || 'No disponible'],
      ['Cédula comprador', invoice.buyer_tax_id || 'No disponible'],
      ['Moneda', currency],
      ['Tipo de cambio', invoice.exchange_rate || '1.0000'],
      ['Subtotal', formatMoney(invoice.subtotal, currency)],
      ['IVA', formatMoney(invoice.tax_total, currency)],
      ['Total', formatMoney(invoice.total, currency)],
    ]);
    renderMeta(modalStatus, [
      ['Estado', invoice.status],
      ['Clave numérica', invoice.numeric_key],
      ['Origen', invoice.source || 'email'],
      ['Documento', payload.document_type || 'No disponible'],
      ['Compra registrada', invoice.purchase ? `Sí · ID ${invoice.purchase}` : 'No'],
      ['Buzón origen', payload.inbox_email || 'No disponible'],
    ]);
    modalLines.innerHTML = items.length
      ? items
          .map(
            (item, index) => `
              <div class="invoice-modal__line">
                <div>
                  <strong>${escapeHtml(item.description || `Línea ${index + 1}`)}</strong><br />
                  <span>${escapeHtml(item.quantity || '1')} × ${formatMoney(item.unit_price, currency)}</span>
                </div>
                <strong>${formatMoney((Number(item.quantity || 1) * Number(item.unit_price || 0)).toFixed(2), currency)}</strong>
              </div>
            `
          )
          .join('')
      : '<p class="subtitle">No hay líneas detalladas para esta factura.</p>';

    if (payload.pdf_base64) {
      const pdfSrc = `data:application/pdf;base64,${payload.pdf_base64}`;
      const fileName = payload.pdf_filename || `factura-${invoice.invoice_number}.pdf`;
      modalPdf.innerHTML = `
        <p class="subtitle">${escapeHtml(fileName)}</p>
        <iframe class="invoice-modal__pdf" src="${pdfSrc}" title="PDF de factura"></iframe>
      `;
    } else {
      modalPdf.innerHTML = '<p class="subtitle">Esta factura no tiene PDF adjunto disponible.</p>';
    }

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function loadInbox(showMessage = true) {
    const status = $('status-filter').value;
    const query = status ? `&status=${status}` : '';
    const rows = await request(`/purchase-inbox/?organization_id=${orgId()}${query}`);
    currentRows = rows;
    $('inbox-body').innerHTML =
      rows
        .map((i) => {
          const currency = i.currency || 'CRC';
          const detailButton = `<button class='btn btn-secondary' data-detail='${i.id}'>Ver detalles</button>`;
          const actionButtons =
            i.status === 'pending' || i.status === 'in_process'
              ? `<button class='btn btn-secondary' data-approve='${i.id}'>Aprobar</button> <button class='btn btn-secondary' data-reject='${i.id}'>Rechazar</button> ${detailButton}`
              : detailButton;
          return `<tr><td>${i.issue_date}</td><td>${escapeHtml(i.supplier_name)}</td><td>${escapeHtml(i.invoice_number)}</td><td>${formatMoney(i.subtotal, currency)}</td><td>${formatMoney(i.tax_total, currency)}</td><td>${formatMoney(i.total, currency)}</td><td>${escapeHtml(i.status)}</td><td>${actionButtons}</td></tr>`;
        })
        .join('') || '<tr><td colspan="8">Sin facturas electrónicas.</td></tr>';
    if (showMessage) {
      feedback(`Mostrando ${rows.length} factura(s) en bandeja.`);
    }
  }

  $('inbox-body').addEventListener('click', async (event) => {
    const idApprove = event.target.dataset.approve;
    const idReject = event.target.dataset.reject;
    const idDetail = event.target.dataset.detail;
    try {
      if (idDetail) {
        const invoice = currentRows.find((row) => String(row.id) === String(idDetail));
        if (invoice) openModal(invoice);
        return;
      }
      if (idApprove) {
        await request(`/purchase-inbox/${idApprove}/approve/`, { method: 'POST' });
        showToast('Factura aprobada correctamente.', false);
      }
      if (idReject) {
        await request(`/purchase-inbox/${idReject}/reject/`, { method: 'POST' });
        showToast('Factura rechazada correctamente.', false);
      }
      await loadInbox(true);
    } catch (error) {
      feedback(error.message, true);
      showToast('No se pudo completar la acción sobre la factura.', true);
    }
  });

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    loadInbox(false).catch((e) => feedback(e.message, true));
  });
  $('status-filter').addEventListener('change', () => loadInbox().catch((e) => feedback(e.message, true)));
  syncDateFromInput.addEventListener('change', () => renderSyncRange(getSyncFilters().date_from, getSyncFilters().date_to));
  syncDateToInput.addEventListener('change', () => renderSyncRange(getSyncFilters().date_from, getSyncFilters().date_to));
  syncNowButton.addEventListener('click', () => syncInbox().catch((e) => {
    feedback(e.message, true);
    showToast('No se pudo iniciar la sincronización.', true);
  }));

  renderOrganizations();
  renderSyncRange(getSyncFilters().date_from, getSyncFilters().date_to);
  loadInbox(false).catch((e) => feedback(e.message, true));
})();
