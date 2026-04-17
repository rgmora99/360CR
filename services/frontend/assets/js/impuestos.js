(function initImpuestos() {
  const $ = (id) => document.getElementById(id);
  const orgId = () => Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
  const taxPager = window.TablePaginator?.create({
    key: 'tax-reports',
    tableBody: $('tax-body'),
    totalColumns: 6,
    emptyMessage: 'Sin reportes.',
    rowRenderer: (report) =>
      `<tr><td>${report.year}-Q${report.quarter}</td><td>CRC ${report.purchases_subtotal}</td><td>CRC ${report.purchases_tax}</td><td>CRC ${report.purchases_total}</td><td>CRC ${report.estimated_tax}</td><td>${report.due_date}</td></tr>`,
  });

  async function request(path, options) {
    const response = await fetch(`/api${path}`, { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'include', ...options });
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

  async function loadReports() {
    const reports = await request(`/tax-reports/?organization_id=${orgId()}`);
    if (taxPager) {
      taxPager.update(reports);
    } else {
      $('tax-body').innerHTML = reports.map((r) => `<tr><td>${r.year}-Q${r.quarter}</td><td>CRC ${r.purchases_subtotal}</td><td>CRC ${r.purchases_tax}</td><td>CRC ${r.purchases_total}</td><td>CRC ${r.estimated_tax}</td><td>${r.due_date}</td></tr>`).join('') || '<tr><td colspan="6">Sin reportes.</td></tr>';
    }
    feedback(`Mostrando ${reports.length} reporte(s).`);
  }

  $('tax-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = { organization: orgId(), year: Number($('tax-year').value), quarter: Number($('tax-quarter').value), economic_activity: $('economic-activity').value.trim(), rts_factor: Number($('rts-factor').value) };
      const report = await request('/tax-reports/', { method: 'POST', body: JSON.stringify(payload) });
      $('tax-output').innerHTML = `Compras trimestre: <strong>CRC ${report.purchases_total}</strong><br/>Impuesto estimado: <strong>CRC ${report.estimated_tax}</strong><br/>Formulario ${report.declaration_form} | Fecha limite: ${report.due_date}`;
      await loadReports();
    } catch (error) {
      feedback(error.message, true);
    }
  });

  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    loadReports().catch((error) => feedback(error.message, true));
  });

  renderOrganizations();
  $('tax-year').value = String(new Date().getUTCFullYear());
  loadReports().catch((error) => feedback(error.message, true));
})();
