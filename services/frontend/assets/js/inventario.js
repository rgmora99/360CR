(function initInventario() {
  const $ = (id) => document.getElementById(id);
  const state = { products: [], organizations: [], suppliers: [] };
  const apiBase = () => '/api';
  function orgId() {
    const raw = ($('organization-id').value || window.AppSession?.getActiveOrganizationId?.() || '').toString().trim();
    const numeric = Number(raw.replace(/[^\d]/g, ''));
    if (!numeric || numeric < 1) {
      throw new Error('No hay organización activa. Selecciona una organización en la barra superior.');
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
    const requiresDuration = $('service-requires-duration').value === 'yes';
    $('field-physical-location').style.display = isService ? 'none' : '';
    $('field-stock').style.display = isService ? 'none' : '';
    $('field-item-status').style.display = isService ? 'none' : '';
    $('field-requires-duration').style.display = isService ? '' : 'none';
    $('field-service-duration').style.display = isService && requiresDuration ? '' : 'none';
    $('stock').value = isService ? 0 : $('stock').value || 0;
    $('stock').disabled = isService;
    $('service-duration-minutes').disabled = !isService || !requiresDuration;
    if (!isService || !requiresDuration) $('service-duration-minutes').value = 30;
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
    if (payload.product_type === 'service' && payload._requires_duration && (!Number.isInteger(payload.service_duration_minutes) || payload.service_duration_minutes < 1)) {
      throw new Error('La duración del servicio debe ser mayor o igual a 1 minuto cuando el servicio lo requiere.');
    }
    if (!Number.isFinite(payload.cost_price) || payload.cost_price <= 0) {
      throw new Error('El costo debe ser un número mayor a 0.');
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
              <td>${p.product_type === 'service' ? (p.service_duration_minutes > 0 ? `${p.service_duration_minutes} min` : 'No requiere') : 'N/A'}</td>
              <td>${statusLabel(p.item_status)}</td>
              <td><button class='btn btn-secondary' data-edit='${p.id}'>Editar</button> <button class='btn btn-secondary' data-delete='${p.id}'>Eliminar</button></td>
            </tr>`,
        )
        .join('') ||
      '<tr><td colspan="10">Sin productos</td></tr>';
  }

  function renderLocations() {
    const options = ['<option value="">Selecciona ubicación</option>']
      .concat(state.organizations.map((org) => `<option value="${org.name}">${org.name} (Sucursal #${org.id})</option>`))
      .join('');
    $('physical-location').innerHTML = options;
  }

  function renderSuppliers() {
    const options = ['<option value="">Sin proveedor</option>']
      .concat(state.suppliers.map((supplier) => `<option value="${supplier.id}">${supplier.legal_name}</option>`))
      .join('');
    $('supplier-id').innerHTML = options;
  }

  async function loadOrganizations() {
    state.organizations = await request('/organizations/');
    renderLocations();
  }

  async function loadSuppliers() {
    const organization = orgId();
    const suppliers = await request(`/suppliers/?organization_id=${organization}`);
    state.suppliers = suppliers.filter((item) => item.status === 'active');
    renderSuppliers();
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
        _requires_duration: isService ? $('service-requires-duration').value === 'yes' : false,
        service_duration_minutes: isService && $('service-requires-duration').value === 'yes' ? Number($('service-duration-minutes').value) : 0,
        item_status: isService ? 'ok' : $('item-status').value,
        is_active: true,
      };
      validatePayload(payload);
      delete payload._requires_duration;
      await request(id ? `/products/${id}/` : '/products/', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      $('product-form').reset();
      $('product-id').value = '';
      $('tax-rate').value = 13;
      $('stock').value = 0;
      $('cost-price').value = '0.01';
      $('item-status').value = 'ok';
      $('service-requires-duration').value = 'yes';
      $('service-duration-minutes').value = 30;
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
      $('service-requires-duration').value = (p.service_duration_minutes || 0) > 0 ? 'yes' : 'no';
      $('service-duration-minutes').value = p.service_duration_minutes || 30;
      $('item-status').value = p.item_status || 'ok';
      updateStockState();
    }
    if (delId) {
      await request(`/products/${delId}/`, { method: 'DELETE' });
      await loadProducts();
      feedback('Producto eliminado.');
    }
  });

  $('organization-id').value = window.AppSession?.getActiveOrganizationId?.() || '';
  $('organization-id').addEventListener('change', async () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    try {
      await Promise.all([loadProducts(), loadSuppliers()]);
    } catch (error) {
      feedback(error.message, true);
    }
  });
  $('product-type').addEventListener('change', updateStockState);
  $('service-requires-duration').addEventListener('change', updateStockState);
  $('sku').value = 'Se generará automáticamente';
  updateStockState();
  Promise.all([loadOrganizations(), loadSuppliers(), loadProducts()]).catch((e) => feedback(e.message, true));
})();
