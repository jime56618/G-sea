import { useEffect, useReducer, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getActiveWorkspaceId } from './workspaceStorage';
import { API_URL } from './constants';
import { authHeaders } from './apiClient';
import { emptySelection, selectionReducer, isRecordSelected } from './recordSelection';
import { normalizeExportFilters, directExportMode } from './exportFilters';

const permissionsByModule = { tramites: 'tramites.view', clientes: 'contratantes.view', agentes: 'agentes.view', polizas: 'polizas.view', cobranza: 'cobranza.view' };
const errorMessage = (status, body) => status === 403 ? 'No tienes permiso para exportar estos registros.'
  : status === 401 ? 'Tu sesión no está disponible. Vuelve a iniciar sesión.'
    : Object.values(body?.errors || {}).flat().join(' ') || body?.message || 'No se pudo completar la exportación.';

export function useRecordExport(module, filters, visibleIds, rowsLoading = false) {
  const { currentWorkspace, permissions } = useAuth();
  const workspaceId = currentWorkspace?.id ?? getActiveWorkspaceId();
  const allowed = permissions.includes(permissionsByModule[module]);
  const filterKey = JSON.stringify(normalizeExportFilters(module, filters));
  const scope = JSON.stringify([module, workspaceId, filterKey, allowed]);
  const scopeRef = useRef(scope);
  useEffect(() => { scopeRef.current = scope; }, [scope]);
  const [stored, dispatch] = useReducer(selectionReducer, scope, emptySelection);
  useEffect(() => { dispatch({ type: 'clear', scope }); }, [scope]);
  const selection = stored.scope === scope ? stored : emptySelection(scope);
  const [pageResult, setPageResult] = useState(null);
  const pageKey = JSON.stringify(visibleIds);
  const [requestState, setRequestState] = useState(null);
  const downloadController = useRef(null);

  useEffect(() => {
    if (!workspaceId || !allowed || rowsLoading) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/exports/${module}/count`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ workspace_id: workspaceId, filters: JSON.parse(filterKey), ids: JSON.parse(pageKey) }), signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(errorMessage(response.status, body));
        if (!Array.isArray(body.accessible_ids) || Number(body.workspace_id) !== Number(workspaceId)) throw new Error('Respuesta de selección incompatible.');
        if (!controller.signal.aborted) setPageResult({ scope, pageKey, ids: body.accessible_ids });
      } catch (error) { if (!controller.signal.aborted) setPageResult({ scope, pageKey, ids: [], error: error.message }); }
    };
    load();
    return () => controller.abort();
  }, [scope, pageKey, module, workspaceId, filterKey, allowed, rowsLoading]);

  useEffect(() => () => { downloadController.current?.abort(); }, [scope]);
  const request = requestState?.scope === scope ? requestState : null;
  const selectedCount = selection.ids.length;
  const disabled = !allowed || !workspaceId || rowsLoading || Boolean(request?.busy);
  const page = pageResult?.scope === scope && pageResult?.pageKey === pageKey ? pageResult : null;
  const accessibleIds = page?.ids || [];
  const toggle = (ids, checked) => { if (!disabled && page) dispatch({ type: 'toggle', scope, ids: ids.filter(id => accessibleIds.includes(id)), checked }); };

  const download = async () => {
    const mode = directExportMode(selection.ids);
    if (disabled) return;
    if (mode === 'selected' && !selectedCount) return;
    const requestScope = scope;
    const controller = new AbortController(); downloadController.current = controller;
    setRequestState({ scope, busy: true });
    try {
      const response = await fetch(`${API_URL}/exports/${module}`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), signal: controller.signal,
        body: JSON.stringify({ workspace_id: workspaceId, mode, filters: JSON.parse(filterKey), ids: selection.ids }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(errorMessage(response.status, body)); }
      if (!response.headers.get('content-type')?.includes('spreadsheetml.sheet')) throw new Error('El servidor no devolvió un archivo Excel válido.');
      const blob = await response.blob();
      if (controller.signal.aborted || scopeRef.current !== requestScope || Number(getActiveWorkspaceId()) !== Number(workspaceId)) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] || `gsea-${module}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setRequestState({ scope });
    } catch (error) { if (!controller.signal.aborted) setRequestState({ scope, error: error.message }); }
    finally { if (!controller.signal.aborted) setRequestState(previous => previous?.scope === scope && previous.busy ? { scope } : previous); }
  };

  return { allowed, disabled, selectedCount, busy: Boolean(request?.busy),
    error: request?.error || '',
    dismissError: () => setRequestState({ scope }),
    selectable: id => !disabled && accessibleIds.includes(id),
    selected: id => accessibleIds.includes(id) && isRecordSelected(selection, id), toggle,
    pageDisabled: disabled || !accessibleIds.length,
    pageChecked: accessibleIds.length > 0 && accessibleIds.every(id => isRecordSelected(selection, id)),
    pagePartial: accessibleIds.some(id => isRecordSelected(selection, id)) && !accessibleIds.every(id => isRecordSelected(selection, id)),
    togglePage: checked => toggle(accessibleIds, checked),
    download,
  };
}
