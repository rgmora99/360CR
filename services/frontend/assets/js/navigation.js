(function initSharedNavigation() {
  const sessionState = { user: null, organizations: [], activeOrganizationId: null };

  async function loadSession() {
    const response = await fetch('/api/auth/session/', { credentials: 'include' });
    if (!response.ok) {
      window.location.href = '/auth/login.html';
      return null;
    }
    const session = await response.json();
    sessionState.user = session.user;
    sessionState.organizations = session.organizations || [];
    const preferred = Number(localStorage.getItem('activeOrganizationId'));
    const exists = sessionState.organizations.some((org) => org.id === preferred);
    sessionState.activeOrganizationId = exists ? preferred : session.active_organization_id;
    localStorage.setItem('activeOrganizationId', String(sessionState.activeOrganizationId));
    window.AppSession = {
      ...sessionState,
      getActiveOrganizationId: () => Number(localStorage.getItem('activeOrganizationId') || sessionState.activeOrganizationId),
    };
    return sessionState;
  }

  window.renderSharedNavigation = function renderSharedNavigation(options) {
    loadSession().then(() => {
    const activeModule = options?.activeModule || 'clientes';

    const sidebar = document.getElementById('shared-sidebar');
    const topbar = document.getElementById('shared-topbar');

    if (!sidebar || !topbar) {
      return;
    }

    const menuItems = [
      { key: 'clientes', label: 'Clientes', href: '/customers.html' },
      { key: 'proveedores', label: 'Proveedores', href: '/suppliers.html' },
      { key: 'agenda', label: 'Agenda', href: '#' },
      { key: 'reportes', label: 'Facturas emitidas', href: '/facturas.html' },
      { key: 'facturacion', label: 'Facturación', href: '/facturacion.html' },
      { key: 'inventario', label: 'Inventario', href: '/inventario.html' },
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
    const activeOrganization =
      sessionState.organizations.find((org) => org.id === sessionState.activeOrganizationId) || sessionState.organizations[0];
    topbar.innerHTML = `
      <div class="workspace">
        <p class="label">Emprendimiento activo</p>
        <strong>${activeOrganization?.name || 'Sin organización'}</strong>
        <p class="subtitle">Equipo: Ventas y Operaciones · Sede: San José</p>
      </div>
      <div class="topbar-controls">
        <label>
          Negocio
          <select id="global-organization-selector">
            ${sessionState.organizations
              .map((org) => `<option value="${org.id}" ${org.id === sessionState.activeOrganizationId ? 'selected' : ''}>${org.name}</option>`)
              .join('')}
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

    topbar.querySelector('#global-organization-selector')?.addEventListener('change', (event) => {
      localStorage.setItem('activeOrganizationId', event.target.value);
      window.location.reload();
    });

    sidebar.querySelector('a.btn.btn-secondary')?.addEventListener('click', async (event) => {
      event.preventDefault();
      await fetch('/api/auth/logout/', { method: 'POST', credentials: 'include' });
      localStorage.removeItem('activeOrganizationId');
      window.location.href = '/auth/login.html';
    });
    });
  };
})();
