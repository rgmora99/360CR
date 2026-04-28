(function initSharedNavigation() {
  const SESSION_KEY = 'cr360.session';
  const LEGACY_ORG_KEY = 'activeOrganizationId';
  const ORG_FLASH_KEY = 'cr360.organization.flash';

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

  function getActiveOrganization(sessionData) {
    const normalized = normalizeSession(sessionData);
    const organizations = normalized.organizations || [];
    const activeOrganizationId = Number(normalized.active_organization_id);
    return organizations.find((item) => Number(item.id) === activeOrganizationId) || organizations[0] || null;
  }

  function getActiveModuleCodes(sessionData) {
    const activeOrganization = getActiveOrganization(sessionData);
    return new Set(Array.isArray(activeOrganization?.active_modules) ? activeOrganization.active_modules : []);
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
    getActiveOrganization() {
      return getActiveOrganization(this.getSession());
    },
    getActiveModuleCodes() {
      return Array.from(getActiveModuleCodes(this.getSession()));
    },
    setActiveOrganizationId(organizationId) {
      const current = this.getSession();
      const selectedId = Number(organizationId);
      const exists = (current.organizations || []).some((org) => Number(org.id) === selectedId);
      const next = {
        ...current,
        active_organization_id: exists ? selectedId : current.active_organization_id,
      };
      const normalizedNext = normalizeSession(next);
      saveSession(normalizedNext);
      window.dispatchEvent(
        new CustomEvent('app:organization-changed', {
          detail: {
            previousOrganizationId: Number(current.active_organization_id) || null,
            activeOrganizationId: Number(normalizedNext.active_organization_id) || null,
          },
        }),
      );
    },
  };

  function hidePageOrganizationControl() {
    const pageOrganizationField = document.getElementById('organization-id');
    if (!pageOrganizationField) {
      return;
    }

    pageOrganizationField.setAttribute('aria-hidden', 'true');
    pageOrganizationField.setAttribute('tabindex', '-1');

    const safeContainer =
      pageOrganizationField.closest('.organization-inline-field') ||
      pageOrganizationField.closest('label');

    if (safeContainer) {
      safeContainer.classList.add('organization-control-hidden');
      return;
    }

    pageOrganizationField.classList.add('organization-control-hidden');
  }

  function showPendingOrganizationToast() {
    const raw = sessionStorage.getItem(ORG_FLASH_KEY);
    if (!raw) {
      return;
    }

    sessionStorage.removeItem(ORG_FLASH_KEY);

    try {
      const payload = JSON.parse(raw);
      const organizationName = String(payload?.organizationName || '').trim();
      if (organizationName && window.appAlerts?.toast) {
        window.appAlerts.toast(`Negocio cambiado a ${organizationName}.`, 'success');
      }
    } catch (_error) {
    }
  }

  async function fetchSession() {
    const response = await fetch('/api/auth/session/', {
      credentials: 'include',
    });

    const bodyText = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const payload = bodyText && contentType.includes('application/json') ? JSON.parse(bodyText) : {};

    if (!response.ok) {
      throw new Error(payload?.detail || 'Sesion no disponible');
    }

    return payload;
  }

  async function logoutSession() {
    const response = await fetch('/api/auth/logout/', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok && response.status !== 204) {
      throw new Error('No fue posible cerrar la sesion.');
    }
  }

  function getUserNameParts(email) {
    const raw = String(email || '').trim();
    const localPart = raw.split('@')[0] || 'Invitado';
    const normalized = localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const displayName = normalized
      ? normalized
          .split(' ')
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ')
      : 'Invitado';
    const initials = displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'IN';
    return { displayName, initials };
  }

  function getTopbarState(sessionData) {
    const organizations = sessionData?.organizations || [];
    const activeOrganization = getActiveOrganization(sessionData);
    const email = sessionData?.user?.email || 'Invitado';
    const userInfo = getUserNameParts(email);

    return {
      organizations,
      activeOrganizationId: activeOrganization?.id || '',
      activeOrganizationName: activeOrganization?.name || 'Sin organizacion activa',
      userLabel: email,
      userDisplayName: userInfo.displayName,
      userInitials: userInfo.initials,
    };
  }

  function buildMenuItems() {
    return [
      { key: 'inicio', label: 'Inicio', href: '/dashboard.html', moduleCode: 'dashboard' },
      {
        key: 'clientes-menu',
        label: 'Clientes',
        children: [
          { key: 'clientes-gestion', label: 'Gestion', href: '/customers.html', moduleCode: 'customers' },
          { key: 'clientes-listado', label: 'Listado', href: '/customers-list.html', moduleCode: 'customers' },
        ],
      },
      {
        key: 'proveedores-menu',
        label: 'Proveedores',
        children: [
          { key: 'proveedores-gestion', label: 'Gestion', href: '/suppliers.html', moduleCode: 'suppliers' },
          { key: 'proveedores-listado', label: 'Listado', href: '/suppliers-list.html', moduleCode: 'suppliers' },
        ],
      },
      {
        key: 'agenda-menu',
        label: 'Agenda',
        children: [
          { key: 'agenda-eventos', label: 'Eventos programados', href: '/agenda-eventos.html', moduleCode: 'agenda' },
          { key: 'agenda-crear', label: 'Crear evento', href: '/agenda-crear.html', moduleCode: 'agenda' },
        ],
      },
      {
        key: 'facturacion-menu',
        label: 'Facturacion',
        children: [
          { key: 'facturacion-listado', label: 'Listado de facturas', href: '/facturas.html', moduleCode: 'billing_basic' },
          { key: 'facturacion-registrar', label: 'Registrar factura', href: '/facturacion.html', moduleCode: 'billing_basic' },
          { key: 'facturacion-envios', label: 'Control de envios', href: '/envios.html', moduleCode: 'shipping' },
          { key: 'facturacion-cxc', label: 'Cuentas x cobrar', href: '/cuentas-cobrar.html', moduleCode: 'receivables' },
        ],
      },
      {
        key: 'compras-menu',
        label: 'Compras',
        children: [
          { key: 'compras-registrar', label: 'Registrar compra', href: '/compras.html', moduleCode: 'purchases' },
          { key: 'compras-listado', label: 'Listado de compras', href: '/compras-listado.html', moduleCode: 'purchases' },
          { key: 'bandeja-facturas', label: 'Bandeja facturas', href: '/bandeja-facturas.html', moduleCode: 'purchases' },
          { key: 'impuestos', label: 'Impuestos RTS', href: '/impuestos.html', moduleCode: 'purchases' },
        ],
      },
      { key: 'inventario', label: 'Inventario', href: '/inventario.html', moduleCode: 'inventory' },
      { key: 'marketing', label: 'Marketing automatico', href: '#', moduleCode: 'campaigns' },
      { key: 'fidelizacion', label: 'Fidelizacion de clientes', href: '/fidelizacion.html', moduleCode: 'loyalty' },
      { key: 'configuraciones', label: 'Configuraciones', href: '/configuraciones.html', alwaysVisible: true },
    ];
  }

  function filterMenuItemsByModules(menuItems, moduleCodes) {
    return menuItems
      .map((item) => {
        if (item.alwaysVisible) {
          return item;
        }

        if (item.children?.length) {
          const filteredChildren = item.children.filter((child) => child.alwaysVisible || !child.moduleCode || moduleCodes.has(child.moduleCode));
          if (!filteredChildren.length) {
            return null;
          }
          return { ...item, children: filteredChildren };
        }

        if (!item.moduleCode || moduleCodes.has(item.moduleCode)) {
          return item;
        }

        return null;
      })
      .filter(Boolean);
  }

  window.renderSharedNavigation = function renderSharedNavigation(options) {
    const activeModule = options?.activeModule || 'inicio';

    const sidebar = document.getElementById('shared-sidebar');
    const topbar = document.getElementById('shared-topbar');
    const layout = document.querySelector('.dashboard-layout');

    if (!sidebar || !topbar || !layout) {
      return;
    }

    const cachedSession = window.AppSession.getSession();
    const topbarState = getTopbarState(cachedSession);
    const filteredMenuItems = filterMenuItemsByModules(buildMenuItems(), getActiveModuleCodes(cachedSession));

    if (cachedSession?.user?.is_system_owner) {
      filteredMenuItems.push({ key: 'system-admin', label: 'Administracion SaaS', href: '/saas-admin.html', alwaysVisible: true });
    }

    const menuMarkup = filteredMenuItems
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
          <p>Panel de operacion</p>
        </div>
        <nav class="sidebar-nav">
          ${menuMarkup}
        </nav>
      </div>
      <a class="btn btn-secondary" href="/">Salir</a>
    `;

    topbar.className = 'topbar card';
    topbar.innerHTML = `
      <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Abrir menu">☰</button>
      <div class="workspace">
        <p class="label">Emprendimiento activo</p>
        <strong id="active-organization-name">${topbarState.activeOrganizationName}</strong>
        <p class="subtitle">Contexto de trabajo activo</p>
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
        <div class="profile-menu" data-profile-menu>
          <button
            class="profile-trigger"
            id="profile-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-controls="profile-dropdown"
          >
            <span class="profile-avatar" id="profile-avatar">${topbarState.userInitials}</span>
            <span class="profile-trigger-copy">
              <strong id="active-user-name">${topbarState.userDisplayName}</strong>
              <span id="active-user-label">${topbarState.userLabel}</span>
            </span>
          </button>
          <div class="profile-dropdown" id="profile-dropdown" role="menu" aria-hidden="true">
            <div class="profile-dropdown__header">
              <strong id="profile-dropdown-name">${topbarState.userDisplayName}</strong>
              <span id="profile-dropdown-email">${topbarState.userLabel}</span>
            </div>
            <a class="profile-dropdown__item" href="/configuraciones.html#perfil" role="menuitem">Mi perfil</a>
            <a class="profile-dropdown__item" href="/configuraciones.html#preferencias" role="menuitem">Preferencias</a>
            <button class="profile-dropdown__item profile-dropdown__item--danger" id="logout-button" type="button" role="menuitem">Cerrar sesion</button>
          </div>
        </div>
      </div>
    `;

    hidePageOrganizationControl();
    showPendingOrganizationToast();

    const menuToggleButton = document.getElementById('menu-toggle');
    const overlay = document.createElement('button');
    overlay.type = 'button';
    overlay.className = 'sidebar-overlay';
    overlay.setAttribute('aria-label', 'Cerrar menu');
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
    const profileMenu = topbar.querySelector('[data-profile-menu]');
    const profileTrigger = document.getElementById('profile-trigger');
    const profileDropdown = document.getElementById('profile-dropdown');
    const logoutButton = document.getElementById('logout-button');

    const closeProfileMenu = () => {
      profileMenu?.classList.remove('is-open');
      profileTrigger?.setAttribute('aria-expanded', 'false');
      profileDropdown?.setAttribute('aria-hidden', 'true');
    };

    const openProfileMenu = () => {
      profileMenu?.classList.add('is-open');
      profileTrigger?.setAttribute('aria-expanded', 'true');
      profileDropdown?.setAttribute('aria-hidden', 'false');
    };

    profileTrigger?.addEventListener('click', () => {
      const isOpen = profileMenu?.classList.contains('is-open');
      if (isOpen) {
        closeProfileMenu();
        return;
      }
      openProfileMenu();
    });

    document.addEventListener('click', (event) => {
      if (!profileMenu?.contains(event.target)) {
        closeProfileMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeProfileMenu();
      }
    });

    logoutButton?.addEventListener('click', async () => {
      logoutButton.disabled = true;
      try {
        await logoutSession();
      } catch (_error) {
      } finally {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LEGACY_ORG_KEY);
        window.location.href = '/';
      }
    });

    organizationSwitcher?.addEventListener('change', () => {
      const selectedId = Number(organizationSwitcher.value);
      const previousId = Number(window.AppSession.getActiveOrganizationId());
      if (!selectedId || selectedId === previousId) {
        return;
      }
      const currentSession = window.AppSession.getSession();
      window.AppSession.setActiveOrganizationId(selectedId);
      const selected = (currentSession.organizations || []).find((org) => Number(org.id) === selectedId);
      const nameNode = document.getElementById('active-organization-name');
      if (nameNode) {
        nameNode.textContent = selected?.name || 'Sin organizacion activa';
      }
      sessionStorage.setItem(
        ORG_FLASH_KEY,
        JSON.stringify({
          organizationId: selectedId,
          organizationName: selected?.name || '',
        }),
      );
      window.location.reload();
    });
  };

  fetchSession()
    .then((session) => {
      window.AppSession.save(session);
    })
    .catch(() => null);
})();
