import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
function getStatusLabel(status, isAccessible, cancelAtPeriodEnd) {
  if (status === 'trialing') {
    return {
      text: 'En prueba',
      pillClass: 'gsea-billing-status-pill--trial',
      icon: Clock,
    };
  }
  if (cancelAtPeriodEnd || (status === 'canceled' && isAccessible)) {
    return {
      text: 'Cancelación programada',
      pillClass: 'gsea-billing-status-pill--scheduled',
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Selección de plan y modal de confirmación
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [renewalMode, setRenewalMode] = useState('automatic');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submittingChange, setSubmittingChange] = useState(false);

  // Activación / renovación rápida para workspaces bloqueados o en prueba
  const [activating, setActivating] = useState(false);

  // Administración de suscripción actual (cancelar renovación, cambiar a manual, reactivar)
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [cancelModalAction, setCancelModalAction] = useState(null); // 'cancel' | 'switch-to-manual' | null
  const [submittingManageAction, setSubmittingManageAction] = useState(false);

  const workspaceId = getActiveWorkspaceId();

  // Carga inicial de datos de facturación
  const fetchBilling = async () => {
    if (!workspaceId) return;
    try {
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

  // Manejo del retorno desde Stripe Checkout (?checkout=success&session_id=... o ?checkout=cancel)
  useEffect(() => {
    const checkoutResult = searchParams.get('checkout');
    const sessionId = searchParams.get('session_id');

    if (!checkoutResult || !workspaceId) return;

    let cancelled = false;

    const handleStripeReturn = async () => {
      if (checkoutResult === 'cancel') {
        setErrorMsg('El proceso de pago en Stripe fue cancelado. No se realizó ningún cargo.');
        setSearchParams({}, { replace: true });
        return;
      }

      if (checkoutResult === 'success' && sessionId) {
        try {
          setErrorMsg('');
          const verifyRes = await apiFetch(
            `/workspaces/${workspaceId}/billing/checkout/verify`,
            {
              method: 'POST',
              body: JSON.stringify({ session_id: sessionId }),
            }
          );

          if (!cancelled) {
            if (verifyRes?.verified) {
              setSuccessMsg(
                verifyRes.message || 'Pago confirmado y suscripción activada exitosamente.'
              );
            } else {
              setSuccessMsg(
                'Tu pago está siendo procesado por Stripe. El estado de tu suscripción se actualizará en unos momentos.'
              );
            }
            await refresh({ force: true });
            await fetchBilling();
          }
        } catch (e) {
          if (!cancelled) {
            setErrorMsg(
              e.message || 'No fue posible verificar la sesión de pago con el servidor.'
            );
          }
        } finally {
          if (!cancelled) {
            setSearchParams({}, { replace: true });
          }
        }
      }
    };

    handleStripeReturn();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, searchParams]);

  const sub = detail?.subscription || subscription;
  const currentPlan = sub?.plan;
  const usage = sub?.usage || { users: 0, polizas: 0, agentes: 0 };
  const plans = detail?.plans || [];
  const hasActiveStripeSubscription = Boolean(sub?.has_stripe_subscription);
  const isScheduledCancellation = Boolean(
    sub?.cancel_at_period_end || (sub?.status === 'canceled' && sub?.is_accessible)
  );
  const isAutomaticActive = Boolean(
    sub?.status === 'active' &&
      (sub?.renewal_mode === 'automatic' || hasActiveStripeSubscription) &&
      !isScheduledCancellation
  );

  const statusInfo = useMemo(
    () => getStatusLabel(sub?.status, sub?.is_accessible, sub?.cancel_at_period_end),
    [sub?.status, sub?.is_accessible, sub?.cancel_at_period_end]
  );

  // Abrir modal y calcular cotización oficial desde backend
  const handleOpenConfirmModal = async (planId, modeOverride) => {
    const targetId = planId || selectedPlanId || currentPlan?.id;
    if (!targetId) return;

    const isRenewingCurrentActivePlan =
      targetId === currentPlan?.id &&
      (sub?.status === 'active' || isScheduledCancellation);

    const defaultModeForTarget = isRenewingCurrentActivePlan
      ? 'manual'
      : renewalMode || 'automatic';

    const modeToUse = modeOverride || defaultModeForTarget;

    // Si existe una suscripción automática con cancelación programada para este mismo plan,
    // reutilizar el endpoint de reactivación sin crear otra suscripción en Stripe.
    if (
      modeToUse === 'automatic' &&
      targetId === currentPlan?.id &&
      Boolean(sub?.can_reactivate_automatic)
    ) {
      setIsModalOpen(false);
      setPreviewData(null);
      await handleReactivateAutomatic();
      return;
    }

    setSelectedPlanId(targetId);
    setRenewalMode(modeToUse);
    setIsModalOpen(true);
    setLoadingPreview(true);
    setErrorMsg('');

    try {
      const quoteRes = await apiFetch(
        `/workspaces/${workspaceId}/billing/preview-change`,
        {
          method: 'POST',
          body: JSON.stringify({ plan_id: targetId, renewal_mode: modeToUse }),
        }
      );
      setPreviewData(quoteRes);
    } catch (e) {
      setErrorMsg(e.message || 'No fue posible obtener la cotización del cambio de plan.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRenewalModeChange = async (newMode) => {
    if (newMode === renewalMode || submittingChange) return;

    // Si el usuario ya tiene una suscripción automática activa en este mismo plan y elige
    // cambiar a modalidad manual, abrir el modal gratuito de cambio de modalidad en lugar de cobrar otro mes.
    if (
      newMode === 'manual' &&
      selectedPlanId === currentPlan?.id &&
      isAutomaticActive
    ) {
      setIsModalOpen(false);
      setPreviewData(null);
      setCancelModalAction('switch-to-manual');
      return;
    }

    // Si existe una suscripción automática con cancelación programada, reactivarla sin crear otra suscripción.
    if (
      newMode === 'automatic' &&
      selectedPlanId === currentPlan?.id &&
      Boolean(sub?.can_reactivate_automatic)
    ) {
      setIsModalOpen(false);
      setPreviewData(null);
      await handleReactivateAutomatic();
      return;
    }

    setRenewalMode(newMode);
    if (selectedPlanId) {
      await handleOpenConfirmModal(selectedPlanId, newMode);
    }
  };

  const handleCloseModal = () => {
    if (submittingChange) return;
    setIsModalOpen(false);
    setPreviewData(null);
  };

  // Iniciar sesión de Stripe Checkout y redirigir de forma segura
  const handleConfirmPlanChange = async () => {
    if (!selectedPlanId || submittingChange) return;
    setSubmittingChange(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/billing/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          plan_id: selectedPlanId,
          renewal_mode: renewalMode,
        }),
      });

      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }

      setErrorMsg('No se recibió la URL de pago desde Stripe.');
    } catch (e) {
      setErrorMsg(e.message || 'No fue posible iniciar el pago con Stripe.');
    } finally {
      setSubmittingChange(false);
    }
  };

  // Reactivación / Contratación mediante Stripe Checkout para workspaces bloqueados o en prueba
  const handleActivate = async () => {
    const targetPlanId = currentPlan?.id || plans[0]?.id;
    if (!targetPlanId) return;
    setActivating(true);
    try {
      await handleOpenConfirmModal(targetPlanId, renewalMode);
    } finally {
      setActivating(false);
    }
  };

  // Renovación manual (+1 mes) del plan actual mediante Stripe Checkout
  const handleRenewCurrentPlan = async () => {
    const targetPlanId = currentPlan?.id || plans[0]?.id;
    if (!targetPlanId) return;
    await handleOpenConfirmModal(targetPlanId, 'manual');
  };

  // Abrir modal de confirmación antes de cancelar renovación automática o pasar a manual
  const handleOpenCancelModal = (actionType) => {
    if (submittingManageAction) return;
    setErrorMsg('');
    setSuccessMsg('');
    setCancelModalAction(actionType);
  };

  const handleCloseCancelModal = () => {
    if (submittingManageAction) return;
    setCancelModalAction(null);
  };

  // Confirmar cancelación al final del periodo o cambio a renovación manual
  const handleConfirmCancelAction = async () => {
    if (!cancelModalAction || submittingManageAction) return;
    setSubmittingManageAction(true);
    setErrorMsg('');
    setSuccessMsg('');

    const endpoint =
      cancelModalAction === 'switch-to-manual'
        ? `/workspaces/${workspaceId}/billing/subscription/switch-to-manual`
        : `/workspaces/${workspaceId}/billing/subscription/cancel`;

    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
      });
      setCancelModalAction(null);
      setSuccessMsg(
        res?.message ||
          'La renovación automática se desactivó para el final de tu periodo actual.'
      );
      await refresh({ force: true });
      await fetchBilling();
    } catch (e) {
      setErrorMsg(
        e.message || 'No fue posible actualizar la suscripción en este momento.'
      );
    } finally {
      setSubmittingManageAction(false);
    }
  };

  // Reactivar renovación automática sin cobro nuevo cuando el ciclo actual sigue vigente
  const handleReactivateAutomatic = async () => {
    if (submittingManageAction) return;
    setSubmittingManageAction(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiFetch(
        `/workspaces/${workspaceId}/billing/subscription/reactivate`,
        {
          method: 'POST',
        }
      );
      setSuccessMsg(
        res?.message || 'Renovación automática reactivada exitosamente.'
      );
      await refresh({ force: true });
      await fetchBilling();
    } catch (e) {
      setErrorMsg(
        e.message || 'No fue posible reactivar la renovación automática.'
      );
    } finally {
      setSubmittingManageAction(false);
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
  const isDeferredAutomaticQuote = Boolean(
    renewalMode === 'automatic' &&
      previewData?.quote &&
      (previewData.quote.is_deferred_automatic || Number(previewData.quote.total) === 0)
  );

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

                <div className="gsea-billing-header-actions">
                  {(sub?.status === 'active' || isScheduledCancellation) &&
                    !sub?.is_locked &&
                    sub?.is_accessible && (
                      <button
                        type="button"
                        className={`gsea-billing-manage-toggle ${
                          isManageOpen ? 'gsea-billing-manage-toggle--open' : ''
                        }`}
                        onClick={() => setIsManageOpen((prev) => !prev)}
                      >
                        <span>Administrar suscripción</span>
                      </button>
                    )}

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
              </div>

              {/* Fechas de renovación y fin de acceso diferenciadas */}
              <div className="gsea-billing-details-grid">
                <div className="gsea-billing-detail-item">
                  <span className="gsea-billing-detail-label">
                    {sub?.status === 'trialing'
                      ? 'Fin de la prueba'
                      : isScheduledCancellation
                      ? 'Fin de acceso actual'
                      : sub?.status === 'active'
                      ? sub?.renewal_mode === 'manual'
                        ? 'Vencimiento del periodo'
                        : 'Próxima renovación'
                      : 'Fin de acceso'}
                  </span>
                  <p className="gsea-billing-detail-val">
                    {sub?.status === 'trialing'
                      ? formatDate(sub?.trial_ends_at)
                      : sub?.status === 'active' || isScheduledCancellation
                      ? formatDate(sub?.current_period_ends_at)
                      : formatDate(sub?.locked_at || sub?.current_period_ends_at)}
                  </p>
                  <span className="gsea-billing-detail-sub">
                    {sub?.status === 'trialing' && sub?.days_left != null
                      ? `${sub.days_left} día(s) restante(s)`
                      : sub?.in_grace_period
                      ? 'En periodo de gracia (3 días)'
                      : isScheduledCancellation
                      ? sub?.days_left != null
                        ? `Cancelación programada (${sub.days_left} día(s) restante(s))`
                        : 'Sin cargos automáticos posteriores'
                      : sub?.status === 'active'
                      ? sub?.renewal_mode === 'manual'
                        ? 'Pago único mensual (renovación manual)'
                        : 'Cobro recurrente mensual'
                      : 'Acceso restringido'}
                  </span>
                </div>

                <div className="gsea-billing-detail-item">
                  <span className="gsea-billing-detail-label">Modalidad de cobro</span>
                  <p className="gsea-billing-detail-val">
                    {isScheduledCancellation
                      ? 'Renovación manual al vencer'
                      : sub?.status === 'active'
                      ? sub?.renewal_mode === 'manual'
                        ? 'Renovación manual (1 mes)'
                        : 'Renovación automática'
                      : 'Mensual'}
                  </p>
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

              {/* Panel desplegable de Administración de Suscripción */}
              {isManageOpen &&
                (sub?.status === 'active' || isScheduledCancellation) &&
                !sub?.is_locked &&
                sub?.is_accessible && (
                  <div className="gsea-billing-manage-panel">
                    {/* CASO C: Suscripción con cancelación programada */}
                    {isScheduledCancellation ? (
                      <div className="gsea-billing-manage-content">
                        <div className="gsea-billing-manage-text">
                          <strong>Cancelación de renovación automática programada</strong>
                          <p>
                            Tu promotoría conservará acceso completo al{' '}
                            <strong>{currentPlan?.nombre || 'plan actual'}</strong> hasta el{' '}
                            <strong>{formatDate(sub?.current_period_ends_at)}</strong>. No se
                            realizarán cobros automáticos posteriores.
                          </p>
                        </div>
                        <div className="gsea-billing-manage-actions">
                          {sub?.can_reactivate_automatic && (
                            <button
                              type="button"
                              className="gsea-billing-manage-btn gsea-billing-manage-btn--primary"
                              disabled={submittingManageAction}
                              onClick={handleReactivateAutomatic}
                            >
                              <RefreshCw
                                size={15}
                                className={submittingManageAction ? 'gsea-spin' : ''}
                              />
                              <span>
                                {submittingManageAction
                                  ? 'Reactivando…'
                                  : 'Reactivar renovación automática'}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="gsea-billing-manage-btn gsea-billing-manage-btn--secondary"
                            disabled={submittingManageAction}
                            onClick={handleRenewCurrentPlan}
                          >
                            <span>Renovar plan</span>
                          </button>
                        </div>
                      </div>
                    ) : isAutomaticActive ? (
                      /* CASO B: Suscripción activa con renovación automática */
                      <div className="gsea-billing-manage-content">
                        <div className="gsea-billing-manage-text">
                          <strong>Suscripción activa con renovación automática</strong>
                          <p>
                            Tu próxima fecha de cobro recurrente es el{' '}
                            <strong>{formatDate(sub?.current_period_ends_at)}</strong>. Si cambias a
                            renovación manual o cancelas la renovación automática, conservarás el
                            acceso completo hasta esa fecha sin cargos futuros automáticos.
                          </p>
                        </div>
                        <div className="gsea-billing-manage-actions">
                          <button
                            type="button"
                            className="gsea-billing-manage-btn gsea-billing-manage-btn--secondary"
                            disabled={submittingManageAction}
                            onClick={() => handleOpenCancelModal('switch-to-manual')}
                          >
                            <span>Cambiar a renovación manual</span>
                          </button>
                          <button
                            type="button"
                            className="gsea-billing-manage-btn gsea-billing-manage-btn--danger"
                            disabled={submittingManageAction}
                            onClick={() => handleOpenCancelModal('cancel')}
                          >
                            <span>Cancelar renovación automática</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* CASO A: Suscripción activa con renovación manual */
                      <div className="gsea-billing-manage-content">
                        <div className="gsea-billing-manage-text">
                          <strong>Modalidad actual: Renovación manual</strong>
                          <p>
                            Tu periodo pagado vence el{' '}
                            <strong>{formatDate(sub?.current_period_ends_at)}</strong>. No tienes
                            cargos recurrentes automáticos activos; puedes renovar tu plan por un mes
                            adicional sumándolo a tu vigencia actual o activar la renovación
                            automática.
                          </p>
                        </div>
                        <div className="gsea-billing-manage-actions">
                          <button
                            type="button"
                            className="gsea-billing-manage-btn gsea-billing-manage-btn--primary"
                            onClick={handleRenewCurrentPlan}
                          >
                            <span>Renovar plan</span>
                          </button>
                          <button
                            type="button"
                            className="gsea-billing-manage-btn gsea-billing-manage-btn--secondary"
                            onClick={() =>
                              handleOpenConfirmModal(
                                currentPlan?.id || plans[0]?.id,
                                'automatic'
                              )
                            }
                          >
                            <span>Activar renovación automática</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                  const isCurrentAutomaticActive = isCurrent && isAutomaticActive;
                  const isSelected = selectedPlanId === plan.id;

                  return (
                    <div
                      key={plan.id}
                      className={`gsea-plan-card ${isCurrent ? 'gsea-plan-card--current' : ''} ${
                        isSelected ? 'gsea-plan-card--selected' : ''
                      }`}
                      onClick={() => !isCurrentAutomaticActive && setSelectedPlanId(plan.id)}
                      style={{ cursor: isCurrentAutomaticActive ? 'default' : 'pointer' }}
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
                        {isCurrentAutomaticActive ? (
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
                              handleOpenConfirmModal(
                                plan.id,
                                isCurrent && (sub?.status === 'active' || isScheduledCancellation)
                                  ? 'manual'
                                  : undefined
                              );
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
                            {isCurrent
                              ? sub?.status === 'active' || isScheduledCancellation
                                ? 'Renovar este plan'
                                : 'Activar este plan'
                              : 'Elegir este plan'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Barra flotante de confirmación cuando hay un plan seleccionado */}
              {selectedPlanId &&
                selectedPlanObj &&
                (selectedPlanId !== currentPlan?.id || !isAutomaticActive) && (
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
                    onClick={() =>
                      handleOpenConfirmModal(
                        selectedPlanId,
                        selectedPlanId === currentPlan?.id &&
                          (sub?.status === 'active' || isScheduledCancellation)
                          ? 'manual'
                          : undefined
                      )
                    }
                  >
                    <span>
                      {selectedPlanId === currentPlan?.id
                        ? sub?.status === 'active' || isScheduledCancellation
                          ? 'Continuar con la renovación'
                          : 'Continuar con la activación'
                        : 'Continuar con el cambio'}
                    </span>
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
                            {isDeferredAutomaticQuote
                              ? '$0.00 a pagar hoy'
                              : formatCurrency(
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
                            {isDeferredAutomaticQuote
                              ? '$0.00 a pagar hoy'
                              : formatCurrency(
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
                          <td>
                            {isDeferredAutomaticQuote
                              ? 'Fecha del primer cobro automático'
                              : 'Próxima fecha de cobro recurrente'}
                          </td>
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
                          <td>
                            {isDeferredAutomaticQuote
                              ? 'Vigencia actual ya pagada'
                              : 'Vigencia del periodo contratado'}
                          </td>
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

                    {/* Selector de modalidad de renovación (Automática vs Manual) */}
                    <div className="gsea-modal-gateway-card">
                      <div className="gsea-modal-gateway-header">
                        <Calendar size={18} color="#00529b" />
                        <span>Modalidad de renovación</span>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                          gap: '10px',
                          marginTop: '4px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleRenewalModeChange('automatic')}
                          disabled={submittingChange}
                          style={{
                            textAlign: 'left',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            border:
                              renewalMode === 'automatic'
                                ? '2px solid #00529b'
                                : '1px solid #e2e8f0',
                            background:
                              renewalMode === 'automatic' ? '#f0f7ff' : '#f8fafc',
                            cursor: submittingChange ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '4px',
                            }}
                          >
                            <strong
                              style={{
                                fontSize: '0.88rem',
                                color: '#0b1b3d',
                              }}
                            >
                              Renovación automática
                            </strong>
                            {renewalMode === 'automatic' && (
                              <CheckCircle2 size={16} color="#00529b" />
                            )}
                          </div>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '0.78rem',
                              color: '#64748b',
                              lineHeight: 1.35,
                            }}
                          >
                            Cobro mensual automático mediante suscripción en Stripe.
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRenewalModeChange('manual')}
                          disabled={submittingChange}
                          style={{
                            textAlign: 'left',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            border:
                              renewalMode === 'manual'
                                ? '2px solid #00529b'
                                : '1px solid #e2e8f0',
                            background:
                              renewalMode === 'manual' ? '#f0f7ff' : '#f8fafc',
                            cursor: submittingChange ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '4px',
                            }}
                          >
                            <strong
                              style={{
                                fontSize: '0.88rem',
                                color: '#0b1b3d',
                              }}
                            >
                              Renovación manual (1 mes)
                            </strong>
                            {renewalMode === 'manual' && (
                              <CheckCircle2 size={16} color="#00529b" />
                            )}
                          </div>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '0.78rem',
                              color: '#64748b',
                              lineHeight: 1.35,
                            }}
                          >
                            Pago único por 1 mes sin cargos recurrentes automáticos.
                          </span>
                        </button>
                      </div>
                    </div>

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
                        : isDeferredAutomaticQuote
                        ? 'Autorizar renovación automática'
                        : 'Confirmar y pagar'
                    }
                  >
                    {submittingChange ? (
                      <>
                        <RefreshCw size={16} className="gsea-spin" />
                        <span>
                          {isDeferredAutomaticQuote
                            ? 'Redirigiendo a Stripe…'
                            : 'Procesando pago…'}
                        </span>
                      </>
                    ) : isDeferredAutomaticQuote ? (
                      <span>Autorizar renovación automática</span>
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

        {/* ========================================================
            4. MODAL DE CONFIRMACIÓN DE CANCELACIÓN / CAMBIO A MANUAL
           ======================================================== */}
        {cancelModalAction && (
          <div className="gsea-modal-backdrop" onClick={handleCloseCancelModal}>
            <div
              className="gsea-modal-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="gsea-modal-header">
                <h3 className="gsea-modal-title">
                  {cancelModalAction === 'switch-to-manual'
                    ? 'Cambiar a renovación manual'
                    : '¿Seguro que quieres cancelar tu renovación automática?'}
                </h3>
                <button
                  type="button"
                  className="gsea-modal-close-btn"
                  onClick={handleCloseCancelModal}
                  disabled={submittingManageAction}
                  aria-label="Cerrar modal"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="gsea-modal-body">
                <div className="gsea-modal-warning-box">
                  <h4 className="gsea-modal-warning-title">
                    <Clock size={18} />
                    {cancelModalAction === 'switch-to-manual'
                      ? 'Desactivación de cobros automáticos al finalizar tu periodo'
                      : 'Cancelación programada para el final del periodo'}
                  </h4>
                  {cancelModalAction === 'switch-to-manual' ? (
                    <>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.9rem',
                          color: '#0b1b3d',
                          lineHeight: 1.5,
                        }}
                      >
                        Los cobros automáticos se desactivarán al finalizar tu periodo pagado.
                        Conservarás acceso completo al plan{' '}
                        <strong>{currentPlan?.nombre || 'contratado'}</strong> hasta el{' '}
                        <strong>{formatDate(sub?.current_period_ends_at)}</strong>.
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.86rem',
                          color: '#475569',
                          lineHeight: 1.5,
                        }}
                      >
                        Este cambio de modalidad no genera ningún cobro hoy ni agrega otro mes de
                        vigencia. Cuando llegue el vencimiento o decidas renovar, podrás pagar un
                        mes adicional de forma manual.
                      </p>
                    </>
                  ) : (
                    <>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.9rem',
                          color: '#0b1b3d',
                          lineHeight: 1.5,
                        }}
                      >
                        Tu promotoría conservará acceso completo al plan{' '}
                        <strong>{currentPlan?.nombre || 'contratado'}</strong> hasta el{' '}
                        <strong>{formatDate(sub?.current_period_ends_at)}</strong>.
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.88rem',
                          color: '#475569',
                          lineHeight: 1.5,
                        }}
                      >
                        No se realizarán cobros automáticos posteriores y tu información permanecerá
                        guardada en GSEA.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="gsea-modal-footer">
                <button
                  type="button"
                  className="gsea-modal-btn-cancel"
                  onClick={handleCloseCancelModal}
                  disabled={submittingManageAction}
                >
                  Conservar mi plan
                </button>

                <button
                  type="button"
                  className={`gsea-modal-btn-confirm ${
                    cancelModalAction === 'cancel' ? 'gsea-modal-btn-confirm--danger' : ''
                  }`}
                  onClick={handleConfirmCancelAction}
                  disabled={submittingManageAction}
                >
                  {submittingManageAction ? (
                    <>
                      <RefreshCw size={16} className="gsea-spin" />
                      <span>Procesando…</span>
                    </>
                  ) : (
                    <span>
                      {cancelModalAction === 'switch-to-manual'
                        ? 'Confirmar cambio'
                        : 'Confirmar cancelación'}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </PageLayout>
  );
}
