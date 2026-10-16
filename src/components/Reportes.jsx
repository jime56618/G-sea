import React from 'react';
import { Link } from 'react-router-dom';
import logoGSEA from '../assets/images/logo-gsea.png';
import './css/Reportes.css';

/** Dashboard público Metabase (sin borde ni título → más espacio útil). */
export const METABASE_PUBLIC_DASHBOARD_URL =
  import.meta.env.VITE_METABASE_DASHBOARD_URL ||
  'https://ultra-remora.metabaseapp.com/public/dashboard/b0b3759d-92b9-467c-93ee-1c8c64a5b4ee#bordered=false&titled=false';

/**
 * Ruta pública /reportes — no requiere login.
 * Header G-SEA + iframe a todo el ancho / alto restante.
 */
export default function Reportes() {
  return (
    <div className="gsea-reportes">
      <header className="gsea-reportes__header">
        <div className="gsea-reportes__brand">
          <img src={logoGSEA} alt="G-SEA" className="gsea-reportes__logo" />
          <div>
            <p className="gsea-reportes__eyebrow">Analítica</p>
            <h1 className="gsea-reportes__title">Reportes G-SEA</h1>
          </div>
        </div>
        <Link to="/landing" className="gsea-reportes__link">
          Ir al inicio
        </Link>
      </header>

      <div className="gsea-reportes__frame-wrap">
        <iframe
          src={METABASE_PUBLIC_DASHBOARD_URL}
          title="Dashboard G-SEA"
          className="gsea-reportes__iframe"
          allowFullScreen
        />
      </div>
    </div>
  );
}
