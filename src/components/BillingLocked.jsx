import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/apiClient';
import { useAuth } from '../context/AuthContext';
import { getActiveWorkspaceId } from '../utils/workspaceStorage';
import './css/SaaS.css';

/**
 * Pantalla cuando el trial o la suscripción vencieron (HTTP 402).
 * Permite seleccionar plan, modalidad (automática o manual) y pagar en Stripe Checkout si tiene billing.manage.
 */
export default function BillingLocked() {
  const { refresh, logout, can, subscription } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [renewalMode, setRenewalMode] = useState('automatic');
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const workspaceId = getActiveWorkspaceId();

  useEffect(() => {
    if (!workspaceId || !can('billing.manage')) return;

    let cancelled = false;
    const loadBilling = async () => {
      setLoadingPlans(true);
      try {
        const data = await apiFetch(`/workspaces/${workspaceId}/billing`);
        if (!cancelled) {
          const list = data?.plans || [];
          setPlans(list);
          const currentPlanId = data?.subscription?.plan?.id || subscription?.plan?.id;
          if (currentPlanId && list.some((p) => p.id === currentPlanId)) {
            setSelectedPlanId(String(currentPlanId));
          } else if (list.length > 0) {
            setSelectedPlanId(String(list[0].id));
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'No se pudieron cargar los planes disponibles.');
        }
      } finally {
        if (!cancelled) {
          setLoadingPlans(false);
        }
      }
    };

    loadBilling();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, subscription?.plan?.id]);

  const handleCheckout = async () => {
    if (!workspaceId) return;
    const planIdToUse = Number(selectedPlanId || subscription?.plan?.id);
    if (!planIdToUse) {
      navigate('/configuracion/facturacion');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/billing/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          plan_id: planIdToUse,
          renewal_mode: renewalMode,
        }),
      });

      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }

      setError('No fue posible obtener la URL de pago de Stripe.');
    } catch (e) {
      setError(e.message || 'No se pudo iniciar el pago con Stripe.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    setError('');
    try {
      const updated = await refresh({ force: true });
      const sub = updated?.current_workspace?.subscription;
      if (sub && sub.is_accessible && !sub.is_locked) {
        navigate('/dashboard', { replace: true });
      }
    } catch (e) {
      setError(e.message || 'No fue posible actualizar el estado.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="gsea-billing-page">
      <div className="gsea-billing-card">
        <h1>Tu periodo de prueba terminó</h1>
        <p>
          La promotoría está bloqueada hasta que actives un plan de pago. Contacta al administrador
          de tu cuenta o activa la suscripción si tienes permisos.
        </p>
        {subscription?.trial_ends_at && (
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Trial finalizó: {new Date(subscription.trial_ends_at).toLocaleDateString('es-MX')}
          </p>
        )}
        {!subscription?.trial_ends_at && subscription?.current_period_ends_at && (
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Periodo venció: {new Date(subscription.current_period_ends_at).toLocaleDateString('es-MX')}
          </p>
        )}
        {error && <p className="gsea-error">{error}</p>}
        {can('billing.manage') ? (
          <>
            {!loadingPlans && plans.length > 0 && (
              <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                <label className="gsea-label" htmlFor="locked-plan-select">
                  Plan a contratar
                </label>
                <select
                  id="locked-plan-select"
                  className="gsea-select"
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  disabled={loading}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — ${Number(p.precio_mensual).toLocaleString('es-MX')} MXN / mes
                    </option>
                  ))}
                </select>

                <label className="gsea-label" htmlFor="locked-renewal-select">
                  Modalidad de renovación
                </label>
                <select
                  id="locked-renewal-select"
                  className="gsea-select"
                  value={renewalMode}
                  onChange={(e) => setRenewalMode(e.target.value)}
                  disabled={loading}
                >
                  <option value="automatic">Renovación automática (cobro mensual)</option>
                  <option value="manual">Renovación manual (pago único 1 mes)</option>
                </select>
              </div>
            )}

            <button
              type="button"
              className="gsea-billing-btn"
              disabled={loading || loadingPlans}
              onClick={handleCheckout}
            >
              {loading ? 'Redirigiendo a Stripe…' : 'Continuar al pago con Stripe'}
            </button>
          </>
        ) : (
          <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
            No tienes permiso de facturación. Pide a un administrador que active el plan.
          </p>
        )}
        <button
          type="button"
          className="gsea-billing-btn gsea-billing-btn--secondary"
          disabled={checking}
          onClick={handleCheckStatus}
        >
          {checking ? 'Verificando…' : 'Revisar estado'}
        </button>
        <button
          type="button"
          className="gsea-billing-btn gsea-billing-btn--secondary"
          onClick={logout}
          style={{ marginTop: '0.5rem' }}
        >
          Cerrar sesión
        </button>
        {can('billing.manage') && (
          <Link to="/configuracion/facturacion" style={{ display: 'block', marginTop: '1rem', fontSize: '0.85rem' }}>
            Ir a configuración de facturación
          </Link>
        )}
      </div>
    </div>
  );
}
