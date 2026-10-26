import { useEffect, useState } from 'react';
import { apiFetch } from './apiClient';

// Contracts: gseaback DashboardController::summary/cobranzaSummary and
// CalendarController::events. apiFetch returns the decoded JSON body directly.
export function dashboardPath(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) query.set(key, value);
  });
  return `${path}${query.size ? `?${query}` : ''}`;
}

export function validateDashboardResponse(path, data) {
  const route = path.split('?')[0];
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isNumber = value => typeof value === 'number' && Number.isFinite(value);
  let valid = data && typeof data === 'object';
  if (route === '/dashboard/summary') {
    valid = valid
      && isNumber(data.workspace_id)
      && isObject(data.kpis)
      && ['clientes_total', 'polizas_vendidas', 'prima_mensual', 'tasa_renovacion', 'polizas_vencidas']
        .every(key => isNumber(data.kpis[key]))
      && isObject(data.charts)
      && ['distribucion_polizas', 'ventas_mensuales', 'polizas_por_ramo', 'cartera_por_aseguradora']
        .every(key => Array.isArray(data.charts[key]))
      && isObject(data.operativa)
      && ['cobros_pendientes', 'acciones_urgentes', 'polizas_vencidas', 'eventos_proximos']
        .every(key => Array.isArray(data.operativa[key]))
      && isObject(data.cobranza)
      && ['pagada', 'pendiente', 'vencida'].every(key =>
        isObject(data.cobranza[key])
        && isNumber(data.cobranza[key].cantidad)
        && isNumber(data.cobranza[key].monto)
      )
      && isObject(data.tramites)
      && isNumber(data.tramites.total)
      && isNumber(data.tramites.atencion)
      && Array.isArray(data.tramites.por_etapa)
      && Array.isArray(data.tramites.por_semaforo)
      && isObject(data.objetivo)
      && ['current', 'target', 'progress_pct'].every(key => isNumber(data.objetivo[key]));
  } else if (route === '/cobranza_cuotas') {
    valid = valid && Array.isArray(data.data) && Number.isFinite(Number(data.total));
  } else if (route === '/calendar/events') {
    valid = valid && Array.isArray(data.listado?.data) && Number.isFinite(Number(data.listado?.total));
  } else if (route === '/aseguradoras' || route === '/agentes_workspace' || route === '/cobranza_cuotas') {
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
    const controller = new AbortController();
    // The deferred request is cancelled during StrictMode's discarded mount.
    const timer = setTimeout(async () => {
      try {
        const data = validateDashboardResponse(path, await apiFetch(path, { signal: controller.signal }));
        if (active) setResult({ scope, path, attempt, data });
      } catch (error) {
        if (active && error.name !== 'AbortError') {
          console.error('Dashboard request failed', { path, status: error.status, error: error.message });
          setResult({ scope, path, attempt, error });
        }
      }
    }, 0);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [path, scope, attempt]);
  const current = result?.scope === scope && result?.path === path && result?.attempt === attempt ? result : null;
  return { ...current, loading: Boolean(path) && !current, retry: () => setAttempt(value => value + 1) };
}
