(function initInventario() {
  const $ = (id) => document.getElementById(id);
  const state = { products: [] };
  const apiBase = () => '/api';
  function orgId() {
    const raw = ($('organization-id').value || window.AppSession?.getActiveOrganizationId?.() || '').toString().trim();
    const numeric = Number(raw.replace(/[^\d]/g, ''));
    if (!numeric || numeric < 1) {
      throw new Error('Debe indicar un organization_id válido (entero mayor a 0).');
    }
    return numeric;
  }
  const logPrefix = '[Inventario API]';

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
      throw new Error('Respuesta no JSON. Revise la configuración del backend/proxy.');
    }
    return JSON.parse(text);
  }

  function feedback(msg, error) {
    $('feedback').textContent = msg;
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
  }

  function updateStockState() {
    const isService = $('product-type').value === 'service';
    $('stock').value = isService ? 0 : $('stock').value || 0;
    $('stock').disabled = isService;
  }

  function validatePayload(payload) {
    if (!payload.name || payload.name.length < 2) {
      throw new Error('El nombre debe tener al menos 2 caracteres.');
    }
    if (!Number.isFinite(payload.unit_price) || payload.unit_price <= 0) {
      throw new Error('El precio debe ser un número mayor a 0.');
    }
    if (!Number.isFinite(payload.tax_rate) || payload.tax_rate < 0 || payload.tax_rate > 100) {
      throw new Error('El impuesto debe estar entre 0 y 100.');
    }
    if (payload.product_type === 'physical' && (!Number.isInteger(payload.stock) || payload.stock < 0)) {
      throw new Error('El stock debe ser un entero mayor o igual a 0.');
    }
    if (!Number.isFinite(payload.cost_price) || payload.cost_price <= 0) {
      throw new Error('El costo debe ser un número mayor a 0.');
    }
    if (!Number.isInteger(payload.reorder_level) || payload.reorder_level < 0) {
      throw new Error('El nivel de reorden debe ser un entero mayor o igual a 0.');
    }
  }

  function statusLabel(code) {
    if (code === 'damaged') return 'Dañado';
    if (code === 'raw_material') return 'Materia prima';
    return 'Buen estado';
  }

  async function loadProducts() {
    const data = await request(`/products/?organization_id=${orgId()}`);
    state.products = data;
    $('products-body').innerHTML =
      data
        .map(
          (p) =>
            `<tr>
              <td>${p.sku}</td>
              <td><strong>${p.name}</strong><br><small>${p.description || '-'}</small></td>
              <td>${p.physical_location || '-'}</td>
              <td>${p.supplier_name || '-'}</td>
              <td>${p.cost_price}</td>
              <td>${p.unit_price}</td>
              <td>${p.product_type === 'service' ? 'N/A' : p.stock}</td>
              <td>${p.reorder_level ?? 0}</td>
              <td>${statusLabel(p.item_status)}</td>
              <td><button class='btn btn-secondary' data-edit='${p.id}'>Editar</button> <button class='btn btn-secondary' data-delete='${p.id}'>Eliminar</button></td>
            </tr>`,
        )
        .join('') ||
      '<tr><td colspan="10">Sin productos</td></tr>';
  }

  $('product-form').addEventListener('submit', async (e) => {
    try {
      e.preventDefault();
      const id = $('product-id').value;
      const isService = $('product-type').value === 'service';
      const payload = {
        organization: orgId(),
        name: $('product-name').value.trim(),
        description: $('description').value.trim(),
        physical_location: $('physical-location').value.trim(),
        supplier: $('supplier-id').value ? Number($('supplier-id').value) : null,
        product_type: $('product-type').value,
        unit_price: Number($('unit-price').value),
        cost_price: Number($('cost-price').value),
        tax_rate: Number($('tax-rate').value),
        stock: isService ? 0 : Number($('stock').value),
        reorder_level: Number($('reorder-level').value),
        item_status: $('item-status').value,
        is_active: true,
      };
      validatePayload(payload);
      await request(id ? `/products/${id}/` : '/products/', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      $('product-form').reset();
      $('product-id').value = '';
      $('tax-rate').value = 13;
      $('stock').value = 0;
      $('reorder-level').value = 0;
      $('cost-price').value = '0.01';
      $('item-status').value = 'ok';
      $('sku').value = 'Se generará automáticamente';
      $('product-type').value = 'physical';
      updateStockState();
      await loadProducts();
      feedback('Inventario actualizado.');
    } catch (error) {
      feedback(error.message, true);
    }
  });

  $('products-body').addEventListener('click', async (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.delete;
    if (editId) {
      const p = state.products.find((it) => it.id === Number(editId));
      $('product-id').value = p.id;
      $('sku').value = p.sku;
      $('product-name').value = p.name;
      $('description').value = p.description || '';
      $('physical-location').value = p.physical_location || '';
      $('supplier-id').value = p.supplier || '';
      $('product-type').value = p.product_type || 'physical';
      $('unit-price').value = p.unit_price;
      $('cost-price').value = p.cost_price;
      $('tax-rate').value = p.tax_rate;
      $('stock').value = p.stock;
      $('reorder-level').value = p.reorder_level ?? 0;
      $('item-status').value = p.item_status || 'ok';
      updateStockState();
    }
    if (delId) {
      await request(`/products/${delId}/`, { method: 'DELETE' });
      await loadProducts();
      feedback('Producto eliminado.');
    }
  });

  $('organization-id').value = window.AppSession?.getActiveOrganizationId?.() || $('organization-id').value;
  $('organization-id').addEventListener('change', () => localStorage.setItem('activeOrganizationId', $('organization-id').value));
  $('product-type').addEventListener('change', updateStockState);
  $('sku').value = 'Se generará automáticamente';
  updateStockState();
  loadProducts().catch((e) => feedback(e.message, true));
})();
