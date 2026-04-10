(function initCedulaPadron() {
  const PADRON_API_URL = '/api/padron/lookup/';
  const PADRON_SOURCES = [
    '/docs/PADRON_COMPLETO.txt',
    '/docs/padron_completo.txt',
    '/docs/padron-electoral.txt',
    '/docs/padron-electoral.csv',
    '/docs/padron-electoral.tsv',
    '/PADRON_COMPLETO.txt',
    '/padron_completo.txt'
  ];

  const state = {
    loaded: false,
    loadingPromise: null,
    byCedula: new Map(),
    loadedSource: null,
    apiEnabled: true,
    apiCache: new Map(),
  };

  function log(level, message, payload) {
    const fn = console[level] || console.log;
    fn(`[Padrón] ${message}`, payload || '');
  }

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

  function buildRecord(cedula, fullName) {
    return {
      cedula,
      fullName,
      normalizedName: normalizeName(fullName),
    };
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

      map.set(cedula, buildRecord(cedula, fullName));
    });

    return map;
  }

  function looksLikeHtmlDocument(rawText) {
    const text = String(rawText || '').trim().toLowerCase();
    return text.startsWith('<!doctype html') || text.startsWith('<html');
  }

  async function fetchSource(path) {
    const response = await fetch(path, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`No se encontró ${path}`);
    }
    const text = await response.text();

    if (looksLikeHtmlDocument(text)) {
      throw new Error(`La ruta ${path} devolvió HTML (probablemente index.html), no el TXT del padrón.`);
    }

    return text;
  }

  async function ensureLoaded() {
    if (state.loaded) return state.byCedula;
    if (state.loadingPromise) return state.loadingPromise;

    state.loadingPromise = (async () => {
      let parsed = new Map();
      let lastError = null;

      const uniqueSources = [...new Set(PADRON_SOURCES)];
      log('info', 'Iniciando carga del padrón.', { sources: uniqueSources });
      for (const source of uniqueSources) {
        try {
          log('info', `Intentando cargar fuente: ${source}`);
          const text = await fetchSource(source);
          parsed = parsePadron(text);
          if (parsed.size) {
            state.loadedSource = source;
            log('info', `Cargado desde ${source} con ${parsed.size} registros.`);
            break;
          }
          log('warn', `La fuente ${source} fue leída pero no produjo registros válidos.`, {
            hint: 'Verifica que el TXT tenga cédula + nombre por línea y que no sea un documento informativo.',
            preview: text.slice(0, 120),
          });
        } catch (error) {
          lastError = error;
          log('warn', `Falló la fuente ${source}.`, error?.message || error);
        }
      }

      state.byCedula = parsed;
      state.loaded = true;

      if (!parsed.size && lastError) {
        log('warn', 'No se pudo cargar el padrón electoral.', {
          error: lastError.message,
          hint: 'Copia el archivo PADRON_COMPLETO.txt (o padron-electoral.txt/csv/tsv) dentro de services/frontend/docs/ y reconstruye el contenedor frontend.',
        });
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

  async function resolveByCedulaApi(cedula) {
    if (!state.apiEnabled) return null;

    if (state.apiCache.has(cedula)) {
      return state.apiCache.get(cedula);
    }

    const url = `${PADRON_API_URL}?cedula=${encodeURIComponent(cedula)}`;
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });

    if (response.status === 404) {
      state.apiCache.set(cedula, null);
      return null;
    }

    if (!response.ok) {
      throw new Error(`Error consultando padrón por API (${response.status}).`);
    }

    const payload = await response.json();
    const fullName = payload?.full_name || payload?.fullName || '';
    if (!fullName) {
      state.apiCache.set(cedula, null);
      return null;
    }

    const record = buildRecord(cedula, fullName);
    state.apiCache.set(cedula, record);
    return record;
  }

  async function resolveByCedula(cedula) {
    const normalizedCedula = normalizeCedula(cedula);
    if (!looksLikeCedula(normalizedCedula)) return null;

    try {
      const apiMatch = await resolveByCedulaApi(normalizedCedula);
      if (apiMatch) {
        log('info', `Cédula ${normalizedCedula} encontrada por API.`, { fullName: apiMatch.fullName, loadedSource: PADRON_API_URL });
        return apiMatch;
      }
      if (state.apiCache.has(normalizedCedula) && state.apiCache.get(normalizedCedula) === null) {
        return null;
      }
    } catch (error) {
      state.apiEnabled = false;
      log('warn', 'API de padrón no disponible, usando fallback local.', error?.message || error);
    }

    const data = await ensureLoaded();
    const match = data.get(normalizedCedula) || null;

    if (!match) {
      const sampleKeys = Array.from(data.keys()).slice(0, 5);
      log('warn', `No se encontró cédula ${normalizedCedula}.`, {
        loaded: state.loaded,
        loadedSource: state.loadedSource,
        records: data.size,
        sampleKeys,
      });
      return null;
    }

    log('info', `Cédula ${normalizedCedula} encontrada.`, { fullName: match.fullName, loadedSource: state.loadedSource });
    return match;
  }

  window.CedulaPadron = {
    ensureLoaded,
    resolveByCedula,
    compareName,
    normalizeCedula,
  };
})();
