import React, { useEffect, useMemo, useState } from "react";
import "./css/Dashboard.css";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "../context/AuthContext";
import { TOKEN_KEY } from "../utils/constants";
import { animate, motion } from "framer-motion";
import {
  Users,
  ShieldCheck,
  BadgeDollarSign,
  TrendingUp,
  AlertCircle,
  Clock,
  FileWarning,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Target,
  CalendarDays,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const DASHBOARD_CACHE_KEY = "dashboard_summary_v1";

const EMPTY_DASHBOARD = {
  kpis: {
    clientes_total: 0,
    polizas_vendidas: 0,
    prima_mensual: 0,
    tasa_renovacion: 0,
    polizas_vencidas: 0,
  },
  charts: {
    distribucion_polizas: [
      { name: "Activas", value: 0 },
      { name: "Vencidas", value: 0 },
      { name: "Por vencer", value: 0 },
    ],
    ventas_mensuales: [],
  },
  operativa: {
    cobros_pendientes: [],
    acciones_urgentes: [],
  },
  objetivo: {
    current: 0,
    target: 25000,
    progress_pct: 0,
  },
};

const POLICY_COLORS = ["#00B867", "#E36A73", "#00529B"];

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);

  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function readDashboardCache() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.kpis ? parsed : null;
  } catch {
    return null;
  }
}

