import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/images/logo-gsea.png';
import './css/LegalAccount.css';

function LegalShell({ children }) {
  return (
    <div className="gsea-legal-page">
      <header className="gsea-legal-top">
        <Link to="/landing" className="gsea-legal-top__brand">
          <img src={logo} alt="GSEA" />
          GSEA CRM
        </Link>
        <nav className="gsea-legal-top__links">
          <Link to="/terminos">Términos</Link>
          <Link to="/aviso-privacidad">Aviso de privacidad</Link>
          <Link to="/register">Iniciar sesión</Link>
        </nav>
      </header>
      <div className="gsea-legal-wrap">{children}</div>
    </div>
  );
}

export function TerminosPage() {
  return (
    <LegalShell>
      <article className="gsea-legal-card">
        <span className="gsea-legal-badge">Documento temporal · Frontend</span>
        <h1>Términos y condiciones</h1>
        <p className="gsea-legal-meta">Última actualización: 15 de julio de 2026 · Versión mock para revisión legal</p>

        <h2>1. Aceptación</h2>
        <p>
          Al crear una cuenta en GSEA CRM aceptas estos términos. Si no estás de acuerdo, no utilices
          el servicio. Este texto es una plantilla visual; el contenido final lo validará tu área legal.
        </p>

        <h2>2. Descripción del servicio</h2>
        <p>
          GSEA es una plataforma SaaS para gestión de promotorías de seguros: agentes, clientes,
          pólizas, cobranza, calendario y administración de equipo.
        </p>

        <h2>3. Cuentas y acceso</h2>
        <ul>
          <li>Debes proporcionar información veraz al registrarte.</li>
          <li>Eres responsable de la confidencialidad de tu contraseña.</li>
          <li>El acceso puede limitarse si el trial o la suscripción expiran.</li>
        </ul>

        <h2>4. Uso permitido</h2>
        <p>
          Solo puedes usar GSEA para operaciones legítimas de tu promotoría. Queda prohibido el abuso,
          ingeniería inversa no autorizada o el uso que vulnere derechos de terceros.
        </p>

        <h2>5. Datos y confidencialidad</h2>
        <p>
          El tratamiento de datos personales se describe en el Aviso de privacidad. Tú eres responsable
          de los datos de clientes y agentes que cargues en tu workspace.
        </p>

        <h2>6. Suspensión</h2>
        <p>
          Podemos suspender o cancelar el acceso ante incumplimiento, falta de pago o riesgos de
          seguridad.
        </p>

        <h2>7. Contacto</h2>
        <p>Para dudas sobre estos términos: soporte@gsea.mx (placeholder).</p>

        <div className="gsea-legal-footer">
          <Link to="/aviso-privacidad" className="gsea-legal-btn gsea-legal-btn--ghost">
            Ver aviso de privacidad
          </Link>
          <Link to="/register" className="gsea-legal-btn gsea-legal-btn--primary">
            Volver al registro
          </Link>
        </div>
      </article>
    </LegalShell>
  );
}

export function AvisoPrivacidadPage() {
  return (
    <LegalShell>
      <article className="gsea-legal-card">
        <span className="gsea-legal-badge">Documento temporal · Frontend</span>
        <h1>Aviso de privacidad</h1>
        <p className="gsea-legal-meta">Última actualización: 15 de julio de 2026 · Versión mock (LFPDPPP)</p>

        <h2>1. Responsable</h2>
        <p>
          GSEA CRM (razón social placeholder) es responsable del tratamiento de los datos personales
          recabados a través de la plataforma.
        </p>

        <h2>2. Datos que recabamos</h2>
        <ul>
          <li>Identificación y contacto: nombre, correo, teléfono.</li>
          <li>Datos de cuenta: workspace, rol, preferencias.</li>
          <li>Datos operativos que tú capturas: agentes, contratantes, pólizas.</li>
          <li>Datos técnicos: IP, dispositivo y registros de acceso (si aplica).</li>
        </ul>

        <h2>3. Finalidades</h2>
        <ul>
          <li>Crear y administrar tu cuenta y suscripción.</li>
          <li>Prestar el servicio CRM y soporte.</li>
          <li>Cumplir obligaciones legales y de seguridad.</li>
          <li>Mejorar el producto (analítica agregada, sin venta de datos).</li>
        </ul>

        <h2>4. Derechos ARCO</h2>
        <p>
          Puedes solicitar Acceso, Rectificación, Cancelación u Oposición desde Configuración → Mis
          datos (pantalla mock) o enviando un correo a privacidad@gsea.mx (placeholder).
        </p>

        <h2>5. Transferencias</h2>
        <p>
          Podemos usar proveedores de infraestructura (hosting, correo, pagos) bajo contratos de
          confidencialidad. No vendemos tu información personal.
        </p>

        <h2>6. Conservación</h2>
        <p>
          Conservamos los datos mientras tu cuenta esté activa y el tiempo adicional que exija la ley
          o la defensa de reclamos.
        </p>

        <div className="gsea-legal-footer">
          <Link to="/terminos" className="gsea-legal-btn gsea-legal-btn--ghost">
            Ver términos y condiciones
          </Link>
          <Link to="/register" className="gsea-legal-btn gsea-legal-btn--primary">
            Volver al registro
          </Link>
        </div>
      </article>
    </LegalShell>
  );
}
