(function initFacturas() {
  const $ = (id) => document.getElementById(id);
  const apiBase = () => ($('api-base').value.trim() || '/api').replace(/\/$/, '');
  const orgId = () => Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
  const logPrefix = '[Facturas API]';

  async function request(path, options) {
    const url = `${apiBase()}${path}`;
    const method = options?.method || 'GET';
    const payload = options?.body;
    console.info(`${logPrefix} ${method} ${url}`, payload ? { body: payload } : '');
    const response = await fetch(url, { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'include', ...options });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    console.info(`${logPrefix} ${method} ${url} -> ${response.status}`, { contentType, bodyPreview: text.slice(0, 180) });
    if (!response.ok) throw new Error(text || 'Error de API');
    if (!text) return null;
    if (!contentType.includes('application/json')) {
      throw new Error('Respuesta no JSON. Revise API base (ej. http://localhost:8000/api) o proxy /api.');
    }
    return JSON.parse(text);
  }

  function feedback(msg, error) {
    $('feedback').textContent = msg;
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
  }

  async function loadInvoices() {
    const invoices = await request(`/invoices/?organization_id=${orgId()}`);
    $('invoices-body').innerHTML =
      invoices.map((i) => `<tr><td>${i.invoice_number}</td><td>${i.customer_name}</td><td>${i.total}</td><td>${i.issue_date}</td><td><a class='btn btn-secondary' href='${apiBase()}/invoices/${i.id}/pdf/' target='_blank'>PDF</a> <button class='btn btn-secondary' data-mail='${i.id}'>Correo</button></td></tr>`).join('') ||
      '<tr><td colspan="5">Sin facturas emitidas</td></tr>';
  }

  $('reload').addEventListener('click', () => loadInvoices().catch((e) => feedback(e.message, true)));
  $('invoices-body').addEventListener('click', async (e) => {
    const id = e.target.dataset.mail;
    if (!id) return;
    await request(`/invoices/${id}/send-email/`, { method: 'POST' });
    feedback('Correo enviado al cliente.');
  });

  $('organization-id').value = window.AppSession?.getActiveOrganizationId?.() || $('organization-id').value;
  $('organization-id').addEventListener('change', () => localStorage.setItem('activeOrganizationId', $('organization-id').value));
  loadInvoices().catch((e) => feedback(e.message, true));
})();
