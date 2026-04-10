(function initSharedNavigation() {
  const SESSION_KEY = 'cr360.session';
  const LEGACY_ORG_KEY = 'activeOrganizationId';

  function loadCachedSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    } catch (_error) {
      return {};
    }
  }

  function saveSession(sessionData) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData || {}));
  }

  function normalizeSession(sessionData) {
    const organizations = Array.isArray(sessionData?.organizations) ? sessionData.organizations : [];
    const availableIds = organizations.map((org) => Number(org.id)).filter((id) => Number.isFinite(id) && id > 0);
    const requested = Number(sessionData?.active_organization_id);
    const fallback = availableIds[0] || null;
    const activeId = availableIds.includes(requested) ? requested : fallback;
    return {
      ...sessionData,
      organizations,
      active_organization_id: activeId,
    };
  }

  window.AppSession = {
    getSession() {
      return normalizeSession(loadCachedSession());
    },
    save(sessionData) {
      const normalized = normalizeSession(sessionData);
      saveSession(normalized);
      return normalized;
    },
    getOrganizations() {
      return this.getSession().organizations || [];
    },
    getActiveOrganizationId() {
      const session = this.getSession();
      return Number(session.active_organization_id) || null;
    },
    setActiveOrganizationId(organizationId) {
      const current = this.getSession();
      const selectedId = Number(organizationId);
      const exists = (current.organizations || []).some((org) => Number(org.id) === selectedId);
      const next = {
        ...current,
        active_organization_id: exists ? selectedId : current.active_organization_id,
      };
      saveSession(normalizeSession(next));
    },
  };

  async function fetchSession() {
    const response = await fetch('/api/auth/session/', {
      credentials: 'include',
    });

    const bodyText = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const payload = bodyText && contentType.includes('application/json') ? JSON.parse(bodyText) : {};

    if (!response.ok) {
      throw new Error(payload?.detail || 'Sesión no disponible');
    }

    return payload;
  }

  function getTopbarState(sessionData) {
    const organizations = sessionData?.organizations || [];
    const activeOrganizationId = Number(sessionData?.active_organization_id);
    const activeOrganization = organizations.find((item) => item.id === activeOrganizationId) || organizations[0] || null;

    return {
      organizations,
      activeOrganizationId: activeOrganization?.id || '',
      activeOrganizationName: activeOrganization?.name || 'Sin organización activa',
      userLabel: sessionData?.user?.email || 'Invitado',
    };
  }

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
      { key: 'agenda', label: 'Agenda', href: '/agenda.html' },
      {
        key: 'facturacion-menu',
        label: 'Facturación',
        children: [
          { key: 'facturacion-listado', label: 'Listado de facturas', href: '/facturas.html' },
          { key: 'facturacion-registrar', label: 'Registrar factura', href: '/facturacion.html' },
          { key: 'compras-impuestos', label: 'Compras e impuestos', href: '/compras.html' },
        ],
      },
      { key: 'inventario', label: 'Inventario', href: '/inventario.html' },
      { key: 'marketing', label: 'Marketing automático', href: '#' },
      { key: 'fidelizacion', label: 'Fidelización de clientes', href: '/fidelizacion.html' },
      { key: 'configuraciones', label: 'Configuraciones', href: '/configuraciones.html' },
    ];

    const cachedSession = window.AppSession.getSession();
    const topbarState = getTopbarState(cachedSession);

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
        <strong id="active-organization-name">${topbarState.activeOrganizationName}</strong>
        <p class="subtitle">Usuario: <span id="active-user-label">${topbarState.userLabel}</span></p>
      </div>
      <div class="topbar-controls">
        <label class="topbar-field">
          <span>Negocio</span>
          <select id="organization-switcher">
            ${topbarState.organizations
              .map(
                (org) =>
                  `<option value="${org.id}" ${org.id === topbarState.activeOrganizationId ? 'selected' : ''}>${org.name}</option>`,
              )
              .join('') || '<option value="">Sin organizaciones</option>'}
          </select>
        </label>
        <label class="topbar-field">
          <span>Perfil</span>
          <select>
            <option>${topbarState.userLabel}</option>
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

    const organizationSwitcher = document.getElementById('organization-switcher');
    organizationSwitcher?.addEventListener('change', () => {
      const selectedId = Number(organizationSwitcher.value);
      const currentSession = window.AppSession.getSession();
      window.AppSession.setActiveOrganizationId(selectedId);
      const selected = (currentSession.organizations || []).find((org) => org.id === selectedId);
      const nameNode = document.getElementById('active-organization-name');
      if (nameNode) {
        nameNode.textContent = selected?.name || 'Sin organización activa';
      }
    });

    fetchSession()
      .then((sessionData) => {
        const current = window.AppSession.getSession();
        const preferredId = Number(current?.active_organization_id);
        const mergedSession = {
          ...sessionData,
          active_organization_id: preferredId || sessionData?.active_organization_id,
        };
        const normalizedSession = window.AppSession.save(mergedSession);
        localStorage.removeItem(LEGACY_ORG_KEY);
        const refreshedState = getTopbarState(normalizedSession);
        const orgNameNode = document.getElementById('active-organization-name');
        const userNode = document.getElementById('active-user-label');
        if (orgNameNode) {
          orgNameNode.textContent = refreshedState.activeOrganizationName;
        }
        if (userNode) {
          userNode.textContent = refreshedState.userLabel;
        }
        if (organizationSwitcher) {
          organizationSwitcher.innerHTML = refreshedState.organizations
            .map(
              (org) =>
                `<option value="${org.id}" ${org.id === refreshedState.activeOrganizationId ? 'selected' : ''}>${org.name}</option>`,
            )
            .join('');
          if (!refreshedState.organizations.length) {
            organizationSwitcher.innerHTML = '<option value="">Sin organizaciones</option>';
          }
        }
      })
      .catch((_error) => {});
  };
})();
