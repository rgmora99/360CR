(function initInventario() {
  const $ = (id) => document.getElementById(id);
  const LOW_STOCK_THRESHOLD = 5;
  const state = { products: [], filteredProducts: [], organizations: [], suppliers: [] };
  const apiBase = () => '/api';
  const productsPager = window.TablePaginator?.create({
    key: 'products',
    tableBody: $('products-body'),
    totalColumns: 10,
    emptyMessage: 'Sin productos',
    rowRenderer: (product) =>
      `<tr>
        <td>${escapeHtml(product.sku)}</td>
        <td><strong>${escapeHtml(product.name)}</strong><br><small>${escapeHtml(product.description || '-')}</small></td>
        <td>${escapeHtml(product.physical_location || '-')}</td>
        <td>${escapeHtml(product.supplier_name || '-')}</td>
        <td>${formatMoney(product.cost_price)}</td>
        <td>${formatMoney(product.unit_price)}</td>
        <td>${renderStockCell(product)}</td>
        <td>${product.product_type === 'service' ? (product.service_duration_minutes > 0 ? `${product.service_duration_minutes} min` : 'No requiere') : 'N/A'}</td>
        <td>${statusLabel(product.item_status)}</td>
        <td><button class='btn btn-secondary' data-edit='${product.id}'>Editar</button> <button class='btn btn-secondary' data-delete='${product.id}'>Eliminar</button></td>
      </tr>`,
  });

  function orgId() {
    const raw = ($('organization-id').value || window.AppSession?.getActiveOrganizationId?.() || '').toString().trim();
    const numeric = Number(raw.replace(/[^\d]/g, ''));
    if (!numeric || numeric < 1) {
      throw new Error('No hay organización activa. Selecciona una organización en la barra superior.');
    }
    return numeric;
  }

  const logPrefix = '[Inventario API]';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatMoney(value) {
    return Number(value || 0).toFixed(2);
  }

  async function request(path, options) {
    const url = `${apiBase()}${path}`;
    const method = options?.method || 'GET';
    const payload = options?.body;
    console.info(`${logPrefix} ${method} ${url}`, payload ? { body: payload } : '');
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
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

  function renderOrganizations() {
    state.organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML =
      state.organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('') ||
      '<option value="">Sin organizaciones</option>';

    if (activeId && state.organizations.some((org) => Number(org.id) === activeId)) {
      $('organization-id').value = String(activeId);
    }
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
    if (
      payload.product_type === 'service' &&
      payload._requires_duration &&
      (!Number.isInteger(payload.service_duration_minutes) || payload.service_duration_minutes < 1)
    ) {
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

  function isLowStock(product) {
    return product.product_type === 'physical' && Number(product.stock || 0) <= LOW_STOCK_THRESHOLD;
  }

  function renderStockCell(product) {
    if (product.product_type === 'service') return 'N/A';
    const lowStock = isLowStock(product);
    const toneClass = lowStock ? 'inventory-stock inventory-stock--low' : 'inventory-stock';
    const helperText = lowStock ? '<small class="inventory-stock__hint">Casi agotado</small>' : '';
    return `<span class="${toneClass}">${escapeHtml(product.stock)}</span>${helperText}`;
  }

  function renderRowsWithoutPager(items) {
    $('products-body').innerHTML =
      items
        .map(
          (product) =>
            `<tr>
              <td>${escapeHtml(product.sku)}</td>
              <td><strong>${escapeHtml(product.name)}</strong><br><small>${escapeHtml(product.description || '-')}</small></td>
              <td>${escapeHtml(product.physical_location || '-')}</td>
              <td>${escapeHtml(product.supplier_name || '-')}</td>
              <td>${formatMoney(product.cost_price)}</td>
              <td>${formatMoney(product.unit_price)}</td>
              <td>${renderStockCell(product)}</td>
              <td>${product.product_type === 'service' ? (product.service_duration_minutes > 0 ? `${product.service_duration_minutes} min` : 'No requiere') : 'N/A'}</td>
              <td>${statusLabel(product.item_status)}</td>
              <td><button class='btn btn-secondary' data-edit='${product.id}'>Editar</button> <button class='btn btn-secondary' data-delete='${product.id}'>Eliminar</button></td>
            </tr>`,
        )
        .join('') || '<tr><td colspan="10">Sin productos</td></tr>';
  }

  function applyProductFilter(resetPager = false) {
    const term = ($('product-search')?.value || '').trim().toLowerCase();
    state.filteredProducts = state.products.filter((product) => {
      const fields = [product.sku, product.name, product.description, product.physical_location, product.supplier_name];
      return !term || fields.some((field) => String(field || '').toLowerCase().includes(term));
    });

    if (productsPager) {
      productsPager.update(state.filteredProducts);
      if (resetPager) {
        productsPager.reset();
      }
      return;
    }

    renderRowsWithoutPager(state.filteredProducts);
  }

  async function loadProducts() {
    const data = await request(`/products/?organization_id=${orgId()}`);
    state.products = Array.isArray(data) ? data : [];
    applyProductFilter(true);
  }

  function renderLocations() {
    const options = ['<option value="">Selecciona ubicación</option>']
      .concat(state.organizations.map((org) => `<option value="${escapeHtml(org.name)}">${escapeHtml(org.name)} (Sucursal #${org.id})</option>`))
      .join('');
    $('physical-location').innerHTML = options;
  }

  function renderSuppliers() {
    const options = ['<option value="">Sin proveedor</option>']
      .concat(state.suppliers.map((supplier) => `<option value="${supplier.id}">${escapeHtml(supplier.legal_name)}</option>`))
      .join('');
    $('supplier-id').innerHTML = options;
  }

  async function loadOrganizations() {
    renderOrganizations();
    if (!state.organizations.length) {
      state.organizations = await request('/organizations/');
      window.AppSession?.save?.({
        ...window.AppSession?.getSession?.(),
        organizations: state.organizations,
        active_organization_id: Number(window.AppSession?.getActiveOrganizationId?.() || state.organizations[0]?.id || null),
      });
      renderOrganizations();
    }
    renderLocations();
  }

  async function loadSuppliers() {
    const organization = orgId();
    const suppliers = await request(`/suppliers/?organization_id=${organization}`);
    state.suppliers = suppliers.filter((item) => item.status === 'active');
    renderSuppliers();
  }

  $('product-form').addEventListener('submit', async (event) => {
    try {
      event.preventDefault();
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

  $('products-body').addEventListener('click', async (event) => {
    const editId = event.target.dataset.edit;
    const delId = event.target.dataset.delete;

    if (editId) {
      const product = state.products.find((item) => item.id === Number(editId));
      if (!product) {
        feedback('No se encontró el producto seleccionado.', true);
        return;
      }
      $('product-id').value = product.id;
      $('sku').value = product.sku;
      $('product-name').value = product.name;
      $('description').value = product.description || '';
      $('physical-location').value = product.physical_location || '';
      $('supplier-id').value = product.supplier || '';
      $('product-type').value = product.product_type || 'physical';
      $('unit-price').value = product.unit_price;
      $('cost-price').value = product.cost_price;
      $('tax-rate').value = product.tax_rate;
      $('stock').value = product.stock;
      $('service-requires-duration').value = (product.service_duration_minutes || 0) > 0 ? 'yes' : 'no';
      $('service-duration-minutes').value = product.service_duration_minutes || 30;
      $('item-status').value = product.item_status || 'ok';
      updateStockState();
    }

    if (delId) {
      await request(`/products/${delId}/`, { method: 'DELETE' });
      await loadProducts();
      feedback('Producto eliminado.');
    }
  });

  $('organization-id').addEventListener('change', async () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    try {
      await Promise.all([loadProducts(), loadSuppliers()]);
    } catch (error) {
      feedback(error.message, true);
    }
  });

  $('product-search').addEventListener('input', () => applyProductFilter(true));
  $('product-type').addEventListener('change', updateStockState);
  $('service-requires-duration').addEventListener('change', updateStockState);
  $('sku').value = 'Se generará automáticamente';
  updateStockState();

  loadOrganizations()
    .then(() => Promise.all([loadSuppliers(), loadProducts()]))
    .catch((error) => feedback(error.message, true));
})();
