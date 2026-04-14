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
  let syncTimer = null;
  let syncStartedAt = 0;

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
    syncNowButton.disabled = false;
    syncNowButton.textContent = 'Sincronizar ahora';
    if (result) {
      syncYear.textContent = 'Año 2026';
      renderSyncRange(result?.date_from || '2026-01-01', result?.date_to || '2026-12-31');
      syncNewCount.textContent = `Nuevas: ${result?.created || 0}`;
      syncProcessedCount.textContent = `Procesadas: ${result?.processed_messages || 0}`;
      syncScannedCount.textContent = `Leídas: ${result?.scanned_messages || 0}`;
      syncSkippedCount.textContent = `Descartadas: ${(result?.skipped_non_invoice || 0) + (result?.skipped_out_of_range || 0)}`;
    } else {
      syncProgress.classList.remove('is-active');
    }
  }

  async function syncInbox(showToast = true) {
    const filters = getSyncFilters();
    startSyncProgress();
    try {
      const result = await request('/purchase-inbox/sync/', {
        method: 'POST',
        body: JSON.stringify({ organization: orgId(), ...filters }),
      });

      finishSyncProgress(result);

      if (syncMeta && result?.synced_at) {
        const rules = result?.rules || {};
        syncMeta.textContent =
          `Última sync: ${new Date(result.synced_at).toLocaleString()} · ` +
          `Rango ${result?.date_from || filters.date_from} a ${result?.date_to || filters.date_to} · ` +
          `Incluye leídos y no leídos · XML obligatorio: ${rules.requires_xml ? 'sí' : 'no'}`;
      }

      if (showToast) {
        const errors = Array.isArray(result?.errors) ? result.errors.filter(Boolean) : [];
        const message =
          `Sync completada. Nuevas: ${result?.created || 0}. ` +
          `Actualizadas: ${result?.updated || 0}. Procesadas: ${result?.processed_messages || 0}. ` +
          `Leídas: ${result?.scanned_messages || 0}. No factura: ${result?.skipped_non_invoice || 0}. ` +
          `Fuera de rango XML: ${result?.skipped_out_of_range || 0}.`;
        feedback(errors.length ? `${message} Errores: ${errors.join(' | ')}` : message, errors.length > 0);
      }
      return result;
    } catch (error) {
      finishSyncProgress();
      throw error;
    }
  }

  async function loadInbox(showMessage = true) {
    const status = $('status-filter').value;
    const query = status ? `&status=${status}` : '';
    const rows = await request(`/purchase-inbox/?organization_id=${orgId()}${query}`);
    $('inbox-body').innerHTML =
      rows
        .map(
          (i) =>
            `<tr><td>${i.issue_date}</td><td>${i.supplier_name}</td><td>${i.invoice_number}</td><td>CRC ${i.subtotal}</td><td>CRC ${i.tax_total}</td><td>CRC ${i.total}</td><td>${i.status}</td><td>${i.status === 'pending' || i.status === 'in_process' ? `<button class='btn btn-secondary' data-approve='${i.id}'>Aprobar</button> <button class='btn btn-secondary' data-reject='${i.id}'>Rechazar</button>` : '-'}</td></tr>`
        )
        .join('') || '<tr><td colspan="8">Sin facturas electrónicas.</td></tr>';
    if (showMessage) {
      feedback(`Mostrando ${rows.length} factura(s) en bandeja.`);
    }
  }

  $('inbox-body').addEventListener('click', async (event) => {
    const idApprove = event.target.dataset.approve;
    const idReject = event.target.dataset.reject;
    try {
      if (idApprove) await request(`/purchase-inbox/${idApprove}/approve/`, { method: 'POST' });
      if (idReject) await request(`/purchase-inbox/${idReject}/reject/`, { method: 'POST' });
      await loadInbox(true);
    } catch (error) {
      feedback(error.message, true);
    }
  });

  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    syncInbox(false).then(() => loadInbox(false)).catch((e) => feedback(e.message, true));
  });
  $('status-filter').addEventListener('change', () => loadInbox().catch((e) => feedback(e.message, true)));
  syncDateFromInput.addEventListener('change', () => renderSyncRange(getSyncFilters().date_from, getSyncFilters().date_to));
  syncDateToInput.addEventListener('change', () => renderSyncRange(getSyncFilters().date_from, getSyncFilters().date_to));
  syncNowButton.addEventListener('click', () => syncInbox(true).then(() => loadInbox(false)).catch((e) => feedback(e.message, true)));

  renderOrganizations();
  renderSyncRange(getSyncFilters().date_from, getSyncFilters().date_to);
  syncInbox(false).then(() => loadInbox(false)).catch((e) => feedback(e.message, true));
})();
