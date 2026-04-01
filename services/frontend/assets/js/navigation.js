(function initSharedNavigation() {
  window.renderSharedNavigation = function renderSharedNavigation(options) {
    const activeModule = options?.activeModule || 'clientes';

    const sidebar = document.getElementById('shared-sidebar');
    const topbar = document.getElementById('shared-topbar');

    if (!sidebar || !topbar) {
      return;
    }

    const menuItems = [
      { key: 'clientes', label: 'Clientes', href: '/customers.html' },
      { key: 'proveedores', label: 'Proveedores', href: '#' },
      { key: 'agenda', label: 'Agenda', href: '#' },
      { key: 'reportes', label: 'Reportes', href: '#' },
      { key: 'facturacion', label: 'Facturación', href: '#' },
      { key: 'inventario', label: 'Inventario', href: '#' },
      { key: 'marketing', label: 'Marketing automático', href: '#' },
      { key: 'fidelizacion', label: 'Fidelización de clientes', href: '#' },
    ];

    sidebar.className = 'sidebar card';
    sidebar.innerHTML = `
      <div>
        <div class="logo-block">
          <strong>360CR</strong>
          <p>Panel de operación</p>
        </div>
        <nav class="sidebar-nav">
          ${menuItems
            .map(
              (item) =>
                `<a class="${item.key === activeModule ? 'active' : ''}" href="${item.href}">${item.label}</a>`,
            )
            .join('')}
        </nav>
      </div>
      <a class="btn btn-secondary" href="/">Salir</a>
    `;

    topbar.className = 'topbar card';
    topbar.innerHTML = `
      <div class="workspace">
        <p class="label">Emprendimiento activo</p>
        <strong>Comercial Central S.A.</strong>
        <p class="subtitle">Equipo: Ventas y Operaciones · Sede: San José</p>
      </div>
      <div class="topbar-controls">
        <label>
          Negocio
          <select>
            <option>Comercial Central S.A.</option>
            <option>Distribuidora Norte</option>
            <option>Tienda Express CR</option>
          </select>
        </label>
        <label>
          Perfil
          <select>
            <option>Administrador</option>
            <option>Ventas</option>
            <option>Caja</option>
          </select>
        </label>
      </div>
    `;
  };
})();
