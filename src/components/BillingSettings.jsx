import React, { useEffect, useState, useMemo } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Lock,
  Users,
  FileText,
  UserCheck,
  ArrowRight,
  AlertTriangle,
  X,
  Check,
  Clock,
  Sparkles,
  Calendar,
  ShieldCheck,
  RefreshCw,
  Info
} from 'lucide-react';
import PageLayout, { ConfigPageHeader } from './PageLayout';
import { apiFetch } from '../utils/apiClient';
import { useAuth } from '../context/AuthContext';
import { getActiveWorkspaceId } from '../utils/workspaceStorage';
import './css/SaaS.css';
import './css/BillingSettings.css';

/**
 * Mapeo y traducción de estados de suscripción al español
 */
function getStatusLabel(status, isAccessible) {
  if (status === 'trialing') {
    return {
      text: 'En prueba',
      pillClass: 'gsea-billing-status-pill--trial',
      icon: Clock,
    };
  }
  if (status === 'active' && isAccessible) {
    return {
      text: 'Activo',
      pillClass: 'gsea-billing-status-pill--active',
      icon: CheckCircle2,
    };
  }
  if (status === 'canceled') {
    return {
      text: 'Cancelado',
      pillClass: 'gsea-billing-status-pill--canceled',
      icon: X,
    };
  }
  return {
    text: 'Vencido',
    pillClass: 'gsea-billing-status-pill--locked',
    icon: Lock,
  };
}

/** Formateo de fechas para el usuario */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Formateo de montos en MXN */
function formatCurrency(amount, currency = 'MXN') {
  const num = Number(amount || 0);
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(num);
}

