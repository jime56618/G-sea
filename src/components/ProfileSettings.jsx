import React, { useEffect, useState } from 'react';
import { User, Camera, Save } from 'lucide-react';
import PageLayout, { ConfigPageHeader } from './PageLayout';
import { useAuth } from '../context/AuthContext';
import './css/SaaS.css';
import './css/LegalAccount.css';

/** Configuración de perfil — mock frontend (sin API). */
export default function ProfileSettings() {
  const { user, currentWorkspace, role } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    telefono: '',
    cargo: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      name: user?.name || '',
      email: user?.email || '',
      telefono: user?.telefono || '',
      cargo: role?.nombre || role?.name || '',
    });
  }, [user, role]);

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const avatarSrc = user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name || 'U')}&background=1E488F&color=fff`;

  return (
    <PageLayout>
      <ConfigPageHeader
        icon={User}
        title="Perfil"
        subtitle="Actualiza tu información visible en GSEA. Vista temporal (solo frontend)."
      />
      <p className="gsea-mock-note">Mock · Los cambios no se envían al servidor todavía</p>

      <div className="gsea-account-grid">
        <div className="gsea-card gsea-card--section">
          <h2 className="gsea-card__title">Foto y datos</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <img
              src={avatarSrc}
              alt=""
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid #e2e8f0' }}
            />
            <button type="button" className="gsea-btn-primary" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Camera size={16} /> Cambiar foto
            </button>
          </div>
          <form className="gsea-form" onSubmit={handleSave}>
            <label className="gsea-label">Nombre completo</label>
            <input
              className="gsea-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <label className="gsea-label">Correo</label>
            <input className="gsea-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label className="gsea-label">Teléfono</label>
            <input className="gsea-input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="55 0000 0000" />
            <label className="gsea-label">Cargo / rol</label>
            <input className="gsea-input" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
            {saved && <p className="gsea-msg gsea-msg--ok">Perfil guardado (simulado).</p>}
            <button type="submit" className="gsea-btn-primary" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Save size={16} /> Guardar cambios
            </button>
          </form>
        </div>

        <div className="gsea-card gsea-card--section">
          <h2 className="gsea-card__title">Workspace activo</h2>
          <p className="gsea-config-muted" style={{ marginBottom: '1rem' }}>
            Promotoría: <strong>{currentWorkspace?.nombre || '—'}</strong>
          </p>
          <div className="gsea-stat-card">
            <span className="gsea-stat-card__label">ID de usuario</span>
            <p className="gsea-stat-card__value gsea-stat-card__value--sm">{user?.id || '—'}</p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
