import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

import AuthGSEA from './components/AuthGSEA';
import Landing from './components/Landing';
import ProtectedRoute from './components/ProtectedRoute';
import BillingLocked from './components/BillingLocked';
import AcceptInvitation from './components/AcceptInvitation';

import Dashboard from './components/Dashboard';
import Agentes from './components/Agentes';
import Tramites from './components/Tramites';
import Clientes from './components/Clientes';
import SeguimientoCobranza from './components/SeguimientoCobranza';
import SeguimientoPolizas from './components/SeguimientoPolizas';
import Calendario from './components/Calendario';
import Capacitacion from './components/Capacitacion';

import TeamSettings from './components/TeamSettings';
import RolesEditor from './components/RolesEditor';
import BillingSettings from './components/BillingSettings';
import IntegrationsPage from './components/IntegrationsPage';
import ProfileSettings from './components/ProfileSettings';
import MyDataSettings from './components/MyDataSettings';
import SecuritySettings from './components/SecuritySettings';
import { TerminosPage, AvisoPrivacidadPage } from './components/LegalPages';

import './components/css/SaaS.css';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/landing" replace />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/register" element={<AuthGSEA />} />
        <Route path="/login" element={<AuthGSEA />} />
        <Route path="/terminos" element={<TerminosPage />} />
        <Route path="/aviso-privacidad" element={<AvisoPrivacidadPage />} />
        <Route path="/invitacion/:token" element={<AcceptInvitation />} />
        <Route path="/billing-locked" element={<BillingLocked />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/agentes" element={<ProtectedRoute><Agentes /></ProtectedRoute>} />
        <Route path="/tramites" element={<ProtectedRoute><Tramites /></ProtectedRoute>} />
        <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
        <Route path="/seguimiento-cobranza" element={<ProtectedRoute><SeguimientoCobranza /></ProtectedRoute>} />
        <Route path="/seguimiento-polizas" element={<ProtectedRoute><SeguimientoPolizas /></ProtectedRoute>} />
        <Route path="/calendario" element={<ProtectedRoute><Calendario /></ProtectedRoute>} />
        <Route path="/capacitacion" element={<ProtectedRoute><Capacitacion /></ProtectedRoute>} />

        <Route path="/configuracion/perfil" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
        <Route path="/configuracion/seguridad" element={<ProtectedRoute><SecuritySettings /></ProtectedRoute>} />
        <Route path="/configuracion/mis-datos" element={<ProtectedRoute><MyDataSettings /></ProtectedRoute>} />
        <Route path="/configuracion/equipo" element={<ProtectedRoute><TeamSettings /></ProtectedRoute>} />
        <Route path="/configuracion/roles" element={<ProtectedRoute><RolesEditor /></ProtectedRoute>} />
        <Route path="/configuracion/facturacion" element={<ProtectedRoute><BillingSettings /></ProtectedRoute>} />
        <Route path="/integraciones" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/landing" replace />} />
      </Routes>
    </AuthProvider>
  );
}
