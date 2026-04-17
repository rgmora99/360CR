(function initBandeja() {
  const $ = (id) => document.getElementById(id);
  const pageMode = document.querySelector('.dashboard-layout')?.dataset.inboxView || 'inbox';
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
  const inboxPager = window.TablePaginator?.create({
    key: `purchase-inbox-${pageMode}`,
    tableBody: $('inbox-body'),
    totalColumns: 8,
    emptyMessage: pageMode === 'history' ? 'Sin facturas en historico.' : 'Sin facturas electronicas pendientes.',
    rowRenderer: (invoice) => {
      const currency = invoice.currency || 'CRC';
      const detailButton = `<button class='btn btn-secondary' data-detail='${invoice.id}'>Ver detalles</button>`;
      let actionButtons = detailButton;
      if (pageMode === 'inbox') {
        actionButtons = `<button class='btn btn-secondary' data-approve='${invoice.id}'>Aprobar</button> <button class='btn btn-secondary' data-reject='${invoice.id}'>Rechazar</button> ${detailButton}`;
      }
      return `<tr><td>${invoice.issue_date}</td><td>${escapeHtml(invoice.supplier_name)}</td><td>${escapeHtml(invoice.invoice_number)}</td><td>${formatMoney(invoice.subtotal, currency)}</td><td>${formatMoney(invoice.tax_total, currency)}</td><td>${formatMoney(invoice.total, currency)}</td><td>${escapeHtml(statusText(invoice))}</td><td>${actionButtons}</td></tr>`;
    },
  });

  const statusLabels = {
    pending: 'Pendiente',
    in_process: 'En registro',
    registered: 'Registrada',
    rejected: 'Rechazada',
  };

  const orgId = () => Number($('organization-id')?.value || window.AppSession?.getActiveOrganizationId?.());

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
    const node = $('feedback');
    if (!node) return;
    node.textContent = msg;
    node.style.color = err ? '#ff7d7d' : 'var(--muted)';
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
    const select = $('organization-id');
    if (!select) return;
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    select.innerHTML = organizations.map((org) => `<option value="${org.id}">${org.name}</option>`).join('');
    if (activeId) select.value = String(activeId);
  }

  function getSyncFilters() {
    const dateFrom = syncDateFromInput?.value || '2026-01-01';
    const dateTo = syncDateToInput?.value || '2026-12-31';
    const limit = Math.min(500, Math.max(1, Number(syncLimitInput?.value || 150)));
    if (syncDateFromInput) syncDateFromInput.value = dateFrom;
    if (syncDateToInput) syncDateToInput.value = dateTo;
    if (syncLimitInput) syncLimitInput.value = String(limit);
    return { date_from: dateFrom, date_to: dateTo, limit };
  }

  function renderSyncRange(dateFrom, dateTo) {
    if (syncRange) {
      syncRange.textContent = `Rango ${dateFrom} a ${dateTo}`;
    }
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

  function statusText(invoice) {
    return invoice.status_label || statusLabels[invoice.status] || invoice.status || 'Sin estado';
  }

  function startSyncProgress() {
    if (!syncNowButton || !syncProgress) return;
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
    if (syncNowButton) {
      syncNowButton.disabled = false;
      syncNowButton.textContent = 'Sincronizar ahora';
    }
    if (result) {
      updateProgressFromStatus(result);
    } else if (syncProgress) {
      syncProgress.classList.remove('is-active');
    }
  }

  function updateProgressFromStatus(result) {
    if (!syncProgress) return;
    syncProgress.classList.add('is-active');
    if (syncYear) syncYear.textContent = `Año ${result?.year || 2026}`;
    renderSyncRange(result?.date_from || '2026-01-01', result?.date_to || '2026-12-31');
    if (syncNewCount) syncNewCount.textContent = `Nuevas: ${result?.created || 0}`;
    if (syncProcessedCount) syncProcessedCount.textContent = `Procesadas: ${result?.processed_messages || 0}`;
    if (syncScannedCount) syncScannedCount.textContent = `Leídas: ${result?.scanned_messages || 0}`;
    if (syncSkippedCount) syncSkippedCount.textContent = `Descartadas: ${(result?.skipped_non_invoice || 0) + (result?.skipped_out_of_range || 0)}`;
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
    if (!container) return;
    container.innerHTML = entries
      .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join('');
  }

  function openModal(invoice) {
    if (!modal) return;
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
      ['Estado', statusText(invoice)],
      ['Clave numérica', invoice.numeric_key],
      ['Origen', invoice.source || 'email'],
      ['Documento', payload.document_type || 'No disponible'],
      ['Compra registrada', invoice.purchase ? `Sí · ID ${invoice.purchase}` : 'No'],
      ['Motivo rechazo', invoice.rejection_reason || 'No aplica'],
      ['Buzón origen', payload.inbox_email || 'No disponible'],
      ['Procesada', invoice.processed_at || 'Pendiente'],
    ]);
    modalLines.innerHTML = items.length
      ? items
          .map((item, index) => {
            const quantity = Number(item.quantity || 1);
            const unitPrice = Number(item.unit_price || 0);
            return `
              <div class="invoice-modal__line">
                <div>
                  <strong>${escapeHtml(item.description || `Línea ${index + 1}`)}</strong><br />
                  <span>${escapeHtml(item.quantity || '1')} × ${formatMoney(unitPrice, currency)}</span>
                </div>
                <strong>${formatMoney(quantity * unitPrice, currency)}</strong>
              </div>
            `;
          })
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
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function askRejectReason() {
    if (!window.Swal) {
      const reason = window.prompt('Indica el motivo del rechazo:');
      return reason ? reason.trim() : '';
    }
    const result = await window.Swal.fire({
      title: 'Motivo del rechazo',
      input: 'textarea',
      inputLabel: 'Escribe el motivo por el que se rechaza la factura',
      inputPlaceholder: 'Ejemplo: El monto no coincide con la orden de compra.',
      inputAttributes: { maxlength: 500 },
      confirmButtonText: 'Rechazar factura',
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!String(value || '').trim()) return 'Debes indicar el motivo del rechazo.';
        return null;
      },
    });
    if (!result.isConfirmed) return '';
    return String(result.value || '').trim();
  }

  async function loadInbox(showMessage = true) {
    const status = $('status-filter')?.value || '';
    const query = status ? `&status=${encodeURIComponent(status)}` : '';
    const rows = await request(`/purchase-inbox/?organization_id=${orgId()}&bucket=${pageMode}${query}`);
    currentRows = rows;
    if (inboxPager) {
      inboxPager.update(rows);
    }
    if (!inboxPager) $('inbox-body').innerHTML =
      rows
        .map((invoice) => {
          const currency = invoice.currency || 'CRC';
          const detailButton = `<button class='btn btn-secondary' data-detail='${invoice.id}'>Ver detalles</button>`;
          let actionButtons = detailButton;
          if (pageMode === 'inbox') {
            actionButtons = `<button class='btn btn-secondary' data-approve='${invoice.id}'>Aprobar</button> <button class='btn btn-secondary' data-reject='${invoice.id}'>Rechazar</button> ${detailButton}`;
          }
          return `<tr><td>${invoice.issue_date}</td><td>${escapeHtml(invoice.supplier_name)}</td><td>${escapeHtml(invoice.invoice_number)}</td><td>${formatMoney(invoice.subtotal, currency)}</td><td>${formatMoney(invoice.tax_total, currency)}</td><td>${formatMoney(invoice.total, currency)}</td><td>${escapeHtml(statusText(invoice))}</td><td>${actionButtons}</td></tr>`;
        })
        .join('') ||
      `<tr><td colspan="8">${pageMode === 'history' ? 'Sin facturas en histórico.' : 'Sin facturas electrónicas pendientes.'}</td></tr>`;
    if (showMessage) {
      feedback(
        pageMode === 'history'
          ? `Mostrando ${rows.length} factura(s) en histórico.`
          : `Mostrando ${rows.length} factura(s) en bandeja.`
      );
    }
  }

  if ($('inbox-body')) {
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
          showToast('Factura aprobada correctamente. Se movió al histórico.', false);
        }
        if (idReject) {
          const reason = await askRejectReason();
          if (!reason) return;
          await request(`/purchase-inbox/${idReject}/reject/`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
          });
          showToast('Factura rechazada correctamente. Se movió al histórico.', false);
        }
        await loadInbox(true);
      } catch (error) {
        feedback(error.message, true);
        showToast('No se pudo completar la acción sobre la factura.', true);
      }
    });
  }

  modalClose?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  $('organization-id')?.addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    loadInbox(false).catch((e) => feedback(e.message, true));
  });
  $('status-filter')?.addEventListener('change', () => loadInbox().catch((e) => feedback(e.message, true)));
  syncDateFromInput?.addEventListener('change', () => renderSyncRange(getSyncFilters().date_from, getSyncFilters().date_to));
  syncDateToInput?.addEventListener('change', () => renderSyncRange(getSyncFilters().date_from, getSyncFilters().date_to));
  syncNowButton?.addEventListener('click', () =>
    syncInbox().catch((e) => {
      feedback(e.message, true);
      showToast('No se pudo iniciar la sincronización.', true);
    })
  );

  renderOrganizations();
  if (pageMode === 'inbox') {
    renderSyncRange(getSyncFilters().date_from, getSyncFilters().date_to);
  }
  loadInbox(false).catch((e) => feedback(e.message, true));
})();
