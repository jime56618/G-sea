import React, { useState } from 'react';
import { Database, Download, Trash2, Edit3 } from 'lucide-react';
import PageLayout, { ConfigPageHeader } from './PageLayout';
import { useAuth } from '../context/AuthContext';
import './css/SaaS.css';
import './css/LegalAccount.css';

/** Derechos ARCO / modificación y eliminación de datos — mock frontend. */
export default function MyDataSettings() {
  const { user } = useAuth();
  const [msg, setMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');

  const simulate = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <PageLayout>
      <ConfigPageHeader
        icon={Database}
        title="Mis datos"
        subtitle="Consulta, rectifica o solicita la eliminación de tu información personal (vista temporal)."
      />
      <p className="gsea-mock-note">Mock · Cumplimiento / ARCO — sin backend</p>
      {msg && <p className="gsea-msg gsea-msg--ok">{msg}</p>}

      <div className="gsea-account-grid">
        <div className="gsea-card gsea-card--section">
          <h2 className="gsea-card__title">
            <Edit3 size={18} /> Acceso y rectificación
          </h2>
          <p className="gsea-config-muted" style={{ marginBottom: '1rem' }}>
            Datos asociados a <strong>{user?.email || 'tu cuenta'}</strong>.
          </p>
          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <li>Nombre y correo de cuenta</li>
            <li>Memberships / roles en workspaces</li>
            <li>Preferencias de perfil</li>
            <li>Registros de actividad (si aplica)</li>
          </ul>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="gsea-btn-primary" onClick={() => simulate('Solicitud de acceso registrada (simulado).')}>
              Solicitar acceso
            </button>
            <button
              type="button"
              className="gsea-legal-btn gsea-legal-btn--ghost"
              onClick={() => simulate('Solicitud de rectificación registrada (simulado).')}
            >
              Solicitar rectificación
            </button>
          </div>
        </div>

        <div className="gsea-card gsea-card--section">
          <h2 className="gsea-card__title">
            <Download size={18} /> Exportar datos
          </h2>
          <p className="gsea-config-muted" style={{ marginBottom: '1rem' }}>
            Descarga una copia de la información de tu cuenta en formato JSON (simulado).
          </p>
          <button
            type="button"
            className="gsea-btn-primary"
            onClick={() => {
              const blob = new Blob(
                [JSON.stringify({ user, exported_at: new Date().toISOString(), note: 'mock' }, null, 2)],
                { type: 'application/json' }
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'gsea-mis-datos-mock.json';
              a.click();
              URL.revokeObjectURL(url);
              simulate('Archivo mock descargado.');
            }}
          >
            Descargar copia
          </button>
        </div>
      </div>

      <div className="gsea-card gsea-card--section gsea-account-danger">
        <h2 className="gsea-card__title">
          <Trash2 size={18} /> Eliminación de cuenta / datos
        </h2>
        <p className="gsea-config-muted" style={{ marginBottom: '1rem' }}>
          Esta acción es irreversible en producción. Aquí solo simulamos el flujo: escribe{' '}
          <strong>ELIMINAR</strong> para habilitar el botón.
        </p>
        <input
          className="gsea-input"
          placeholder="Escribe ELIMINAR"
          value={confirmDelete}
          onChange={(e) => setConfirmDelete(e.target.value)}
        />
        <button
          type="button"
          className="gsea-btn-primary"
          style={{ background: '#dc2626' }}
          disabled={confirmDelete !== 'ELIMINAR'}
          onClick={() => simulate('Solicitud de eliminación enviada (simulado). No se borró nada.')}
        >
          Solicitar eliminación
        </button>
      </div>
    </PageLayout>
  );
}