export default function BillingSettings() {
  const { subscription, refresh, can, currentWorkspace } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Selección de plan y modal de confirmación
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submittingChange, setSubmittingChange] = useState(false);

  // Activación de demo para workspaces bloqueados
  const [activating, setActivating] = useState(false);

  const workspaceId = getActiveWorkspaceId();

  // Carga inicial de datos de facturación
  const fetchBilling = async () => {
    if (!workspaceId) return;
    try {
      setErrorMsg('');
      const data = await apiFetch(`/workspaces/${workspaceId}/billing`);
      setDetail(data);
    } catch (e) {
      setErrorMsg(e.message || 'Error al cargar información de facturación.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, [workspaceId]);

  const sub = detail?.subscription || subscription;
  const currentPlan = sub?.plan;
  const usage = sub?.usage || { users: 0, polizas: 0, agentes: 0 };
  const plans = detail?.plans || [];

  const statusInfo = useMemo(
    () => getStatusLabel(sub?.status, sub?.is_accessible),
    [sub?.status, sub?.is_accessible]
  );

  // Abrir modal y calcular cotización oficial desde backend
  const handleOpenConfirmModal = async (planId) => {
    const targetId = planId || selectedPlanId;
    if (!targetId) return;

    setSelectedPlanId(targetId);
    setIsModalOpen(true);
    setLoadingPreview(true);
    setErrorMsg('');

    try {
      const quoteRes = await apiFetch(
        `/workspaces/${workspaceId}/billing/preview-change`,
        {
          method: 'POST',
          body: JSON.stringify({ plan_id: targetId }),
        }
      );
      setPreviewData(quoteRes);
    } catch (e) {
      setErrorMsg(e.message || 'No fue posible obtener la cotización del cambio de plan.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCloseModal = () => {
    if (submittingChange) return;
    setIsModalOpen(false);
    setPreviewData(null);
  };

  // Enviar confirmación de cambio de plan
  const handleConfirmPlanChange = async () => {
    if (!selectedPlanId || submittingChange) return;
    setSubmittingChange(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await apiFetch(`/workspaces/${workspaceId}/billing/change-plan`, {
        method: 'POST',
        body: JSON.stringify({ plan_id: selectedPlanId }),
      });

      setSuccessMsg('Suscripción actualizada exitosamente.');
      setIsModalOpen(false);
      setSelectedPlanId(null);
      await refresh();
      await fetchBilling();
    } catch (e) {
      setErrorMsg(e.message || 'No fue posible completar el cambio de suscripción.');
    } finally {
      setSubmittingChange(false);
    }
  };

  // Reactivación rápida para workspaces con prueba vencida o bloqueados
  const handleActivate = async () => {
    setActivating(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await apiFetch(`/workspaces/${workspaceId}/billing/activate`, {
        method: 'POST',
      });
      await refresh();
      await fetchBilling();
      setSuccessMsg('Plan reactivado correctamente.');
    } catch (e) {
      setErrorMsg(e.message || 'Error al reactivar el plan.');
    } finally {
      setActivating(false);
    }
  };

  // Verificación estricta de permisos
  if (!can('billing.manage')) {
    return (
      <PageLayout>
        <section className="gsea-config-page">
          <div className="gsea-config-empty">
            <Lock size={40} className="gsea-config-empty__icon" />
            <p>No tienes permiso para gestionar la facturación de esta promotoría.</p>
          </div>
        </section>
      </PageLayout>
    );
  }

  const selectedPlanObj = plans.find((p) => p.id === selectedPlanId);

  return (
    <PageLayout>
      <section className="gsea-config-page">
        <ConfigPageHeader
          icon={CreditCard}
          title="Facturación"
          subtitle={`Gestiona la suscripción, límites de uso y catálogo de planes de ${
            currentWorkspace?.nombre || 'tu promotoría'
          }.`}
        />

        {errorMsg && (
          <div
            className="gsea-msg gsea-msg--error"
            style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <AlertTriangle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            className="gsea-msg gsea-msg--ok"
            style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '3rem 0', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="gsea-spin" style={{ margin: '0 auto 12px' }} />
            <p className="gsea-config-loading">Cargando información de suscripción y catálogo…</p>
          </div>
        ) : (
          <div className="gsea-billing-container">
            {/* ========================================================
                1. RESUMEN DE SUSCRIPCIÓN Y USO
               ======================================================== */}
            <div className="gsea-billing-summary-card">
              <div className="gsea-billing-summary-header">
                <div className="gsea-billing-plan-info">
                  <h2 className="gsea-billing-plan-name">
                    {currentPlan?.nombre || 'Plan GSEA'}
                  </h2>
                  <span className="gsea-billing-price-tag">
                    {currentPlan?.precio_mensual != null
                      ? `${formatCurrency(currentPlan.precio_mensual)} / mes`
                      : '—'}
                  </span>
                  <div className={`gsea-billing-status-pill ${statusInfo.pillClass}`}>
                    <statusInfo.icon size={14} />
                    <span>{statusInfo.text}</span>
                  </div>
                </div>

                {(sub?.is_locked || !sub?.is_accessible) && (
                  <button
                    type="button"
                    className="gsea-btn-primary"
                    disabled={activating}
                    onClick={handleActivate}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <RefreshCw size={15} className={activating ? 'gsea-spin' : ''} />
                    {activating ? 'Reactivando…' : 'Reactivar acceso'}
                  </button>
                )}
              </div>

              {/* Fechas de renovación y fin de acceso diferenciadas */}
              <div className="gsea-billing-details-grid">
                <div className="gsea-billing-detail-item">
                  <span className="gsea-billing-detail-label">
                    {sub?.status === 'trialing'
                      ? 'Fin de la prueba'
                      : sub?.status === 'active'
                      ? 'Próxima renovación'
                      : 'Fin de acceso'}
                  </span>
                  <p className="gsea-billing-detail-val">
                    {sub?.status === 'trialing'
                      ? formatDate(sub?.trial_ends_at)
                      : sub?.status === 'active'
                      ? formatDate(sub?.current_period_ends_at)
                      : formatDate(sub?.locked_at || sub?.current_period_ends_at)}
                  </p>
                  <span className="gsea-billing-detail-sub">
                    {sub?.status === 'trialing' && sub?.days_left != null
                      ? `${sub.days_left} día(s) restante(s)`
                      : sub?.status === 'active'
                      ? 'Cobro recurrente mensual'
                      : 'Acceso restringido'}
                  </span>
                </div>

                <div className="gsea-billing-detail-item">
                  <span className="gsea-billing-detail-label">Modalidad de cobro</span>
                  <p className="gsea-billing-detail-val">Mensual</p>
                  <span className="gsea-billing-detail-sub">Moneda: MXN</span>
                </div>

                <div className="gsea-billing-detail-item">
                  <span className="gsea-billing-detail-label">Método de pago</span>
                  <p className="gsea-billing-detail-val">
                    {detail?.saved_payment_method
                      ? `${detail.saved_payment_method.brand.toUpperCase()} •••• ${detail.saved_payment_method.last4}`
                      : 'Tarjeta de crédito / débito'}
                  </p>
                  <span className="gsea-billing-detail-sub">
                    {detail?.stripe_configured ? 'Stripe activo' : 'Pasarela en configuración'}
                  </span>
                </div>
              </div>
            </div>

            {/* Consumo actual vs Límites del plan */}
            <div className="gsea-billing-usage-section">
              <h3 className="gsea-billing-section-title">
                <ShieldCheck size={20} color="#00529b" />
                Uso actual y límites del plan
              </h3>

              <div className="gsea-billing-usage-grid">
                {/* Usuarios */}
                <div className="gsea-billing-usage-card">
                  <div className="gsea-billing-usage-top">
                    <div className="gsea-billing-usage-top-left">
                      <Users size={18} color="#00529b" />
                      <span>Usuarios colaboradores</span>
                    </div>
                    <span className="gsea-billing-usage-top-right">
                      {usage.users} / {currentPlan?.limits?.users ?? '∞'}
                    </span>
                  </div>
                  <div className="gsea-billing-progress-track">
                    <div
                      className="gsea-billing-progress-fill"
                      style={{
                        width: `${
                          currentPlan?.limits?.users
                            ? Math.min(100, (usage.users / currentPlan.limits.users) * 100)
                            : 10
                        }%`,
                      }}
                    />
                  </div>
                  <div className="gsea-billing-usage-meta">
                    <span>Cupo en workspace</span>
                    <span>
                      {currentPlan?.limits?.users
                        ? `${Math.max(0, currentPlan.limits.users - usage.users)} disponibles`
                        : 'Ilimitado'}
                    </span>
                  </div>
                </div>

                {/* Pólizas */}
                <div className="gsea-billing-usage-card">
                  <div className="gsea-billing-usage-top">
                    <div className="gsea-billing-usage-top-left">
                      <FileText size={18} color="#00529b" />
                      <span>Pólizas registradas</span>
                    </div>
                    <span className="gsea-billing-usage-top-right">
                      {usage.polizas} /{' '}
                      {currentPlan?.limits?.polizas
                        ? currentPlan.limits.polizas.toLocaleString('es-MX')
                        : '∞'}
                    </span>
                  </div>
                  <div className="gsea-billing-progress-track">
                    <div
                      className="gsea-billing-progress-fill"
                      style={{
                        width: `${
                          currentPlan?.limits?.polizas
                            ? Math.min(100, (usage.polizas / currentPlan.limits.polizas) * 100)
                            : 5
                        }%`,
                      }}
                    />
                  </div>
                  <div className="gsea-billing-usage-meta">
                    <span>Cartera total</span>
                    <span>
                      {currentPlan?.limits?.polizas
                        ? `${(
                            currentPlan.limits.polizas - usage.polizas
                          ).toLocaleString('es-MX')} disponibles`
                        : 'Ilimitado'}
                    </span>
                  </div>
                </div>

                {/* Agentes */}
                <div className="gsea-billing-usage-card">
                  <div className="gsea-billing-usage-top">
                    <div className="gsea-billing-usage-top-left">
                      <UserCheck size={18} color="#00529b" />
                      <span>Agentes externos</span>
                    </div>
                    <span className="gsea-billing-usage-top-right">
                      {usage.agentes} / {currentPlan?.limits?.agentes ?? '∞'}
                    </span>
                  </div>
                  <div className="gsea-billing-progress-track">
                    <div
                      className="gsea-billing-progress-fill"
                      style={{
                        width: `${
                          currentPlan?.limits?.agentes
                            ? Math.min(100, (usage.agentes / currentPlan.limits.agentes) * 100)
                            : 10
                        }%`,
                      }}
                    />
                  </div>
                  <div className="gsea-billing-usage-meta">
                    <span>Equipo comercial</span>
                    <span>
                      {currentPlan?.limits?.agentes
                        ? `${Math.max(0, currentPlan.limits.agentes - usage.agentes)} disponibles`
                        : 'Ilimitado'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================
                2. CAMBIAR DE PLAN (CATÁLOGO REAL DEL BACKEND)
               ======================================================== */}
            <div className="gsea-plans-catalog-section">
              <div className="gsea-plans-header">
                <h3 className="gsea-plans-title">Cambiar de plan</h3>
                <p className="gsea-plans-subtitle">
                  Elige el plan que mejor se adapte al volumen y escala de tu promotoría.
                </p>
              </div>

              <div className="gsea-plans-grid">
                {plans.map((plan) => {
                  const isCurrent = currentPlan?.id === plan.id;
                  const isSelected = selectedPlanId === plan.id;

                  return (
                    <div
                      key={plan.id}
                      className={`gsea-plan-card ${isCurrent ? 'gsea-plan-card--current' : ''} ${
                        isSelected ? 'gsea-plan-card--selected' : ''
                      }`}
                      onClick={() => !isCurrent && setSelectedPlanId(plan.id)}
                      style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                    >
                      {isCurrent && (
                        <span className="gsea-plan-card-tag gsea-plan-card-tag--current">
                          Plan actual
                        </span>
                      )}
                      {!isCurrent && plan.slug === 'crm' && (
                        <span className="gsea-plan-card-tag gsea-plan-card-tag--popular">
                          Más popular
                        </span>
                      )}

                      <div className="gsea-plan-card-top">
                        <h4 className="gsea-plan-card-name">{plan.nombre}</h4>
                        <p className="gsea-plan-card-desc">
                          {plan.description ||
                            (plan.slug === 'simple'
                              ? 'Agente independiente o con asistente'
                              : plan.slug === 'crm'
                              ? 'Pequeña agencia o agente con equipo'
                              : 'Promotoría con agentes externos')}
                        </p>
                      </div>

                      <div className="gsea-plan-card-price-wrap">
                        <span className="gsea-plan-card-price">
                          {formatCurrency(plan.precio_mensual).replace('.00', '')}
                        </span>
                        <span className="gsea-plan-card-currency">MXN / mes</span>
                      </div>

                      {/* Chips de límites */}
                      <div className="gsea-plan-card-limits">
                        <span className="gsea-plan-limit-chip">
                          {plan.limits?.users ? `${plan.limits.users} usuarios` : 'Usuarios ilimitados'}
                        </span>
                        <span className="gsea-plan-limit-chip">
                          {plan.limits?.polizas
                            ? `${plan.limits.polizas.toLocaleString('es-MX')} pólizas`
                            : 'Pólizas ilimitadas'}
                        </span>
                        <span className="gsea-plan-limit-chip">
                          {plan.limits?.agentes
                            ? `${plan.limits.agentes} agentes`
                            : 'Agentes ilimitados'}
                        </span>
                      </div>

                      {/* Lista de beneficios reales */}
                      <ul className="gsea-plan-features-list">
                        {Array.isArray(plan.features) ? (
                          plan.features.map((feat, idx) => (
                            <li key={idx} className="gsea-plan-feature-item">
                              <Check size={16} className="gsea-plan-feature-icon" />
                              <span>{feat}</span>
                            </li>
                          ))
                        ) : (
                          <>
                            <li className="gsea-plan-feature-item">
                              <Check size={16} className="gsea-plan-feature-icon" />
                              <span>Gestión de pólizas y clientes</span>
                            </li>
                            <li className="gsea-plan-feature-item">
                              <Check size={16} className="gsea-plan-feature-icon" />
                              <span>Dashboard y seguimiento de cobranza</span>
                            </li>
                          </>
                        )}
                      </ul>

                      {/* Botón de acción por tarjeta */}
                      <div>
                        {isCurrent ? (
                          <button
                            type="button"
                            className="gsea-plan-btn gsea-plan-btn--current"
                            disabled
                          >
                            Tu plan actual
                          </button>
                        ) : isSelected ? (
                          <button
                            type="button"
                            className="gsea-plan-btn gsea-plan-btn--primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenConfirmModal(plan.id);
                            }}
                          >
                            <span>Continuar</span>
                            <ArrowRight size={16} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="gsea-plan-btn gsea-plan-btn--outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPlanId(plan.id);
                            }}
                          >
                            Elegir este plan
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Barra flotante de confirmación cuando hay un plan seleccionado */}
              {selectedPlanId && selectedPlanObj && selectedPlanId !== currentPlan?.id && (
                <div className="gsea-plans-continue-bar">
                  <div className="gsea-plans-continue-info">
                    <Sparkles size={20} color="#00e676" />
                    <div>
                      <strong>Has seleccionado el plan {selectedPlanObj.nombre}</strong>
                      <span style={{ display: 'block', fontSize: '0.84rem', opacity: 0.85 }}>
                        {formatCurrency(selectedPlanObj.precio_mensual)} MXN / mes
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="gsea-plans-continue-btn"
                    onClick={() => handleOpenConfirmModal(selectedPlanId)}
                  >
                    <span>Continuar con el cambio</span>
                    <ArrowRight size={17} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            3. MODAL DE CONFIRMACIÓN Y COTIZACIÓN OFICIAL
           ======================================================== */}
        {isModalOpen && (
          <div className="gsea-modal-backdrop" onClick={handleCloseModal}>
            <div
              className="gsea-modal-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="gsea-modal-header">
                <h3 className="gsea-modal-title">Confirmar cambio de suscripción</h3>
                <button
                  type="button"
                  className="gsea-modal-close-btn"
                  onClick={handleCloseModal}
                  aria-label="Cerrar modal"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="gsea-modal-body">
                {loadingPreview ? (
                  <div style={{ padding: '2.5rem 0', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="gsea-spin" style={{ margin: '0 auto 10px' }} />
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      Calculando cotización oficial y prorrateo…
                    </p>
                  </div>
                ) : previewData?.can_proceed === false ? (
                  /* ========================================================
                     REGLA DE BLOQUEO POR LÍMITES SUPERADOS (DOWNGRADE)
                     ======================================================== */
                  <div className="gsea-modal-warning-box">
                    <h4 className="gsea-modal-warning-title">
                      <AlertTriangle size={18} />
                      No es posible cambiar a este plan actualmente
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#78350f' }}>
                      El uso actual de tu workspace supera los límites contratados para el plan{' '}
                      <strong>{previewData.target_plan?.nombre}</strong>. Para evitar la pérdida o
                      eliminación automática de datos, debes ajustar previamente tu volumen:
                    </p>
                    <ul className="gsea-modal-warning-list">
                      {previewData.blockers?.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: '0.82rem',
                        color: '#92400e',
                        fontWeight: 600,
                      }}
                    >
                      Ningún usuario ni póliza se borrará automáticamente. Realiza los ajustes necesarios
                      en la sección correspondiente y vuelve a intentarlo.
                    </p>
                  </div>
                ) : (
                  /* ========================================================
                     COTIZACIÓN Y DESGLOSE FINANCIERO OFICIAL
                     ======================================================== */
                  <>
                    {/* Comparación de planes */}
                    <div className="gsea-modal-plans-banner">
                      <div className="gsea-modal-plan-box">
                        <span className="gsea-modal-plan-box-label">Plan actual</span>
                        <span className="gsea-modal-plan-box-val">
                          {previewData?.current_plan?.nombre || currentPlan?.nombre || 'Actual'}
                        </span>
                      </div>
                      <ArrowRight size={22} color="#00529b" />
                      <div className="gsea-modal-plan-box" style={{ textAlign: 'right' }}>
                        <span className="gsea-modal-plan-box-label">Plan seleccionado</span>
                        <span className="gsea-modal-plan-box-val" style={{ color: '#00529b' }}>
                          {previewData?.target_plan?.nombre || selectedPlanObj?.nombre}
                        </span>
                      </div>
                    </div>

                    {/* Desglose de importes */}
                    <table className="gsea-modal-quote-table">
                      <tbody>
                        <tr>
                          <td>Importe a pagar hoy</td>
                          <td>
                            {formatCurrency(
                              previewData?.quote?.amount_due_today,
                              previewData?.quote?.currency
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td>Impuestos o ajustes (IVA)</td>
                          <td>
                            {previewData?.quote?.tax > 0
                              ? formatCurrency(previewData.quote.tax, previewData?.quote?.currency)
                              : '$0.00 MXN (Incluidos)'}
                          </td>
                        </tr>
                        <tr className="total-row">
                          <td>Total a pagar hoy</td>
                          <td>
                            {formatCurrency(
                              previewData?.quote?.total,
                              previewData?.quote?.currency
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td>Fecha efectiva del cambio</td>
                          <td>{previewData?.quote?.effective_date || 'Inmediata'}</td>
                        </tr>
                        <tr>
                          <td>Próxima fecha de cobro recurrente</td>
                          <td>
                            {previewData?.quote?.next_billing_date} —{' '}
                            {formatCurrency(
                              previewData?.quote?.next_billing_amount,
                              previewData?.quote?.currency
                            )}
                            /mes
                          </td>
                        </tr>
                        <tr>
                          <td>Vigencia del periodo contratado</td>
                          <td>{previewData?.quote?.contract_period_end}</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Explicación del prorrateo desde el backend */}
                    {previewData?.quote?.summary_note && (
                      <div className="gsea-modal-quote-note">
                        <Info size={15} style={{ display: 'inline', marginRight: 6 }} />
                        {previewData.quote.summary_note}
                      </div>
                    )}

                    {/* Método de pago / Estado de Stripe */}
                    <div className="gsea-modal-gateway-card">
                      <div className="gsea-modal-gateway-header">
                        <CreditCard size={18} color="#00529b" />
                        <span>Método de pago</span>
                      </div>
                      <div className="gsea-modal-gateway-info">
                        {previewData?.payment_gateway?.is_configured ? (
                          previewData.payment_gateway.saved_payment_method ? (
                            <span>
                              {previewData.payment_gateway.saved_payment_method.brand.toUpperCase()} ••••{' '}
                              {previewData.payment_gateway.saved_payment_method.last4} (Vence{' '}
                              {previewData.payment_gateway.saved_payment_method.exp_month}/
                              {previewData.payment_gateway.saved_payment_method.exp_year})
                            </span>
                          ) : (
                            <span>Se solicitará tu tarjeta bancaria mediante pasarela Stripe segura.</span>
                          )
                        ) : (
                          <div style={{ color: '#b45309' }}>
                            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
                              Pasarela de pagos en configuración
                            </p>
                            <span>
                              La integración de cobros automáticos con tarjeta no está habilitada
                              en este entorno del servidor. No se realizarán cargos simulados.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="gsea-modal-footer">
                <button
                  type="button"
                  className="gsea-modal-btn-cancel"
                  onClick={handleCloseModal}
                  disabled={submittingChange}
                >
                  Volver a elegir plan
                </button>

                {previewData?.can_proceed !== false && !loadingPreview && (
                  <button
                    type="button"
                    className="gsea-modal-btn-confirm"
                    disabled={
                      submittingChange ||
                      !previewData?.payment_gateway?.is_configured
                    }
                    onClick={handleConfirmPlanChange}
                    title={
                      !previewData?.payment_gateway?.is_configured
                        ? 'Pasarela no disponible para cargos reales'
                        : 'Confirmar y pagar'
                    }
                  >
                    {submittingChange ? (
                      <>
                        <RefreshCw size={16} className="gsea-spin" />
                        <span>Procesando pago…</span>
                      </>
                    ) : (
                      <span>
                        Confirmar y pagar{' '}
                        {formatCurrency(
                          previewData?.quote?.total,
                          previewData?.quote?.currency
                        )}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </PageLayout>
  );
}
