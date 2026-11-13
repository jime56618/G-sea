import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/apiClient';
import { dashboardPath, useDashboardResource } from '../utils/dashboardService';

const initialPeriod = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Merida', year: 'numeric', month: '2-digit',
}).formatToParts(new Date()).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});
const amountLabel = (value, currency) => value == null ? 'No disponible'
  : `${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export default function MetaComercial() {
  const { currentWorkspace, user } = useAuth();
  const [period, setPeriod] = useState(() => { const p = initialPeriod(); return `${p.year}-${p.month}`; });
  const [currency, setCurrency] = useState('MXN');
  const [editing, setEditing] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [year, month] = period.split('-').map(Number);
  const path = currentWorkspace?.id ? dashboardPath('/dashboard/metas-comerciales', { anio: year, mes: month, workspace_id: currentWorkspace.id }) : null;
  const resource = useDashboardResource(path, JSON.stringify([user?.id, currentWorkspace?.id]));
  const data = resource.data;
  const goal = data?.metas?.find(item => item.moneda === currency);
  const canConfigure = data?.disponible && (goal ? data.puede_editar : data.puede_crear);
  const pct = goal?.cumplimiento_pct;
  const progress = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const resetEditor = () => { setEditing(false); setSaveError(''); setTargetInput(''); };

  const save = async event => {
    event.preventDefault();
    if (!canConfigure || saving || resource.loading) return;
    setSaving(true); setSaveError('');
    try {
      await apiFetch(goal ? `/dashboard/metas-comerciales/${goal.id}` : '/dashboard/metas-comerciales', {
        method: goal ? 'PUT' : 'POST',
        body: JSON.stringify({ workspace_id: currentWorkspace?.id, importe_objetivo: targetInput,
          ...(!goal ? { anio: year, mes: month, moneda: currency } : {}) }),
      });
      resetEditor(); resource.retry();
    } catch (error) {
      setSaveError(error.body?.errors ? Object.values(error.body.errors).flat().join(' ') : error.message);
    } finally { setSaving(false); }
  };

  return <div className="gsea-target-box">
    <div className="gsea-target-top"><span className="gsea-target-title">Meta comercial</span>{pct != null && <span className="gsea-target-badge">{pct.toFixed(1)}%</span>}</div>
    <div className="gsea-target-bottom">
      <label>Mes <input aria-label="Mes de la meta" type="month" min="2000-01" max="2100-12" required value={period} disabled={saving} onChange={e => { if (e.target.value) { setPeriod(e.target.value); resetEditor(); } }} /></label>
      <label>Moneda <select aria-label="Moneda de la meta" value={currency} disabled={saving} onChange={e => { setCurrency(e.target.value); resetEditor(); }}>
        {[...new Set(['MXN', 'USD', ...(data?.metas?.map(item => item.moneda) || [])])].map(code => <option key={code}>{code}</option>)}
      </select></label>
    </div>
    {!currentWorkspace?.id || resource.loading ? <p role="status">Consultando meta…</p> : resource.error ? <p role="alert">{resource.error.status === 403 ? 'Sin permiso para consultar metas.' : 'No se pudo consultar la meta.'} <button type="button" className="gsea-panel-link gsea-link-button" onClick={resource.retry}>Reintentar</button></p> : <>
      <div className="gsea-target-stat-row"><strong>{amountLabel(goal?.prima_emitida, currency)}</strong><span>de {goal ? amountLabel(goal.importe_objetivo, currency) : 'Meta no configurada'}</span></div>
      <div className="gsea-target-bar-wrap"><div className="gsea-target-bar-fill" style={{ width: `${progress}%` }} /></div>
      <span className="gsea-target-pct">{pct == null ? 'Sin objetivo establecido' : `${pct.toFixed(1)}% alcanzado`}</span>
      <div className="gsea-target-bottom"><span>Emisiones del mes · {currency}</span><strong>{goal?.polizas_emitidas ?? 'N/D'} pólizas</strong></div>
      <small>El avance suma la prima total de pólizas con fecha de emisión en este mes y moneda. Si marca 0, aún no hay emisiones registradas en el periodo.</small>
      {data?.disponible === false && <small>Configuración aún no disponible.</small>}
      {data?.disponible && !canConfigure && !editing && (
        <small>Solo un administrador con permiso de metas puede configurar el objetivo de este mes.</small>
      )}
      {canConfigure && !editing && <button type="button" className="gsea-panel-link gsea-link-button" onClick={() => { setTargetInput(goal?.importe_objetivo ?? ''); setEditing(true); }}>{goal ? 'Editar meta' : 'Configurar meta'}</button>}
    </>}
    {editing && canConfigure && <form onSubmit={save}>
      <label>Importe objetivo ({currency}) <input aria-label="Importe objetivo" type="number" min="0.01" step="0.01" max="99999999999999.99" required value={targetInput} disabled={saving} onChange={e => setTargetInput(e.target.value)} /></label>
      <button type="submit" className="gsea-panel-link gsea-link-button" disabled={saving || resource.loading}>{saving ? 'Guardando…' : 'Guardar meta'}</button>
      <button type="button" className="gsea-panel-link gsea-link-button" disabled={saving} onClick={resetEditor}>Cancelar</button>
    </form>}
    {saveError && <p role="alert">{saveError}</p>}
  </div>;
}
