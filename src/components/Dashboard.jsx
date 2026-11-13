import React, { useEffect, useMemo, useState } from "react";
import "./css/Dashboard.css";
import Sidebar from "./Sidebar";
import MetaComercial from "./MetaComercial";
import Navbar from "./Navbar";
import { adaptDashboardSummary, adaptDashboardCobranza, adaptDashboardAgenda, dashboardAgendaError, useDashboardResource, dashboardPath } from "../utils/dashboardService";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { animate, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarDays,
  Clock,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const EMPTY_DASHBOARD = {
  kpis: {
    clientes_total: null,
    polizas_vendidas: null,
    prima_mensual: null,
    tasa_renovacion: null,
    renovaciones_registradas: null,
    polizas_vencidas: null,
  },
  objetivo: { current: null, target: null, progress_pct: null },
  charts: {
    ventas_mensuales: [],
    distribucion_polizas: [],
    polizas_por_ramo: [],
    cartera_por_aseguradora: [],
  },
  cobranza: {
    pagada: { cantidad: null, monto: null },
    pendiente: { cantidad: null, monto: null },
    vencida: { cantidad: null, monto: null },
    total_recuperacion: { cantidad: null, monto: null },
  },
  tramites: { total: null, atencion: null, por_etapa: [], por_semaforo: [] },
  operativa: {
    acciones_urgentes: [],
    cobros_pendientes: [],
    polizas_vencidas: [],
    eventos_proximos: [],
  },
};

const POLICY_COLORS = ["#00B867", "#E36A73", "#00529B", "#D6A21E"];
const COLLECTION_COLORS = ["#00B867", "#D6A21E", "#E36A73"];
const ACTION_ROUTES = {
  cobro: "/seguimiento-cobranza",
  poliza: "/seguimiento-polizas",
  tramite: "/tramites",
  evento: "/calendario",
};

function formatTodayLabel() {
  return new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function money(value) {
  if (value == null) return "No disponible";
  return Number(value || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}

function number(value) {
  if (value == null) return "N/D";
  return Number(value || 0).toLocaleString("es-MX");
}

function paidAmounts(group) {
  if (!group?.montos_por_moneda) return 'No disponible';
  const entries = Object.entries(group.montos_por_moneda);
  if (!entries.length) return group.cantidad === 0 ? 'Sin cuotas pagadas' : 'No disponible';
  return entries.map(([currency, value]) =>
    `${value == null ? 'N/D' : value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
  ).join(' · ');
}

function normalizeRamoName(value) {
  return String(value ?? "")
    .replace(/DAÃ‘OS/g, "DAÑOS")
    .replace(/VEHÃCULOS/g, "VEHÍCULOS");
}

function semaforoColor(value) {
  const name = String(value ?? "").trim().toLowerCase();
  if (name === "verde") return "#16A34A";
  if (name === "amarillo") return "#EAB308";
  if (name === "rojo") return "#DC2626";
  return "#94A3B8";
}

function Counter({ value, isCurrency = false, isPercent = false }) {
  const [displayValue, setDisplayValue] = useState(0);
  const numericValue = Number(value || 0);

  useEffect(() => {
    const controls = animate(0, numericValue, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: setDisplayValue,
    });
    return () => controls.stop();
  }, [numericValue]);

  return (
    <span>
      {isCurrency ? "$" : ""}
      {Math.round(displayValue).toLocaleString("es-MX")}
      {isPercent ? "%" : ""}
    </span>
  );
}

function actionType(item, fallback) {
  const type = String(item?.type || fallback || "").toLowerCase();
  if (type.includes("cobro") || type.includes("pago") || type.includes("mora")) return "cobro";
  if (type.includes("poliza") || type.includes("venc") || type.includes("renov")) return "poliza";
  if (type.includes("tram")) return "tramite";
  if (type.includes("event") || type.includes("tarea") || type.includes("calend")) return "evento";
  if (item?.cuota_id) return "cobro";
  if (item?.poliza_id) return "poliza";
  if (item?.tramite_id) return "tramite";
  if (item?.event_id) return "evento";
  return fallback;
}

function getActionTitle(item, type) {
  return item?.title || item?.name || item?.client || item?.detail || {
    cobro: "Cobro pendiente",
    poliza: "Póliza por atender",
    tramite: "Trámite pendiente",
    evento: "Evento próximo",
  }[type];
}

function getActionDetail(item) {
  return item?.detail || item?.client || item?.description || item?.time || "Requiere revisión";
}

function getActionId(item, type) {
  return item?.cuota_id || item?.poliza_id || item?.tramite_id || item?.event_id || item?.id
    ? `${type}-${item.cuota_id || item.poliza_id || item.tramite_id || item.event_id || item.id}`
    : undefined;
}

function buildActionGroups(operativa) {
  const groups = [
    ["Urgentes", "acciones_urgentes", null],
    ["Cobranza", "cobros_pendientes", "cobro"],
    ["Pólizas", "polizas_vencidas", "poliza"],
    ["Eventos", "eventos_proximos", "evento"],
  ];

  return groups.map(([label, key, fallback]) => ({
    label,
    actions: (Array.isArray(operativa?.[key]) ? operativa[key] : [])
      .slice(0, key === 'eventos_proximos' ? 4 : 2)
      .map((item, index) => {
        const type = actionType(item, fallback);
        return {
          item,
          type,
          key: getActionId(item, type) || `${key}-${index}`,
        };
      }),
  }));
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user: authUser, currentWorkspace, permissions } = useAuth();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [user] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [chartPeriod, setChartPeriod] = useState("6m");
  const workspaceId = currentWorkspace?.id ?? authUser?.current_workspace_id;
  const ready = Boolean(authUser?.id && workspaceId);
  const scope = JSON.stringify([authUser?.id, workspaceId, [...permissions].sort()]);
  const summaryResource = useDashboardResource(ready ? dashboardPath('/dashboard/summary', { compact: 1, workspace_id: workspaceId }) : null, scope);
  const needTotals = Boolean(
    summaryResource.data &&
    (summaryResource.data.clientes_total == null || summaryResource.data.polizas_vencidas == null)
  );
  const totalsResource = useDashboardResource(ready && needTotals ? dashboardPath('/dashboard/totales', { workspace_id: workspaceId }) : null, scope);
  const collectionResource = useDashboardResource(ready ? dashboardPath('/dashboard/cobranza', { workspace_id: workspaceId }) : null, scope);
  const agendaResource = useDashboardResource(ready ? dashboardPath('/calendar/events', { agenda: 'hoy_y_proximos_7_dias', per_page: 4, workspace_id: workspaceId }) : null, scope);
  const derived = useMemo(() => {
    let next = { ...EMPTY_DASHBOARD, kpis: { ...EMPTY_DASHBOARD.kpis }, operativa: { ...EMPTY_DASHBOARD.operativa } };
    const errors = [];
    if (summaryResource.data) {
      try { next = adaptDashboardSummary(summaryResource.data); }
      catch { errors.push('Respuesta incompatible del resumen principal.'); }
    }
    if (totalsResource?.data) {
      next.kpis = {
        ...next.kpis,
        clientes_total: totalsResource.data.clientes_total ?? next.kpis.clientes_total,
        polizas_vencidas: totalsResource.data.polizas_vencidas ?? next.kpis.polizas_vencidas,
      };
    }
    if (collectionResource.data) {
      try {
        const collection = adaptDashboardCobranza(collectionResource.data);
        next.cobranza = { ...next.cobranza, ...collection };
        next.operativa = { ...next.operativa, cobros_pendientes: collection.casos_prioritarios.map(item => ({
          ...item, type: 'cobro', client: item.cliente, detail: `Póliza ${item.poliza} · ${item.fecha ?? 'Sin fecha'}`,
        })) };
      } catch { errors.push('Respuesta incompatible de cobranza.'); }
    }
    let agenda = { total: null, error: '' };
    if (agendaResource.data) {
      try { const value = adaptDashboardAgenda(agendaResource.data); agenda.total = value.total; next.operativa = { ...next.operativa, eventos_proximos: value.events }; }
      catch (error) { agenda.error = dashboardAgendaError(error); }
    } else if (agendaResource.error) agenda.error = dashboardAgendaError(agendaResource.error);
    return { dashboard: next, agenda, errors };
  }, [summaryResource.data, totalsResource?.data, collectionResource.data, agendaResource.data, agendaResource.error]);
  const dashboard = derived.dashboard;
  const agendaState = derived.agenda;
  const isInitialLoading = !ready || (summaryResource.loading && !summaryResource.data);
  const activeResources = [summaryResource, collectionResource, agendaResource, ...(needTotals ? [totalsResource] : [])];
  const isAnyLoading = !ready || activeResources.some(resource => resource.loading);
  const dashboardError = [
    ...derived.errors,
    ...(summaryResource.error ? [summaryResource.error.status === 403 ? 'Resumen principal: sin permisos de consulta.' : 'Resumen principal: no se pudo cargar la información.'] : []),
  ].join(' ');

  const charts = dashboard.charts || EMPTY_DASHBOARD.charts;
  const ventasData = Array.isArray(charts.ventas_mensuales) ? charts.ventas_mensuales : [];
  const distribucionPolizas = Array.isArray(charts.distribucion_polizas)
    ? charts.distribucion_polizas
    : [];
  const ramosData = Array.isArray(charts.polizas_por_ramo) ? charts.polizas_por_ramo : [];
  const aseguradorasData = Array.isArray(charts.cartera_por_aseguradora)
    ? charts.cartera_por_aseguradora
    : [];
  const cobranza = dashboard.cobranza || EMPTY_DASHBOARD.cobranza;
  const tramites = dashboard.tramites || EMPTY_DASHBOARD.tramites;
  const actionGroups = useMemo(() => buildActionGroups(dashboard.operativa), [dashboard.operativa]);
  const greetingUser = authUser || user;
  const greetingName =
    greetingUser?.name ||
    greetingUser?.nombre ||
    [greetingUser?.first_name, greetingUser?.last_name].filter(Boolean).join(" ") ||
    "bienvenido";

  const handleAction = (action) => {
    const route = ACTION_ROUTES[action.type];
    if (route) {
      navigate(route, {
        state: {
          dashboardCreate: action.type === "cobro",
          cuotaId: action.item?.cuota_id,
          polizaId: action.item?.poliza_id,
          cliente: action.item?.client || action.item?.name || action.item?.cliente,
          tramiteId: action.item?.tramite_id,
          eventId: action.item?.event_id,
        },
      });
    }
  };

  const kpis = dashboard.kpis || EMPTY_DASHBOARD.kpis;
  const collections = [
    { label: "Pagada", data: cobranza.pagada, color: "is-emerald" },
    { label: "Pendiente", data: cobranza.pendiente, color: "is-amber" },
    { label: "Vencida", data: cobranza.vencida, color: "is-danger" },
  ];
  const urgentActions = actionGroups.flatMap(group => group.actions.map(action => ({ ...action, group: group.label })))
    .filter(action => action.type === "cobro" || action.type === "poliza" || action.type === "tramite").slice(0, 4);
  const agendaActions = actionGroups.flatMap(group => group.actions.map(action => ({ ...action, group: group.label })))
    .filter(action => action.type === "evento").slice(0, 4);
  const collectionActions = actionGroups.flatMap(group => group.actions.map(action => ({ ...action, group: group.label })))
    .filter(action => action.type === "cobro").slice(0, 4);
  const displayedVentas = chartPeriod === "3m" ? ventasData.slice(-3) : chartPeriod === "12m" ? ventasData.slice(-12) : ventasData.slice(-6);
  const hasCompleteCollectionAmounts =
    cobranza.pendiente?.monto != null &&
    cobranza.vencida?.monto != null;

  return (
    <div className="gsea-dashboard-page">
      <Sidebar onExpand={setIsSidebarExpanded} />
      <main className="gsea-dashboard-main" style={{ "--gsea-sidebar-width": isSidebarExpanded ? "248px" : "72px" }}>
        <Navbar />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="gsea-dashboard-content">
          <header className="gsea-dashboard-heading">
            <div>
              <div className="gsea-welcome-title-wrap">
                <h1 className="gsea-welcome-title">Hola, {greetingName}</h1>
                {!isAnyLoading && !dashboardError && <span className="gsea-sync-pill"><span className="gsea-sync-pulse" />Datos actualizados</span>}
              </div>
              <p className="gsea-date-subtitle"><Clock size={14} /> Resumen operativo al día • {formatTodayLabel()}</p>
            </div>
            <div className="gsea-action-bar">
              <button type="button" className="gsea-action-btn-secondary" onClick={() => navigate('/seguimiento-cobranza')}><BadgeDollarSign size={15}/> Consultar cobranza</button>
              <button type="button" className="gsea-action-btn-secondary" onClick={() => navigate('/seguimiento-polizas')}><ShieldCheck size={15}/> Gestionar pólizas</button>
              <button type="button" className="gsea-action-btn-primary" onClick={() => navigate('/clientes')}><Users size={15}/> Ver clientes</button>
            </div>
          </header>
          {dashboardError && <div role="alert" className="gsea-dashboard-state is-error">{dashboardError}</div>}
          {isInitialLoading && <div role="status" className="gsea-dashboard-state">Cargando información real del dashboard…</div>}

          <section className="gsea-kpi-grid" aria-label="Indicadores principales">
            <Kpi title="Clientes totales" value={kpis.clientes_total} icon={Users} tone="is-slate" footer="Cartera registrada" />
            <Kpi title="Pólizas vendidas" value={kpis.polizas_vendidas} icon={ShieldCheck} tone="is-blue" footer="Con fecha de emisión del periodo" />
            <Kpi title="Prima emitida del periodo" value={kpis.prima_mensual} icon={BadgeDollarSign} tone="is-emerald" currency footer="Suma de prima total (MXN)" />
            <Kpi
              title="Tasa de renovación"
              value={kpis.tasa_renovacion}
              icon={TrendingUp}
              tone="is-amber"
              percent
              footer={
                kpis.renovaciones_registradas != null
                  ? `${number(kpis.renovaciones_registradas)} renovaciones vinculadas`
                  : 'Vincular póliza anterior al crear'
              }
            />
            <Kpi title="Pólizas vencidas" value={kpis.polizas_vencidas} icon={AlertCircle} tone="is-danger" danger footer="Requieren atención" />
          </section>

          <section className="gsea-alert-grid" aria-label="Alertas operativas">
            <AlertCard title="Cobranza vencida" count={cobranza.vencida?.cantidad} subtitle={`${money(cobranza.vencida?.monto)} pendientes`} icon={AlertCircle} tone="is-danger" onClick={() => navigate('/seguimiento-cobranza', { state: { alertFilter: 'vencida' } })} />
            <AlertCard title="Trámites en atención" count={tramites.atencion} subtitle={`De ${number(tramites.total)} trámites registrados${tramites.sin_estado == null ? '' : ` · ${number(tramites.sin_estado)} sin estado definido`}`} icon={Clock} tone="is-amber" onClick={() => navigate('/tramites', { state: { alertFilter: 'atencion' } })} />
            <AlertCard title="Pólizas por atender" count={kpis.polizas_vencidas} subtitle="Revisar vigencias y seguimiento" icon={ShieldCheck} tone="is-blue" onClick={() => navigate('/seguimiento-polizas', { state: { alertFilter: 'vencidas' } })} />
          </section>

          <section className="gsea-ops-grid" aria-label="Operativa diaria">
            <article className="gsea-ops-panel" id="cobros">
              <div className="gsea-panel-top">
                <div className="gsea-panel-top-left"><div className="gsea-panel-icon is-red"><BadgeDollarSign size={17}/></div><div><h2 className="gsea-panel-title">Cobros prioritarios</h2><p className="gsea-panel-sub">Seguimientos de cobranza registrados</p></div></div>
                <span className="gsea-priority-badge">{collectionActions.length} visibles</span>
              </div>
              <div className="gsea-ops-list">
                {collectionActions.length ? collectionActions.map(action => (
                  <div className="gsea-collect-card" key={action.key}>
                    <span className="gsea-collect-card-stripe" />
                    <div className="gsea-collect-info"><span className="gsea-collect-client">{getActionTitle(action.item, action.type)}</span><span className="gsea-collect-desc">{getActionDetail(action.item)}</span></div>
                    {action.item?.monto != null && <strong className="gsea-collect-amount">{action.item.moneda === 'USD' ? `${Number(action.item.monto).toLocaleString('es-MX', {style:'currency',currency:'USD'})} USD` : money(action.item.monto)}</strong>}
                    <button type="button" className="gsea-btn-collect" onClick={() => handleAction(action)}>Cobrar</button>
                  </div>
                )) : <EmptyState text={collectionResource.loading && !collectionResource.data ? "Consultando cobranza…" : "No hay cobros prioritarios reportados."} />}
              </div>
              <div className="gsea-panel-footer"><span className="gsea-panel-sub">Vencido: {money(cobranza.vencida?.monto)}</span><button className="gsea-panel-link gsea-link-button" onClick={() => navigate('/seguimiento-cobranza')}>Ver cobranza <ArrowUpRight size={13}/></button></div>
            </article>
            <article className="gsea-ops-panel">
              <div className="gsea-panel-top"><div className="gsea-panel-top-left"><div className="gsea-panel-icon is-blue"><CalendarDays size={17}/></div><div><h2 className="gsea-panel-title">Agenda y seguimiento</h2><p className="gsea-panel-sub">Hoy y próximos siete días</p></div></div><span className="gsea-priority-badge gsea-priority-blue">{number(agendaState.total)} eventos</span></div>
              <div className="gsea-ops-list">
                {agendaActions.length ? agendaActions.map(action => (
                  <button type="button" key={action.key} className="gsea-agenda-card is-active gsea-row-button" onClick={() => handleAction(action)}>
                    <div className="gsea-agenda-left"><div className="gsea-panel-icon is-blue"><CalendarDays size={14}/></div><div className="gsea-agenda-text-wrap"><span className="gsea-agenda-title">{getActionTitle(action.item, action.type)}</span><span className="gsea-agenda-sub">{getActionDetail(action.item)}</span></div></div><span className="gsea-agenda-badge is-blue">Ver</span>
                  </button>
                )) : <EmptyState text={agendaResource.loading && !agendaResource.data ? "Consultando agenda…" : agendaState.error || "No hay eventos para hoy y los próximos siete días."} />}
              </div>
              <div className="gsea-panel-footer is-centered"><button type="button" className="gsea-panel-link gsea-link-button" onClick={() => navigate('/calendario')}>Ir al calendario <ArrowUpRight size={13}/></button></div>
            </article>
          </section>

          <section className="gsea-commercial-card">
            <div className="gsea-commercial-top"><div className="gsea-commercial-title-wrap"><h2 className="gsea-commercial-title">Rendimiento comercial</h2><span className="gsea-commercial-sub">Ventas mensuales y avance de objetivo</span></div><div className="gsea-toggle-group" aria-label="Periodo de gráfica">{[['3m','3 meses'],['6m','6 meses'],['12m','12 meses']].map(([key,label]) => <button key={key} type="button" className={`gsea-toggle-btn ${chartPeriod===key?'is-active':''}`} onClick={() => setChartPeriod(key)}>{label}</button>)}</div></div>
            <div className="gsea-commercial-grid"><div className="gsea-chart-container">{displayedVentas.length ? <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><LineChart data={displayedVentas} margin={{top:8,right:12,left:-10,bottom:0}}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 4" vertical={false}/><XAxis dataKey="name" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${Math.round(v/1000)}k`:v}/><Tooltip content={<MoneyTooltip/>}/><Line type="monotone" dataKey="ventas" stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{r:4}}/></LineChart></ResponsiveContainer> : <EmptyState text="Sin datos de ventas para el periodo."/>}</div>
              <MetaComercial key={currentWorkspace?.id ?? "sin-workspace"} />
            </div>
          </section>

          <section className="gsea-extended-section"><div className="gsea-commercial-top"><div className="gsea-commercial-title-wrap"><h2 className="gsea-commercial-title">Cartera y trámites</h2><span className="gsea-commercial-sub">Información complementaria del CRM</span></div></div>
            <div className="gsea-portfolio-grid">
              <div className="gsea-portfolio-block gsea-portfolio-collection">
                <h3 className="gsea-panel-title">Estado de cobranza</h3>
                <div className="gsea-portfolio-total-label">Total pendiente de recuperación</div>
                <strong className="gsea-portfolio-total">{money(cobranza.total_recuperacion?.monto)}</strong>
                <div className="gsea-collection-segments" aria-label="Distribución de cobranza">
                  {hasCompleteCollectionAmounts && (
                    <>
                      <span
                        className="is-pending"
                        style={{
                          width: `${((Number(cobranza.pendiente.monto) || 0) / Math.max((Number(cobranza.pendiente.monto) || 0) + (Number(cobranza.vencida.monto) || 0), 1)) * 100}%`,
                        }}
                      />
                      <span
                        className="is-overdue"
                        style={{
                          width: `${((Number(cobranza.vencida.monto) || 0) / Math.max((Number(cobranza.pendiente.monto) || 0) + (Number(cobranza.vencida.monto) || 0), 1)) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
                <div className="gsea-collection-legend">
                  <span><i className="is-pending" />Pendiente</span>
                  <span><i className="is-overdue" />Vencida</span>
                </div>
                <div className="gsea-portfolio-list">
                  {collections.map(row => (
                    <div className="gsea-portfolio-row" key={row.label}>
                      <div className="gsea-portfolio-row-label">
                        <span className="gsea-portfolio-dot" data-tone={row.color} />
                        <span>{row.label}</span>
                        <small>{number(row.data?.cantidad)} cuotas</small>
                      </div>
                      <strong>{row.label === "Pagada" ? paidAmounts(row.data) : money(row.data?.monto)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="gsea-portfolio-block gsea-portfolio-procedures">
                <div className="gsea-portfolio-heading"><h3 className="gsea-panel-title">Estado de trámites</h3><strong className="gsea-portfolio-total">{number(tramites.total)}</strong></div>
                <span className="gsea-portfolio-total-label">Trámites registrados</span>
                {tramites.por_semaforo?.some(item => item.value > 0) ? <div className="gsea-procedure-chart"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><PieChart><Pie data={tramites.por_semaforo.filter(item => item.value > 0)} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3}>{tramites.por_semaforo.filter(item => item.value > 0).map(item => <Cell key={item.color} fill={semaforoColor(item.color)} />)}</Pie><Tooltip formatter={(value,name)=>[number(value),name]} /></PieChart></ResponsiveContainer></div> : <div className="gsea-procedure-empty"><span>{tramites.sin_semaforo_valido == null ? 'Desglose no disponible' : tramites.total === 0 ? 'Sin trámites registrados' : 'Sin trámites con semáforo válido'}</span></div>}
                {tramites.por_semaforo?.length > 0 && <div className="gsea-portfolio-legend">{tramites.por_semaforo.map(item => <span key={item.color}><i style={{backgroundColor:semaforoColor(item.color)}} />{item.name}<b>{number(item.value)}</b></span>)}</div>}
                {tramites.sin_semaforo_valido != null && <div className="gsea-portfolio-legend"><span>Sin semáforo válido<b>{number(tramites.sin_semaforo_valido)}</b></span></div>}
              </div>
              <div className="gsea-portfolio-block gsea-portfolio-ramos"><h3 className="gsea-panel-title">Pólizas por ramo</h3>{ramosData.length ? <div className="gsea-ramos-visual"><div className="gsea-donut-wrap"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><PieChart><Pie data={ramosData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="86%" paddingAngle={2}>{ramosData.map((item,index)=><Cell key={`${item.name}-${index}`} fill={POLICY_COLORS[index%POLICY_COLORS.length]} />)}</Pie><Tooltip formatter={(value,name)=>[number(value),normalizeRamoName(name)]} /></PieChart></ResponsiveContainer></div><div className="gsea-portfolio-legend">{ramosData.map((item,index)=><span key={`${item.name}-${index}`}><i style={{backgroundColor:POLICY_COLORS[index%POLICY_COLORS.length]}} /><em>{normalizeRamoName(item.name)}</em><b>{number(item.value)}</b></span>)}</div></div> : <EmptyState text="Sin datos por ramo."/>}</div>
              <div className="gsea-portfolio-block gsea-portfolio-insurers"><h3 className="gsea-panel-title">Cartera por aseguradora</h3>{aseguradorasData.length ? <div className="gsea-insurer-chart"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={aseguradorasData} layout="vertical" margin={{top:2,right:12,left:8,bottom:2}}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={86} tick={{fontSize:10,fill:"#475569"}} axisLine={false} tickLine={false} /><Tooltip formatter={(value,name)=>[number(value),"Pólizas"]} /><Bar dataKey="polizas" fill="#2563eb" radius={[0,4,4,0]} barSize={12} /></BarChart></ResponsiveContainer></div> : <EmptyState text="Sin aseguradoras reportadas."/>}<div className="gsea-insurer-values">{aseguradorasData.map((item,index)=><div key={`${item.aseguradora_id||item.name}-${index}`}><span>{item.name}</span><strong>{number(item.polizas)} pólizas</strong></div>)}</div></div>
            </div>
          </section>
        </motion.div>
      </main>
    </div>
  );
}

function Kpi({title,value,icon:Icon,tone,footer,currency=false,percent=false,danger=false}) {
  return <article className={`gsea-kpi-card ${danger?'is-danger':''}`}><div className="gsea-kpi-header"><span className="gsea-kpi-label">{title}</span><span className={`gsea-kpi-icon-box ${tone}`}><Icon size={15}/></span></div><div className="gsea-kpi-body"><strong className="gsea-kpi-value">{currency?money(value):percent && value != null?`${number(value)}%`:number(value)}</strong></div><div className="gsea-kpi-footer"><span>{footer}</span></div></article>;
}
function AlertCard({title,count,subtitle,icon:Icon,tone,onClick}) {
  return <button type="button" className={`gsea-alert-card gsea-row-button ${tone==='is-danger'?'is-danger':''}`} onClick={onClick}><span className={`gsea-alert-icon-wrap ${tone}`}><Icon size={17}/></span><span className="gsea-alert-content"><span className="gsea-alert-title-row"><strong className="gsea-alert-title">{title}</strong><span className={`gsea-alert-tag ${tone}`}>{number(count)}</span></span><span className="gsea-alert-desc">{subtitle}</span></span><span className={`gsea-alert-action ${tone==='is-danger'?'is-danger':''}`}>Ver <ArrowUpRight size={14}/></span></button>;
}
function EmptyState({text}) {return <div className="gsea-dashboard-state">{text}</div>}
function MoneyTooltip({active,payload,label}) {if(!active||!payload?.length)return null;return <div className="gsea-target-box"><span>{label||'Periodo'}</span><strong>{money(payload[0].value)}</strong></div>}
