import { useEffect, useState } from 'react';
import { apiFetch } from './apiClient';
import { TOKEN_KEY } from './constants';
import { createDashboardRequestPool } from './dashboardRequests';

const acquireDashboardRequest = createDashboardRequestPool(apiFetch);

export function dashboardPath(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) query.set(key, value);
  });
  return `${path}${query.size ? `?${query}` : ''}`;
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const amount = value => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);

export function adaptTramitesSemaforo(tramites) {
  const unavailable = { por_semaforo: [], sin_semaforo_valido: null };
  const rows = tramites?.totales_por_semaforo;
  if (!Array.isArray(rows) || !Number.isInteger(tramites?.total) || tramites.total < 0) return unavailable;
  const counts = { verde: 0, amarillo: 0, rojo: 0, sin_semaforo_valido: 0 };
  const seen = new Set();
  for (const row of rows) {
    if (!object(row) || !Object.hasOwn(counts, row.semaforo) || seen.has(row.semaforo) ||
        !Number.isInteger(row.total) || row.total < 0) return unavailable;
    seen.add(row.semaforo);
    counts[row.semaforo] = row.total;
  }
  if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== tramites.total) return unavailable;
  return {
    por_semaforo: ['verde', 'amarillo', 'rojo'].map(color => ({
      name: color[0].toUpperCase() + color.slice(1), color, value: counts[color],
    })),
    sin_semaforo_valido: counts.sin_semaforo_valido,
  };
}

export function adaptDashboardSummary(data) {
  if (!object(data) || !finite(data.workspace_id)) throw new Error('Respuesta de dashboard inválida');
  const periodo = data.resumen_periodo;
  const tramites = data.tramites;
  const mxn = Array.isArray(periodo?.por_moneda) ? periodo.por_moneda.find(item => item.moneda === 'MXN') : null;
  const etapas = Array.isArray(tramites?.totales_por_etapa) ? tramites.totales_por_etapa : [];
  const graficas = object(data.graficas) ? data.graficas : {};
  return {
    kpis: {
      clientes_total: finite(data.clientes_total) ? data.clientes_total : null,
      polizas_vendidas: finite(periodo?.polizas_emitidas) ? periodo.polizas_emitidas : null,
      prima_mensual: mxn ? amount(mxn.prima_total) : (Array.isArray(periodo?.por_moneda) ? 0 : null),
      tasa_renovacion: finite(data.tasa_renovacion) ? data.tasa_renovacion : null,
      renovaciones_registradas: finite(data.renovaciones_registradas) ? data.renovaciones_registradas : null,
      polizas_vencidas: finite(data.polizas_vencidas) ? data.polizas_vencidas : null,
    },
    objetivo: { current: null, target: null, progress_pct: null },
    charts: {
      ventas_mensuales: Array.isArray(graficas.ventas_mensuales_mxn) ? graficas.ventas_mensuales_mxn : [],
      distribucion_polizas: [],
      polizas_por_ramo: Array.isArray(graficas.polizas_por_ramo) ? graficas.polizas_por_ramo : [],
      cartera_por_aseguradora: Array.isArray(graficas.cartera_por_aseguradora) ? graficas.cartera_por_aseguradora : [],
    },
    cobranza: {
      pagada: { cantidad: null, monto: null },
      pendiente: { cantidad: null, monto: null },
      vencida: { cantidad: null, monto: null },
      total_recuperacion: { cantidad: null, monto: null },
    },
    tramites: {
      total: finite(tramites?.total) ? tramites.total : null,
      atencion: finite(tramites?.estados?.en_atencion) ? tramites.estados.en_atencion : null,
      sin_estado: finite(tramites?.estados?.sin_estado) ? tramites.estados.sin_estado
        : finite(tramites?.sin_estado_conocido) ? tramites.sin_estado_conocido : null,
      por_etapa: etapas.map(item => ({ name: item.etapa || 'Sin etapa', value: Number(item.total) || 0 })),
      ...adaptTramitesSemaforo(tramites),
    },
    operativa: { acciones_urgentes: [], cobros_pendientes: [], polizas_vencidas: [], eventos_proximos: [] },
    polizas_por_vencer: data.polizas_por_vencer,
  };
}

