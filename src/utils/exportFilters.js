const moduleKeys = {
  tramites: ['q', 'semaforo', 'estado'], clientes: ['q'], agentes: ['q', 'status', 'empresa'],
  polizas: ['q', 'estatus', 'vencidas', 'hoy', 'tz_offset'], cobranza: ['q', 'estatus', 'poliza_id', 'desde', 'hasta'],
};

export function normalizeExportFilters(module, filters) {
  if (!moduleKeys[module] || !filters || typeof filters !== 'object' || Array.isArray(filters)) throw new TypeError('Filtros de exportación incompatibles.');
  const result = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!moduleKeys[module].includes(key)) throw new TypeError(`Filtro no admitido: ${key}`);
    if (value === undefined) continue;
    if (key === 'q') {
      if (value == null) continue;
      if (typeof value !== 'string') throw new TypeError('La búsqueda de exportación debe ser texto.');
      if (value.trim() !== '') result.q = value;
    } else {
      if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new TypeError(`Valor incompatible en ${key}`);
      result[key] = value;
    }
  }
  return result;
}

export const directExportMode = selectedIds => selectedIds.length ? 'selected' : 'filtered';
