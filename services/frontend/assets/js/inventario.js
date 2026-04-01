(function initInventario() {
  const $ = (id) => document.getElementById(id);
  const state = { products: [] };
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

  async function loadProducts() {
    const data = await request(`/products/?organization_id=${orgId()}`);
    state.products = data;
    $('products-body').innerHTML =
      data.map((p) => `<tr><td>${p.sku}</td><td>${p.name}</td><td>${p.unit_price}</td><td>${p.stock}</td><td><button class='btn btn-secondary' data-edit='${p.id}'>Editar</button> <button class='btn btn-secondary' data-delete='${p.id}'>Eliminar</button></td></tr>`).join('') ||
      '<tr><td colspan="5">Sin productos</td></tr>';
  }

  $('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('product-id').value;
    const payload = {
      organization: orgId(),
      sku: $('sku').value.trim(),
      name: $('product-name').value.trim(),
      unit_price: Number($('unit-price').value),
      tax_rate: Number($('tax-rate').value),
      stock: Number($('stock').value),
      is_active: true,
    };
    await request(id ? `/products/${id}/` : '/products/', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    $('product-form').reset();
    $('product-id').value = '';
    $('tax-rate').value = 13;
    $('stock').value = 0;
    await loadProducts();
    feedback('Inventario actualizado.');
  });

  $('products-body').addEventListener('click', async (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.delete;
    if (editId) {
      const p = state.products.find((it) => it.id === Number(editId));
      $('product-id').value = p.id;
      $('sku').value = p.sku;
      $('product-name').value = p.name;
      $('unit-price').value = p.unit_price;
      $('tax-rate').value = p.tax_rate;
      $('stock').value = p.stock;
    }
    if (delId) {
      await request(`/products/${delId}/`, { method: 'DELETE' });
      await loadProducts();
      feedback('Producto eliminado.');
    }
  });

  loadProducts().catch((e) => feedback(e.message, true));
})();
