(function initTablePaginator() {
  const STORAGE_PREFIX = 'cr360.table-pagination.';

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function readStoredPageSize(storageKey, pageSizeOptions, fallback) {
    try {
      const stored = Number(window.localStorage.getItem(storageKey));
      if (pageSizeOptions.includes(stored)) {
        return stored;
      }
    } catch (_error) {
      return fallback;
    }
    return fallback;
  }

  function buildPageNumbers(currentPage, totalPages) {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_value, index) => index + 1);
    }

    const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    if (currentPage <= 3) {
      pages.add(2);
      pages.add(3);
      pages.add(4);
    }
    if (currentPage >= totalPages - 2) {
      pages.add(totalPages - 1);
      pages.add(totalPages - 2);
      pages.add(totalPages - 3);
    }

    return Array.from(pages)
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((left, right) => left - right);
  }

  function create(options) {
    if (!options?.tableBody || typeof options.rowRenderer !== 'function') {
      return null;
    }

    const tableBody = options.tableBody;
    const totalColumns = Number(options.totalColumns || 1);
    const emptyMessage = options.emptyMessage || 'No hay registros para mostrar.';
    const pageSizeOptions = Array.isArray(options.pageSizeOptions) && options.pageSizeOptions.length
      ? options.pageSizeOptions.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
      : [5, 10, 20, 50];
    const defaultPageSize = pageSizeOptions.includes(Number(options.defaultPageSize))
      ? Number(options.defaultPageSize)
      : pageSizeOptions[1] || pageSizeOptions[0];
    const storageKey = `${STORAGE_PREFIX}${options.key || tableBody.id || 'default'}`;
    const controls = document.createElement('div');

    controls.className = 'table-paginator';
    controls.innerHTML = `
      <div class="table-paginator__summary"></div>
      <div class="table-paginator__config">
        <label class="table-paginator__size">
          <span>Mostrar</span>
          <select></select>
        </label>
      </div>
      <div class="table-paginator__actions"></div>
    `;

    const summaryNode = controls.querySelector('.table-paginator__summary');
    const actionsNode = controls.querySelector('.table-paginator__actions');
    const pageSizeSelect = controls.querySelector('select');
    pageSizeSelect.innerHTML = pageSizeOptions.map((value) => `<option value="${value}">${value}</option>`).join('');

    const tableWrap = tableBody.closest('.table-wrap');
    if (tableWrap?.parentNode) {
      tableWrap.parentNode.insertBefore(controls, tableWrap.nextSibling);
    } else {
      tableBody.parentNode?.appendChild(controls);
    }

    let items = [];
    let pageSize = readStoredPageSize(storageKey, pageSizeOptions, defaultPageSize);
    let currentPage = 1;
    pageSizeSelect.value = String(pageSize);

    function savePageSize() {
      try {
        window.localStorage.setItem(storageKey, String(pageSize));
      } catch (_error) {
        return;
      }
    }

    function renderControls(totalItems, totalPages, startIndex, endIndex) {
      if (!summaryNode || !actionsNode) {
        return;
      }

      if (!totalItems) {
        summaryNode.textContent = options.emptySummary || 'Sin registros para mostrar.';
      } else if (typeof options.summaryFormatter === 'function') {
        summaryNode.textContent = options.summaryFormatter({
          totalItems,
          totalPages,
          currentPage,
          pageSize,
          startIndex,
          endIndex,
        });
      } else {
        summaryNode.textContent = `Mostrando ${startIndex}-${endIndex} de ${totalItems} registros`;
      }

      if (totalPages <= 1) {
        actionsNode.innerHTML = '';
        controls.classList.toggle('is-compact', true);
        return;
      }

      controls.classList.toggle('is-compact', false);
      const visiblePages = buildPageNumbers(currentPage, totalPages);
      const markup = [];

      markup.push(
        `<button class="btn btn-secondary table-paginator__button" type="button" data-page="first" ${currentPage === 1 ? 'disabled' : ''}>Inicio</button>`,
      );
      markup.push(
        `<button class="btn btn-secondary table-paginator__button" type="button" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>`,
      );

      visiblePages.forEach((page, index) => {
        const previousPage = visiblePages[index - 1];
        if (previousPage && page - previousPage > 1) {
          markup.push('<span class="table-paginator__ellipsis">...</span>');
        }
        markup.push(
          `<button class="btn ${page === currentPage ? 'btn-primary' : 'btn-secondary'} table-paginator__button" type="button" data-page="${page}">${page}</button>`,
        );
      });

      markup.push(
        `<button class="btn btn-secondary table-paginator__button" type="button" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}>Siguiente</button>`,
      );
      markup.push(
        `<button class="btn btn-secondary table-paginator__button" type="button" data-page="last" ${currentPage === totalPages ? 'disabled' : ''}>Fin</button>`,
      );

      actionsNode.innerHTML = markup.join('');
    }

    function renderRows() {
      const totalItems = items.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      currentPage = clamp(currentPage, 1, totalPages);

      if (!totalItems) {
        tableBody.innerHTML = `<tr><td colspan="${totalColumns}">${escapeHtml(emptyMessage)}</td></tr>`;
        renderControls(0, 1, 0, 0);
        return;
      }

      const start = (currentPage - 1) * pageSize;
      const visibleItems = items.slice(start, start + pageSize);
      const startIndex = start + 1;
      const endIndex = start + visibleItems.length;

      tableBody.innerHTML = visibleItems.map((item, index) => options.rowRenderer(item, start + index)).join('');
      renderControls(totalItems, totalPages, startIndex, endIndex);
    }

    controls.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page]');
      if (!button) {
        return;
      }

      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      const target = button.dataset.page;

      if (target === 'first') currentPage = 1;
      else if (target === 'prev') currentPage = clamp(currentPage - 1, 1, totalPages);
      else if (target === 'next') currentPage = clamp(currentPage + 1, 1, totalPages);
      else if (target === 'last') currentPage = totalPages;
      else currentPage = clamp(Number(target) || 1, 1, totalPages);

      renderRows();
    });

    pageSizeSelect.addEventListener('change', () => {
      pageSize = Number(pageSizeSelect.value) || defaultPageSize;
      currentPage = 1;
      savePageSize();
      renderRows();
    });

    return {
      update(nextItems) {
        items = Array.isArray(nextItems) ? nextItems.slice() : [];
        renderRows();
      },
      refresh() {
        renderRows();
      },
      reset() {
        currentPage = 1;
        renderRows();
      },
    };
  }

  window.TablePaginator = { create };
})();