export function adaptDashboardCobranza(data) {
  if (!object(data)) throw new Error('Respuesta de cobranza inválida');
  const getGroup = group => {
    if (!object(group)) return { cantidad: null, monto: null };
    return { cantidad: finite(group.cantidad) ? group.cantidad : null,
      monto: amount(group.montos_por_moneda?.MXN) };
  };
  const vencida = getGroup(data.vencidas);
  const total = getGroup(data.totales_generales);
  // Pendiente aún no vencida = total no pagado menos vencido. No mezcla monedas.
  const pendiente = {
    cantidad: total.cantidad != null && vencida.cantidad != null ? Math.max(0, total.cantidad - vencida.cantidad) : null,
    monto: total.monto != null && vencida.monto != null ? Math.max(0, Math.round((total.monto - vencida.monto) * 100) / 100) : null,
  };
  return {
    vencida, pendiente, total_recuperacion: total,
    pagada: {
      ...getGroup(data.pagadas),
      montos_por_moneda: object(data.pagadas?.montos_por_moneda)
        ? Object.fromEntries(Object.entries(data.pagadas.montos_por_moneda).map(([currency, value]) => [currency, amount(value)]))
        : null,
    },
    hoy: getGroup(data.hoy),
    proximos: getGroup(data.proximos_7_dias),
    casos_prioritarios: Array.isArray(data.casos_prioritarios) ? data.casos_prioritarios : [],
  };
}

export function adaptDashboardAgenda(data) {
  const invalid = () => {
    const error = new Error('Respuesta incompatible de agenda');
    error.name = 'DashboardContractError';
    throw error;
  };
  const events = data?.listado?.data;
  const total = data?.listado?.total;
  if (!object(data) || !Array.isArray(events) || !Number.isInteger(total) || total < 0 ||
      data.total !== total || events.length > total || (total > 0 && events.length === 0) ||
      typeof data.timezone !== 'string') invalid();
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('es-MX', {
      timeZone: data.timezone, day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { invalid(); }
  if (events.some(item => !object(item) || item.id == null ||
      typeof item.starts_at !== 'string' || !Number.isFinite(Date.parse(item.starts_at)))) invalid();
  return {
    total,
    events: [...events].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
      .slice(0, 4).map(item => ({
        ...item, type: 'evento', event_id: item.id,
        title: item.title || 'Evento próximo', detail: formatter.format(new Date(item.starts_at)),
      })),
  };
}

export function dashboardAgendaError(error) {
  if (error?.status === 401 || error?.status === 403) return 'Sin permisos para consultar la agenda.';
  if (error?.name === 'DashboardContractError') return 'Respuesta incompatible de la agenda.';
  return 'No se pudo consultar la agenda. Revisa la conexión e intenta de nuevo.';
}

export function validateDashboardResponse(path, data) {
  const route = path.split('?')[0];
  let valid = object(data);
  if (route === '/dashboard/summary') {
    valid = valid && finite(data.workspace_id) && ('resumen_periodo' in data) && ('tramites' in data);
  } else if (route === '/dashboard/totales') {
    valid = valid && finite(data.workspace_id) && ['clientes_total', 'polizas_vencidas'].every(key =>
      Object.hasOwn(data, key) && (data[key] === null || (Number.isInteger(data[key]) && data[key] >= 0)));
  } else if (route === '/dashboard/cobranza' || route === '/dashboard/cobranza-resumen') {
    valid = valid && object(data.totales_generales) && object(data.vencidas);
  } else if (route === '/calendar/events') {
    valid = valid && Array.isArray(data.listado?.data) && Number.isFinite(Number(data.listado?.total));
  } else if (route === '/dashboard/metas-comerciales') {
    valid = valid && typeof data.disponible === 'boolean' && finite(data.workspace_id) &&
      typeof data.puede_crear === 'boolean' && typeof data.puede_editar === 'boolean' &&
      Array.isArray(data.metas) && data.metas.every(item => object(item) && finite(item.id) &&
        /^[A-Z]{3}$/.test(item.moneda) && amount(item.importe_objetivo) > 0 &&
        amount(item.prima_emitida) != null && finite(item.cumplimiento_pct) && finite(item.polizas_emitidas));
  } else if (['/aseguradoras', '/agentes_workspace', '/cobranza_cuotas'].includes(route)) {
    valid = valid && Array.isArray(data.data) && Number.isFinite(Number(data.total));
  }
  if (!valid) {
    const error = new Error(`Respuesta incompatible en ${route}`);
    error.name = 'DashboardContractError';
    throw error;
  }
  return data;
}

export function useDashboardResource(path, scope) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    let active = true;
    let request;
    try {
      request = acquireDashboardRequest(JSON.stringify([scope, localStorage.getItem(TOKEN_KEY)]), path);
      request.promise.then((raw) => {
        const data = validateDashboardResponse(path, raw);
        if (active) setResult({ scope, path, attempt, data });
      }).catch((error) => {
        if (active && error.name !== 'AbortError') {
          console.error('Dashboard request failed', { path, status: error.status, error: error.message });
          setResult({ scope, path, attempt, error });
        }
      });
    } catch (error) {
      if (active) setResult({ scope, path, attempt, error });
    }
    return () => { active = false; request?.release(); };
  }, [path, scope, attempt]);
  const current = result?.scope === scope && result?.path === path && result?.attempt === attempt ? result : null;
  return { ...current, loading: Boolean(path) && !current, retry: () => setAttempt(value => value + 1) };
}
