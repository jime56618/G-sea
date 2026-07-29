import React, { useState } from 'react';
import { ShieldCheck, KeyRound, Smartphone, Monitor } from 'lucide-react';
import PageLayout, { ConfigPageHeader } from './PageLayout';
import './css/SaaS.css';
import './css/LegalAccount.css';

/** Seguridad de la cuenta — mock frontend. */
export default function SecuritySettings() {
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [twoFa, setTwoFa] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);

  const handlePassword = (e) => {
    e.preventDefault();
    if (!pwd.next || pwd.next !== pwd.confirm) {
      setMsg('Las contraseñas nuevas no coinciden.');
      return;
    }
    setMsg('Contraseña actualizada (simulado).');
    setPwd({ current: '', next: '', confirm: '' });
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <PageLayout>
      <ConfigPageHeader
        icon={ShieldCheck}
        title="Seguridad"
        subtitle="Contraseña, autenticación y sesiones. Vista temporal solo frontend."
      />
      <p className="gsea-mock-note">Mock · No se conecta al API todavía</p>
      {msg && (
        <p className={`gsea-msg ${msg.includes('no coinciden') ? 'gsea-msg--error' : 'gsea-msg--ok'}`}>
          {msg}
        </p>
      )}

      <div className="gsea-account-grid">
        <div className="gsea-card gsea-card--section">
          <h2 className="gsea-card__title">
            <KeyRound size={18} /> Cambiar contraseña
          </h2>
          <form className="gsea-form" onSubmit={handlePassword}>
            <label className="gsea-label">Contraseña actual</label>
            <input
              className="gsea-input"
              type="password"
              value={pwd.current}
              onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
              required
            />
            <label className="gsea-label">Nueva contraseña</label>
            <input
              className="gsea-input"
              type="password"
              value={pwd.next}
              onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
              required
            />
            <label className="gsea-label">Confirmar nueva</label>
            <input
              className="gsea-input"
              type="password"
              value={pwd.confirm}
              onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
              required
            />
            <button type="submit" className="gsea-btn-primary">
              Actualizar contraseña
            </button>
          </form>
        </div>

        <div className="gsea-card gsea-card--section">
          <h2 className="gsea-card__title">
            <Smartphone size={18} /> Protección extra
          </h2>
          <div className="gsea-toggle-row">
            <div>
              <strong>Autenticación en dos pasos (2FA)</strong>
              <p>Requiere un código adicional al iniciar sesión.</p>
            </div>
            <label className="gsea-switch">
              <input type="checkbox" checked={twoFa} onChange={(e) => setTwoFa(e.target.checked)} />
              <span />
            </label>
          </div>
          <div className="gsea-toggle-row">
            <div>
              <strong>Alertas de inicio de sesión</strong>
              <p>Te avisamos por correo ante accesos nuevos.</p>
            </div>
            <label className="gsea-switch">
              <input
                type="checkbox"
                checked={loginAlerts}
                onChange={(e) => setLoginAlerts(e.target.checked)}
              />
              <span />
            </label>
          </div>
        </div>
      </div>

      <div className="gsea-card gsea-card--section">
        <h2 className="gsea-card__title">
          <Monitor size={18} /> Sesiones activas (demo)
        </h2>
        <div className="gsea-table-wrap">
          <table className="gsea-table gsea-table--styled">
            <thead>
              <tr>
                <th>Dispositivo</th>
                <th>Ubicación</th>
                <th>Último acceso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Chrome · Windows</td>
                <td>Mérida, MX</td>
                <td>Ahora</td>
                <td>
                  <span className="gsea-badge gsea-badge--success">Actual</span>
                </td>
              </tr>
              <tr>
                <td>Safari · iPhone</td>
                <td>Mérida, MX</td>
                <td>Ayer</td>
                <td>
                  <button
                    type="button"
                    className="gsea-legal-btn gsea-legal-btn--ghost"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                    onClick={() => setMsg('Sesión cerrada (simulado).')}
                  >
                    Cerrar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
