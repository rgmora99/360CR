(function initCedulaPadron() {
  const PADRON_SOURCES = [
    '/services/docs/PADRON_COMPLETO.txt',
    '/docs/PADRON_COMPLETO.txt',
    '/docs/padron_completo.txt',
    '/docs/PADRON_ELECTORAL.TXT',
    '/docs/PADRON_ELECTORAL.txt',
    '/docs/padron-electoral.txt',
    '/docs/padron_electoral.txt',
    '/PADRON_ELECTORAL.TXT',
    '/padron-electoral.txt',
    '/padron_electoral.txt',
    '/docs/padron-electoral.csv',
    '/docs/padron-electoral.tsv',
  ];

  const state = {
    loaded: false,
    loadingPromise: null,
    byCedula: new Map(),
  };

  function normalizeCedula(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizeName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function splitLine(line) {
    if (line.includes('\t')) return line.split('\t').map((item) => item.trim());
    if (line.includes('|')) return line.split('|').map((item) => item.trim());
    if (line.includes(';')) return line.split(';').map((item) => item.trim());
    return line.split(',').map((item) => item.trim());
  }

  function cleanRawText(rawText) {
    const text = String(rawText || '');
    const hasEscapedNewlines = text.includes('\\n') && !text.includes('\n');
    return hasEscapedNewlines ? text.replace(/\\n/g, '\n') : text;
  }

  function looksLikeCedula(value) {
    return /^\d{9}$/.test(normalizeCedula(value));
  }

  function hasLetters(value) {
    return /[a-záéíóúñ]/i.test(String(value || ''));
  }

  function parseDelimitedRecord(line, columnIndexes = {}) {
    if (!/[,\t;|]/.test(line)) {
      return null;
    }

    const cols = splitLine(line);
    if (!cols.length) return null;

    const rawCedula = columnIndexes.cedula >= 0 ? cols[columnIndexes.cedula] : cols[0];
    const cedula = normalizeCedula(rawCedula);
    if (!looksLikeCedula(cedula)) {
      return null;
    }

    let fullName = '';
    if (columnIndexes.fullName >= 0 && cols[columnIndexes.fullName]) {
      fullName = cols[columnIndexes.fullName].trim();
    } else if (cols.length >= 4 && hasLetters(cols[1]) && hasLetters(cols[2])) {
      fullName = [cols[1], cols[2], cols[3]].filter(Boolean).join(' ').trim();
    } else {
      const nameCols = cols
        .filter((value, idx) => idx !== (columnIndexes.cedula >= 0 ? columnIndexes.cedula : 0))
        .filter((value) => hasLetters(value));
      fullName = nameCols.join(' ').trim();
    }

    if (!fullName) return null;

    return { cedula, fullName };
  }

  function parseFixedWidthRecord(line) {
    if (line.length < 111) {
      return null;
    }

    const cedula = normalizeCedula(line.slice(0, 9));
    if (!looksLikeCedula(cedula)) {
      return null;
    }

    const nombre = line.slice(29, 59).trim();
    const apellido1 = line.slice(59, 85).trim();
    const apellido2 = line.slice(85, 111).trim();
    const fullName = [nombre, apellido1, apellido2].filter(Boolean).join(' ').trim();

    if (!fullName) {
      return null;
    }

    return { cedula, fullName };
  }

  function parsePadron(rawText) {
    const lines = cleanRawText(rawText)
      .split(/\r?\n/)
      .map((line) => line.replace(/\r/g, ''))
      .filter((line) => line.trim().length > 0);

    if (!lines.length) {
      return new Map();
    }

    const firstCols = splitLine(lines[0]).map((column) => normalizeName(column));
    const hasHeader = firstCols.some((column) => ['cedula', 'cédula', 'identificacion', 'identificación', 'nombre', 'full_name'].includes(column));

    const headers = hasHeader ? splitLine(lines[0]).map((column) => normalizeName(column)) : [];
    const records = hasHeader ? lines.slice(1) : lines;

    const cedulaIdx = hasHeader
      ? headers.findIndex((header) => ['cedula', 'cédula', 'identificacion', 'identificación', 'documento'].includes(header))
      : 0;

    const fullNameIdx = hasHeader
      ? headers.findIndex((header) => ['nombre completo', 'nombre_completo', 'full_name', 'nombre', 'nombre y apellidos'].includes(header))
      : -1;

    const map = new Map();
    const columnIndexes = { cedula: cedulaIdx, fullName: fullNameIdx };

    records.forEach((line) => {
      const parsedDelimited = parseDelimitedRecord(line, columnIndexes);
      const parsedFixedWidth = parseFixedWidthRecord(line);
      const parsed = parsedDelimited || parsedFixedWidth;

      if (!parsed) return;

      const cedula = parsed.cedula;
      let fullName = parsed.fullName;

      if (!fullName || !looksLikeCedula(cedula)) return;

      map.set(cedula, {
        cedula,
        fullName,
        normalizedName: normalizeName(fullName),
      });
    });

    return map;
  }

  async function fetchSource(path) {
    const response = await fetch(path, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`No se encontró ${path}`);
    }
    return response.text();
  }

  async function ensureLoaded() {
    if (state.loaded) return state.byCedula;
    if (state.loadingPromise) return state.loadingPromise;

    state.loadingPromise = (async () => {
      let parsed = new Map();
      let lastError = null;

      const uniqueSources = [...new Set(PADRON_SOURCES)];
      for (const source of uniqueSources) {
        try {
          const text = await fetchSource(source);
          parsed = parsePadron(text);
          if (parsed.size) {
            console.info(`[Padrón] Cargado desde ${source} con ${parsed.size} registros.`);
            break;
          }
        } catch (error) {
          lastError = error;
        }
      }

      state.byCedula = parsed;
      state.loaded = true;

      if (!parsed.size && lastError) {
        console.warn('[Padrón] No se pudo cargar el padrón electoral.', lastError.message);
      }

      return state.byCedula;
    })();

    return state.loadingPromise;
  }

  function compareName(inputName, record) {
    const normalizedInput = normalizeName(inputName);
    if (!normalizedInput || !record?.normalizedName) return null;
    return normalizedInput === record.normalizedName;
  }

  async function resolveByCedula(cedula) {
    const data = await ensureLoaded();
    return data.get(normalizeCedula(cedula)) || null;
  }

  window.CedulaPadron = {
    ensureLoaded,
    resolveByCedula,
    compareName,
    normalizeCedula,
  };
})();
