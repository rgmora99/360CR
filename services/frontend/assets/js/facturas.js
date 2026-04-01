(function initFacturas() {
  const $ = (id) => document.getElementById(id);
  const apiBase = () => ($('api-base').value.trim() || '/api').replace(/\/$/, '');
  const orgId = () => Number($('organization-id').value);

  async function request(path, options) {
    const response = await fetch(`${apiBase()}${path}`, { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, ...options });
    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Error de API');
    return text ? JSON.parse(text) : null;
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

  loadInvoices().catch((e) => feedback(e.message, true));
})();