function writeDashboardCache(data) {
  try {
    sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

function formatTodayLabel() {
  return new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function money(value) {
  return Number(value || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function Counter({ value, isCurrency = false, isPercent = false }) {
  const [displayValue, setDisplayValue] = useState(0);

  const numericValue =
    typeof value === "string"
      ? Number.parseFloat(value.replace(/[$,%]/g, "")) || 0
      : Number(value) || 0;

  useEffect(() => {
    const controls = animate(0, numericValue, {
      duration: 0.35,
      ease: "easeOut",
      onUpdate: setDisplayValue,
    });

    return () => controls.stop();
  }, [numericValue]);

  return (
    <span>
      {isCurrency ? "$" : ""}
      {Math.floor(displayValue).toLocaleString("es-MX")}
      {isPercent ? "%" : ""}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const cached = useMemo(() => readDashboardCache(), []);
  const [dashboard, setDashboard] = useState(cached || EMPTY_DASHBOARD);
  const [loadingDashboard, setLoadingDashboard] = useState(!cached);

  useEffect(() => {
    const controller = new AbortController();

    const fetchDashboard = async () => {
      try {
        const res = await fetch(`${API_URL}/dashboard/summary`, {
          headers: authHeaders(),
          signal: controller.signal,
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data?.kpis) {
          setDashboard(data);
          writeDashboardCache(data);
        } else if (!cached) {
          setDashboard(EMPTY_DASHBOARD);
        }
      } catch (error) {
        if (error?.name === "AbortError") return;
        console.error("Error cargando dashboard:", error);
        if (!cached) setDashboard(EMPTY_DASHBOARD);
      } finally {
        if (!controller.signal.aborted) setLoadingDashboard(false);
      }
    };

    fetchDashboard();
    return () => controller.abort();
  }, [cached]);

  const ventasData = useMemo(() => {
    const source = dashboard?.charts?.ventas_mensuales;

    if (Array.isArray(source) && source.length > 0) {
      return source.map((item) => ({
        ...item,
        ventas: Number(item.ventas || 0),
      }));
    }

    return [{ name: "Sin datos", ventas: 0 }];
  }, [dashboard]);

  const distribucionPolizas =
    dashboard?.charts?.distribucion_polizas ??
    EMPTY_DASHBOARD.charts.distribucion_polizas;

  const cobrosPendientes =
    dashboard?.operativa?.cobros_pendientes ?? [];

  const accionesUrgentes =
    dashboard?.operativa?.acciones_urgentes ?? [];

  const objetivo =
    dashboard?.objetivo ?? EMPTY_DASHBOARD.objetivo;

  const progress = Math.min(
    Math.max(Number(objetivo.progress_pct || 0), 0),
    100
  );

  const displayName = user?.name || "bienvenido";

  return (
    <div className="gsea-dashboard-page">
      <Sidebar onExpand={setIsSidebarExpanded} />

      <main
        className="gsea-dashboard-main"
        style={{
          "--gsea-sidebar-width": isSidebarExpanded ? "248px" : "72px",
        }}
      >
        <Navbar />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="gsea-dashboard-content"
        >
          <header className="gsea-dashboard-heading">
            <div>
              <p>Resumen operativo</p>
              <h1>Hola, {displayName}</h1>
              <span>
                <Clock size={14} />
                {formatTodayLabel()}
              </span>
              {loadingDashboard && (
                <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>
                  Actualizando…
                </span>
              )}
            </div>

            <div className="gsea-period-chip">
              <CalendarDays size={15} />
              Mes actual
            </div>
          </header>

          <section className="gsea-kpi-row">
            <Metric
              title="Clientes totales"
              value={dashboard.kpis.clientes_total}
              icon={Users}
              trend="En vivo"
            />
            <Metric
              title="Pólizas vendidas"
              value={dashboard.kpis.polizas_vendidas}
              icon={ShieldCheck}
              trend="En vivo"
            />
            <Metric
              title="Prima mensual"
              value={dashboard.kpis.prima_mensual}
              icon={BadgeDollarSign}
              trend="Actual"
              isCurrency
            />
            <Metric
              title="Tasa de renovación"
              value={dashboard.kpis.tasa_renovacion}
              icon={TrendingUp}
              trend="Actual"
              isPercent
            />
            <Metric
              title="Pólizas vencidas"
              value={dashboard.kpis.polizas_vencidas}
              icon={AlertCircle}
              trend="Atención"
              isAlert
            />
          </section>

          <section className="gsea-reference-grid">
            <article className="gsea-panel gsea-panel-activity">
              <PanelHeader
                eyebrow="Seguimiento"
                title="Operativa diaria"
                description="Cobros y acciones que requieren atención."
              />

              <div className="gsea-activity-block">
                <SectionLabel tone="green">Cobros pendientes</SectionLabel>

                <div className="gsea-operation-list">
                  {cobrosPendientes.length === 0 && (
                    <ActivityItem
                      name="Sin cobros pendientes"
                      detail={
                        loadingDashboard
                          ? "Cargando información..."
                          : "Todo al corriente"
                      }
                      time="—"
                    />
                  )}

                  {cobrosPendientes.slice(0, 4).map((item) => (
                    <ActivityItem
                      key={item.id}
                      name={item.name}
                      detail={item.detail}
                      time={item.time}
                      type={item.type}
                    />
                  ))}
                </div>
              </div>

              <div className="gsea-activity-block">
                <SectionLabel tone="red" icon={FileWarning}>
                  Acciones urgentes
                </SectionLabel>

                <div className="gsea-operation-list">
                  {accionesUrgentes.length === 0 && (
                    <UrgentItem
                      title="Sin acciones urgentes"
                      client="Buen trabajo"
                      tag="OK"
                    />
                  )}

                  {accionesUrgentes.slice(0, 4).map((item) => (
                    <UrgentItem
                      key={item.id}
                      title={item.title}
                      client={item.client}
                      tag={item.tag}
                      isAlert={item.isAlert}
                    />
                  ))}
                </div>
              </div>
            </article>

            <article className="gsea-panel gsea-panel-line">
              <PanelHeader
                eyebrow="Rendimiento"
                title="Ventas mensuales"
                description="Evolución comercial del periodo."
              />

              <div className="gsea-inline-summary">
                <div>
                  <span>Total del periodo</span>
                  <strong>
                    {money(
                      ventasData.reduce(
                        (sum, item) => sum + Number(item.ventas || 0),
                        0
                      )
                    )}
                  </strong>
                </div>

                <div>
                  <span>Meta mensual</span>
                  <strong>{money(objetivo.target)}</strong>
                </div>
              </div>

              <div className="gsea-line-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={ventasData}
                    margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="#E9EDF4"
                      strokeDasharray="4 5"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#8B95A7" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) =>
                        value >= 1000 ? `${Math.round(value / 1000)}k` : value
                      }
                      tick={{ fontSize: 10, fill: "#A3ABB8" }}
                    />
                    <Tooltip
                      cursor={{
                        stroke: "#C3CBD6",
                        strokeDasharray: "4 4",
                      }}
                      content={<MoneyTooltip />}
                    />
                    <Line
                      type="monotoneX"
                      dataKey="ventas"
                      stroke="#00529B"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: "#FFFFFF",
                        stroke: "#00529B",
                        strokeWidth: 2.5,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="gsea-panel gsea-panel-bar">
              <PanelHeader
                eyebrow="Comparativa"
                title="Ventas por mes"
                description="Lectura rápida del volumen mensual."
                compact
              />

              <div className="gsea-bar-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ventasData}
                    margin={{ top: 12, right: 8, left: -16, bottom: 0 }}
                    barCategoryGap="32%"
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="#EDF0F4"
                      strokeDasharray="4 5"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#8B95A7" }}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: "rgba(11,27,61,0.025)" }}
                      content={<MoneyTooltip />}
                    />
                    <Bar
                      dataKey="ventas"
                      fill="#00B867"
                      radius={[8, 8, 8, 8]}
                      maxBarSize={30}
                      background={{
                        fill: "#F0F3F7",
                        radius: 8,
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="gsea-panel gsea-panel-policy">
              <PanelHeader
                eyebrow="Cartera"
                title="Estado de pólizas"
                description="Distribución actual."
                compact
              />

              <div className="gsea-policy-layout">
                <div className="gsea-policy-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribucionPolizas}
                        dataKey="value"
                        innerRadius="62%"
                        outerRadius="84%"
                        paddingAngle={3}
                        startAngle={210}
                        endAngle={-30}
                        stroke="none"
                      >
                        {distribucionPolizas.map((entry, index) => (
                          <Cell
                            key={`${entry.name}-${index}`}
                            fill={POLICY_COLORS[index % POLICY_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<GenericTooltip />} 
                      position={{ x: 210, y: 38 }}
  wrapperStyle={{ pointerEvents: "none" }}/>
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="gsea-policy-center">
                    <strong>
                      {distribucionPolizas.reduce(
                        (sum, item) => sum + Number(item.value || 0),
                        0
                      )}
                    </strong>
                    <span>Total</span>
                  </div>
                </div>

                <div className="gsea-policy-legend">
                  {distribucionPolizas.map((item, index) => (
                    <div key={item.name}>
                      <i
                        style={{
                          background:
                            POLICY_COLORS[index % POLICY_COLORS.length],
                        }}
                      />
                      <span>{item.name}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}

                  <div className="gsea-goal-mini">
                    <div>
                      <span>Meta mensual</span>
                      <strong>{progress}%</strong>
                    </div>

                    <div className="gsea-goal-mini__line">
                      <motion.i
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </motion.div>
      </main>
    </div>
  );
}

function Metric({
  title,
  value,
  icon: Icon,
  trend,
  isAlert = false,
  isCurrency = false,
  isPercent = false,
}) {
  return (
    <motion.article
      whileHover={{ y: -2 }}
      className={`gsea-metric ${isAlert ? "is-alert" : ""}`}
    >
      <div className="gsea-metric__top">
        <span className="gsea-metric__icon">
          <Icon size={16} />
        </span>

        <span className="gsea-metric__trend">
          {isAlert ? (
            <ArrowDownRight size={10} />
          ) : (
            <ArrowUpRight size={10} />
          )}
          {trend}
        </span>
      </div>

      <p>{title}</p>

      <strong>
        <Counter
          value={value}
          isCurrency={isCurrency}
          isPercent={isPercent}
        />
      </strong>
    </motion.article>
  );
}

function PanelHeader({ eyebrow, title, description, compact = false }) {
  return (
    <div className={`gsea-panel-header ${compact ? "is-compact" : ""}`}>
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <span>{description}</span>
      </div>

      <button type="button" aria-label={`Opciones de ${title}`}>
        <MoreHorizontal size={17} />
      </button>
    </div>
  );
}

function SectionLabel({ children, tone, icon: Icon }) {
  return (
    <div className={`gsea-section-label ${tone}`}>
      <i />
      {Icon && <Icon size={12} />}
      <span>{children}</span>
    </div>
  );
}

function ActivityItem({ name, detail, time, type }) {
  return (
    <div className="gsea-activity-row">
      <i className={type === "mora" ? "is-overdue" : ""} />

      <div>
        <strong>{name}</strong>
        <span>{detail}</span>
      </div>

      <small>{time}</small>
    </div>
  );
}

function UrgentItem({ title, client, tag, isAlert }) {
  return (
    <div className={`gsea-urgent-row ${isAlert ? "is-alert" : ""}`}>
      <div>
        <strong>{title}</strong>
        <span>{client}</span>
      </div>

      <small>{tag}</small>
    </div>
  );
}

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="gsea-tooltip">
      <span>{label || "Periodo"}</span>
      <strong>{money(payload[0]?.value)}</strong>
    </div>
  );
}

function GenericTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="gsea-tooltip">
      <span>{payload[0]?.name}</span>
      <strong>{payload[0]?.value}</strong>
    </div>
  );
}