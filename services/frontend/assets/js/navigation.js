(function initSharedNavigation() {
  window.renderSharedNavigation = function renderSharedNavigation(options) {
    const activeModule = options?.activeModule || 'inicio';

    const sidebar = document.getElementById('shared-sidebar');
    const topbar = document.getElementById('shared-topbar');
    const layout = document.querySelector('.dashboard-layout');

    if (!sidebar || !topbar || !layout) {
      return;
    }

    const menuItems = [
      { key: 'inicio', label: 'Inicio', href: '/dashboard.html' },
      { key: 'clientes', label: 'Clientes', href: '/customers.html' },
      { key: 'proveedores', label: 'Proveedores', href: '/suppliers.html' },
      { key: 'agenda', label: 'Agenda', href: '#' },
      {
        key: 'facturacion-menu',
        label: 'Facturación',
        children: [
          { key: 'facturacion-listado', label: 'Listado de facturas', href: '/facturas.html' },
          { key: 'facturacion-registrar', label: 'Registrar factura', href: '/facturacion.html' },
        ],
      },
      { key: 'inventario', label: 'Inventario', href: '/inventario.html' },
      { key: 'marketing', label: 'Marketing automático', href: '#' },
      { key: 'fidelizacion', label: 'Fidelización de clientes', href: '#' },
      { key: 'configuraciones', label: 'Configuraciones', href: '/configuraciones.html' },
    ];

    const menuMarkup = menuItems
      .map((item) => {
        if (item.children?.length) {
          const hasActiveChild = item.children.some((child) => child.key === activeModule);
          return `
            <div class="sidebar-submenu ${hasActiveChild ? 'is-open' : ''}">
              <button class="submenu-toggle ${hasActiveChild ? 'active' : ''}" type="button" data-submenu-toggle>
                ${item.label}
              </button>
              <div class="submenu-links">
                ${item.children
                  .map(
                    (child) =>
                      `<a class="${child.key === activeModule ? 'active' : ''}" href="${child.href}">${child.label}</a>`,
                  )
                  .join('')}
              </div>
            </div>
          `;
        }

        return `<a class="${item.key === activeModule ? 'active' : ''}" href="${item.href}">${item.label}</a>`;
      })
      .join('');

    sidebar.className = 'sidebar card';
    sidebar.innerHTML = `
      <div>
        <div class="logo-block">
          <strong>360CR</strong>
          <p>Panel de operación</p>
        </div>
        <nav class="sidebar-nav">
          ${menuMarkup}
        </nav>
      </div>
      <a class="btn btn-secondary" href="/">Salir</a>
    `;

    topbar.className = 'topbar card';
    topbar.innerHTML = `
      <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Abrir menú">☰</button>
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

    const menuToggleButton = document.getElementById('menu-toggle');
    const overlay = document.createElement('button');
    overlay.type = 'button';
    overlay.className = 'sidebar-overlay';
    overlay.setAttribute('aria-label', 'Cerrar menú');
    layout.appendChild(overlay);

    const toggleMenu = () => {
      layout.classList.toggle('sidebar-open');
    };

    menuToggleButton?.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', () => layout.classList.remove('sidebar-open'));

    const submenuButtons = sidebar.querySelectorAll('[data-submenu-toggle]');
    submenuButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const container = button.closest('.sidebar-submenu');
        container?.classList.toggle('is-open');
      });
    });
  };
})();
