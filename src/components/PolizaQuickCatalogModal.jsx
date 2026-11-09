import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Search,
  Plus,
  AlertCircle,
  Loader2,
  Check,
  Building2,
  User,
  Shield,
  Tag,
  Folders,
} from 'lucide-react';
import { apiFetch } from '../utils/apiClient';

/**
 * Normaliza una cadena para comparaciones insensibles a mayúsculas, acentos y espacios.
 */
function normalizeStr(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Componente modal de nivel superior para:
 * 1. Buscar y seleccionar registros existentes (para los 5 catálogos).
 * 2. Registro rápido con validación de duplicados (autorizado para Contratantes y Agentes con permisos).
 */
export default function PolizaQuickCatalogModal({
  isOpen,
  mode = 'search', // 'search' | 'create'
  catalogType, // 'contratante' | 'agente' | 'aseguradora' | 'ramo' | 'subramo'
  initialData = {},
  catalogos = {},
  selectedAseguradoraId = '',
  selectedRamoId = '',
  canManageContratantes = false,
  canManageAgentes = false,
  onSelect,
  onClose,
}) {
  const [currentMode, setCurrentMode] = useState(mode);
  const [searchTerm, setSearchTerm] = useState('');
  const [serverList, setServerList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState('');

  // Estados para creación rápida
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const searchInputRef = useRef(null);

  // Formulario Contratante
  const [contratanteForm, setContratanteForm] = useState({
    nombre: '',
    rfc: '',
    telefono: '',
    email: '',
    direccion: '',
  });

  // Formulario Agente
  const [agenteForm, setAgenteForm] = useState({
    cedula: '',
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    aseguradora_id: '',
    clave_agente: '',
  });

  // Reset y precarga cuando se abre el modal
  useEffect(() => {
    if (!isOpen) return;
    setCurrentMode(mode);
    setSearchTerm('');
    setFormError('');
    setDuplicateWarning(null);
    setListError('');

    // Precarga para Contratante
    if (catalogType === 'contratante') {
      setContratanteForm({
        nombre: initialData?.nombre || '',
        rfc: initialData?.rfc || '',
        telefono: initialData?.telefono || '',
        email: initialData?.email || '',
        direccion: initialData?.direccion || '',
      });
    }

    // Precarga para Agente
    if (catalogType === 'agente') {
      setAgenteForm({
        cedula: '',
        nombre: initialData?.nombre || '',
        apellido: '',
        email: initialData?.email || '',
        telefono: initialData?.telefono || '',
        aseguradora_id: selectedAseguradoraId ? String(selectedAseguradoraId) : '',
        clave_agente: initialData?.clave_agente || '',
      });
    }
  }, [isOpen, mode, catalogType, initialData, selectedAseguradoraId]);

  // Consulta en tiempo real de registros frescos desde el servidor para búsqueda y detección de duplicados
  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const fetchServerData = async () => {
      setLoadingList(true);
      setListError('');
      try {
        let endpoint = '';
        if (catalogType === 'contratante') endpoint = '/contratantes?per_page=500';
        else if (catalogType === 'agente') endpoint = '/agentes_workspace?per_page=500';
        else if (catalogType === 'aseguradora') endpoint = '/aseguradoras?per_page=500';
        else if (catalogType === 'ramo') endpoint = '/ramos?per_page=500';
        else if (catalogType === 'subramo') {
          endpoint = selectedRamoId
            ? `/subramos?ramo_id=${selectedRamoId}&per_page=500`
            : '/subramos?per_page=500';
        }

        if (endpoint) {
          const res = await apiFetch(endpoint);
          if (active) {
            setServerList(res.data || []);
          }
        }
      } catch {
        if (active) {
          // Fallback a los catálogos en memoria si la red falla
          const fallback =
            catalogType === 'contratante'
              ? catalogos.contratantes
              : catalogType === 'agente'
              ? catalogos.agentesWorkspace
              : catalogType === 'aseguradora'
              ? catalogos.aseguradoras
              : catalogType === 'ramo'
              ? catalogos.ramos
              : catalogos.subramos;
          setServerList(fallback || []);
          setListError('No se pudo sincronizar la lista completa del servidor; mostrando catálogo local.');
        }
      } finally {
        if (active) setLoadingList(false);
      }
    };

    fetchServerData();
    return () => {
      active = false;
    };
  }, [isOpen, catalogType, selectedRamoId, catalogos]);

  // Foco automático en el input de búsqueda
  useEffect(() => {
    if (isOpen && currentMode === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [isOpen, currentMode]);

  // Filtrado reactivo en búsqueda
  const filteredList = useMemo(() => {
    const term = normalizeStr(searchTerm);
    if (!term) return serverList;

    return serverList.filter((item) => {
      if (catalogType === 'contratante') {
        return (
          normalizeStr(item.nombre).includes(term) ||
          normalizeStr(item.rfc).includes(term) ||
          normalizeStr(item.email).includes(term) ||
          normalizeStr(item.telefono).includes(term)
        );
      }
      if (catalogType === 'agente') {
        const ag = item.agente || {};
        const nom = `${ag.nombre || ''} ${ag.apellido || ''}`;
        const matchClaves = (item.claves_aseguradora || []).some(
          (c) =>
            normalizeStr(c.clave_agente).includes(term) ||
            normalizeStr(c.aseguradora?.nombre).includes(term)
        );
        return (
          normalizeStr(nom).includes(term) ||
          normalizeStr(ag.cedula).includes(term) ||
          normalizeStr(ag.rfc).includes(term) ||
          matchClaves
        );
      }
      if (catalogType === 'aseguradora' || catalogType === 'ramo') {
        return normalizeStr(item.nombre).includes(term);
      }
      if (catalogType === 'subramo') {
        return (
          normalizeStr(item.nombre).includes(term) ||
          normalizeStr(item.ramo?.nombre).includes(term)
        );
      }
      return false;
    });
  }, [serverList, searchTerm, catalogType]);

  if (!isOpen) return null;

  const getTitle = () => {
    const isSearch = currentMode === 'search';
    switch (catalogType) {
      case 'contratante':
        return isSearch ? 'Buscar Contratante' : 'Nuevo Contratante';
      case 'agente':
        return isSearch ? 'Buscar Agente' : 'Nuevo Agente';
      case 'aseguradora':
        return 'Buscar Aseguradora';
      case 'ramo':
        return 'Buscar Ramo';
      case 'subramo':
        return 'Buscar Subramo';
      default:
        return 'Catálogo';
    }
  };

  const getIcon = () => {
    switch (catalogType) {
      case 'contratante':
        return <Building2 size={20} className="polizas-quick-icon" />;
      case 'agente':
        return <User size={20} className="polizas-quick-icon" />;
      case 'aseguradora':
        return <Shield size={20} className="polizas-quick-icon" />;
      case 'ramo':
        return <Folders size={20} className="polizas-quick-icon" />;
      case 'subramo':
        return <Tag size={20} className="polizas-quick-icon" />;
      default:
        return <Search size={20} className="polizas-quick-icon" />;
    }
  };

  // Guardar Contratante con verificación de duplicados en el servidor
  const handleSaveContratante = async (forceSave = false) => {
    setFormError('');
    if (!contratanteForm.nombre.trim()) {
      setFormError('El nombre o razón social es obligatorio.');
      return;
    }

    // Verificación preventiva de duplicados contra registros del servidor
    if (!forceSave) {
      const normName = normalizeStr(contratanteForm.nombre);
      const normRfc = normalizeStr(contratanteForm.rfc);

      const existingDup = serverList.find((c) => {
        const cName = normalizeStr(c.nombre);
        const cRfc = normalizeStr(c.rfc);
        if (normRfc && cRfc && normRfc === cRfc) return true;
        if (normName && cName && normName === cName) return true;
        return false;
      });

      if (existingDup) {
        setDuplicateWarning({
          message: `Ya existe un contratante con datos coincidentes: "${existingDup.nombre}" ${
            existingDup.rfc ? `(RFC: ${existingDup.rfc})` : ''
          }.`,
          item: existingDup,
        });
        return;
      }
    }

    setSaving(true);
    setDuplicateWarning(null);
    try {
      const payload = {
        nombre: contratanteForm.nombre.trim(),
        rfc: contratanteForm.rfc.trim() || null,
        telefono: contratanteForm.telefono.trim() || null,
        email: contratanteForm.email.trim() || null,
        direccion: contratanteForm.direccion.trim() || null,
      };

      const res = await apiFetch('/contratantes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const item = res?.data || res;
      onSelect('contratante', item);
      onClose();
    } catch (err) {
      const msg = err.body?.message || err.message || 'Error al guardar el contratante.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Guardar Agente con verificación de duplicados y asociación atómica
  const handleSaveAgente = async (forceSave = false) => {
    setFormError('');
    if (!agenteForm.cedula.trim()) {
      setFormError('La cédula profesional es obligatoria.');
      return;
    }
    if (!agenteForm.nombre.trim()) {
      setFormError('El nombre del agente es obligatorio.');
      return;
    }

    // Verificación preventiva de duplicados en el servidor
    if (!forceSave) {
      const normCedula = normalizeStr(agenteForm.cedula);
      const normNombre = normalizeStr(`${agenteForm.nombre} ${agenteForm.apellido}`);

      const existingDup = serverList.find((aw) => {
        const ag = aw.agente || {};
        const cCed = normalizeStr(ag.cedula);
        const cNom = normalizeStr(`${ag.nombre || ''} ${ag.apellido || ''}`);
        if (normCedula && cCed && normCedula === cCed) return true;
        if (normNombre && cNom && normNombre === cNom) return true;
        return false;
      });

      if (existingDup) {
        const ag = existingDup.agente || {};
        setDuplicateWarning({
          message: `Ya existe un agente registrado en tu promotoría con datos coincidentes: "${ag.nombre} ${
            ag.apellido || ''
          }" (Cédula: ${ag.cedula || 'N/A'}).`,
          item: existingDup,
        });
        return;
      }
    }

    setSaving(true);
    setDuplicateWarning(null);
    try {
      const payload = {
        status: 'activo',
        agente: {
          cedula: agenteForm.cedula.trim(),
          nombre: agenteForm.nombre.trim(),
          apellido: agenteForm.apellido.trim() || null,
          email: agenteForm.email.trim() || null,
          telefono: agenteForm.telefono.trim() || null,
        },
      };

      if (agenteForm.aseguradora_id && agenteForm.clave_agente.trim()) {
        payload.claves = [
          {
            aseguradora_id: Number(agenteForm.aseguradora_id),
            clave_agente: agenteForm.clave_agente.trim(),
          },
        ];
      }

      const res = await apiFetch('/agentes_workspace', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const item = res?.data || res;
      onSelect('agente', item);
      onClose();
    } catch (err) {
      const msg = err.body?.message || err.message || 'Error al registrar el agente.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const canCreateCurrent =
    (catalogType === 'contratante' && canManageContratantes) ||
    (catalogType === 'agente' && canManageAgentes);

  return (
    <div className="polizas-quick-catalog-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="polizas-quick-catalog-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="polizas-quick-catalog-header">
          <div className="polizas-quick-catalog-title-wrapper">
            {getIcon()}
            <div>
              <h3 className="polizas-quick-catalog-title">{getTitle()}</h3>
              <p className="polizas-quick-catalog-subtitle">
                {currentMode === 'search'
                  ? 'Busca en los registros de la plataforma y selecciona para asociar'
                  : 'Registra la entidad detectada por Gemini sin salir de la póliza'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="polizas-modal-close" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {listError && (
          <div className="polizas-quick-alert-warning" role="alert">
            <AlertCircle size={15} />
            <span>{listError}</span>
          </div>
        )}

        {/* MODO BÚSQUEDA */}
        {currentMode === 'search' && (
          <div className="polizas-quick-search-section">
            <div className="polizas-quick-search-box">
              <Search size={16} className="polizas-quick-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="polizas-quick-search-input"
                placeholder={
                  catalogType === 'contratante'
                    ? 'Buscar por nombre, RFC o correo…'
                    : catalogType === 'agente'
                    ? 'Buscar por nombre, cédula o clave…'
                    : catalogType === 'subramo'
                    ? 'Buscar subramo…'
                    : 'Buscar por nombre…'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="polizas-quick-search-clear"
                  onClick={() => setSearchTerm('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {loadingList ? (
              <div className="polizas-quick-loading">
                <Loader2 size={24} className="polizas-ai-spinner" />
                <span>Cargando catálogo…</span>
              </div>
            ) : filteredList.length > 0 ? (
              <div className="polizas-quick-results-list">
                {filteredList.map((item) => {
                  let mainText = '';
                  let subText = '';
                  let badge = '';

                  if (catalogType === 'contratante') {
                    mainText = item.nombre;
                    subText = item.email || item.telefono || item.direccion || '';
                    badge = item.rfc ? `RFC: ${item.rfc}` : null;
                  } else if (catalogType === 'agente') {
                    const ag = item.agente || {};
                    mainText = `${ag.nombre || ''} ${ag.apellido || ''}`.trim() || 'Agente sin nombre';
                    const claveMatch = (item.claves_aseguradora || []).find(
                      (c) => String(c.aseguradora_id) === String(selectedAseguradoraId)
                    );
                    subText = claveMatch
                      ? `Clave: ${claveMatch.clave_agente} (${claveMatch.aseguradora?.nombre || 'Aseguradora'})`
                      : ag.email || ag.telefono || '';
                    badge = ag.cedula ? `Cédula: ${ag.cedula}` : `#${item.id}`;
                  } else if (catalogType === 'aseguradora' || catalogType === 'ramo') {
                    mainText = item.nombre;
                    badge = `#${item.id}`;
                  } else if (catalogType === 'subramo') {
                    mainText = item.nombre;
                    subText = item.ramo ? `Ramo: ${item.ramo.nombre}` : '';
                    badge = `#${item.id}`;
                  }

                  return (
                    <div
                      key={item.id}
                      className="polizas-quick-item"
                      onClick={() => {
                        onSelect(catalogType, item);
                        onClose();
                      }}
                    >
                      <div className="polizas-quick-item-info">
                        <span className="polizas-quick-item-title">{mainText}</span>
                        {subText && <span className="polizas-quick-item-sub">{subText}</span>}
                      </div>
                      <div className="polizas-quick-item-actions">
                        {badge && <span className="polizas-quick-badge">{badge}</span>}
                        <button type="button" className="polizas-quick-btn-select">
                          <Check size={14} /> Seleccionar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="polizas-quick-empty">
                <AlertCircle size={28} className="polizas-quick-empty-icon" />
                <p className="polizas-quick-empty-text">
                  No se encontraron resultados para «<strong>{searchTerm}</strong>».
                </p>
                {canCreateCurrent ? (
                  <button
                    type="button"
                    className="polizas-quick-btn-primary"
                    onClick={() => {
                      if (catalogType === 'contratante') {
                        setContratanteForm((prev) => ({
                          ...prev,
                          nombre: searchTerm || prev.nombre,
                        }));
                      } else if (catalogType === 'agente') {
                        setAgenteForm((prev) => ({
                          ...prev,
                          nombre: searchTerm || prev.nombre,
                        }));
                      }
                      setCurrentMode('create');
                    }}
                  >
                    <Plus size={16} /> Agregar nuevo registro
                  </button>
                ) : (
                  <p className="polizas-quick-empty-hint">
                    {['aseguradora', 'ramo', 'subramo'].includes(catalogType)
                      ? 'Este catálogo es compartido globalmente en la plataforma. Si requieres uno nuevo, solicítalo al área de administración.'
                      : 'No cuentas con los permisos requeridos para dar de alta registros en este catálogo.'}
                  </p>
                )}
              </div>
            )}

            {canCreateCurrent && filteredList.length > 0 && (
              <div className="polizas-quick-footer-switch">
                <span>¿No está en la lista?</span>
                <button
                  type="button"
                  className="polizas-quick-btn-link"
                  onClick={() => setCurrentMode('create')}
                >
                  <Plus size={14} /> Registrar como nuevo
                </button>
              </div>
            )}
          </div>
        )}

        {/* MODO CREACIÓN RÁPIDA (CONTRATANTE O AGENTE) */}
        {currentMode === 'create' && canCreateCurrent && (
          <div className="polizas-quick-create-section">
            {formError && (
              <div className="polizas-ai-alert-error" role="alert">
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            {/* Advertencia preventiva de duplicados */}
            {duplicateWarning && (
              <div className="polizas-quick-duplicate-banner" role="alert">
                <div className="polizas-quick-duplicate-header">
                  <AlertCircle size={18} className="polizas-quick-duplicate-icon" />
                  <strong>Posible duplicado detectado</strong>
                </div>
                <p className="polizas-quick-duplicate-message">{duplicateWarning.message}</p>
                <div className="polizas-quick-duplicate-actions">
                  <button
                    type="button"
                    className="polizas-quick-btn-select-existing"
                    onClick={() => {
                      onSelect(catalogType, duplicateWarning.item);
                      onClose();
                    }}
                  >
                    <Check size={14} /> Seleccionar el existente
                  </button>
                  <button
                    type="button"
                    className="polizas-quick-btn-continue"
                    onClick={() => {
                      if (catalogType === 'contratante') handleSaveContratante(true);
                      else if (catalogType === 'agente') handleSaveAgente(true);
                    }}
                  >
                    Crear de todos modos
                  </button>
                </div>
              </div>
            )}

            {/* Formulario Contratante */}
            {catalogType === 'contratante' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveContratante(false);
                }}
                className="polizas-quick-form"
              >
                <div className="polizas-form-group">
                  <label>Nombre o razón social *</label>
                  <input
                    type="text"
                    required
                    value={contratanteForm.nombre}
                    onChange={(e) =>
                      setContratanteForm({ ...contratanteForm, nombre: e.target.value })
                    }
                    placeholder="Ej: Asegurado Demo S.A. de C.V."
                  />
                </div>

                <div className="polizas-form-row">
                  <div className="polizas-form-group">
                    <label>RFC (opcional)</label>
                    <input
                      type="text"
                      maxLength={13}
                      value={contratanteForm.rfc}
                      onChange={(e) =>
                        setContratanteForm({
                          ...contratanteForm,
                          rfc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                        })
                      }
                      placeholder="EDF010101AAA"
                    />
                  </div>
                  <div className="polizas-form-group">
                    <label>Teléfono (opcional)</label>
                    <input
                      type="text"
                      value={contratanteForm.telefono}
                      onChange={(e) =>
                        setContratanteForm({ ...contratanteForm, telefono: e.target.value })
                      }
                      placeholder="5500001122"
                    />
                  </div>
                </div>

                <div className="polizas-form-group">
                  <label>Correo electrónico (opcional)</label>
                  <input
                    type="email"
                    value={contratanteForm.email}
                    onChange={(e) =>
                      setContratanteForm({ ...contratanteForm, email: e.target.value })
                    }
                    placeholder="contacto@empresa.com"
                  />
                </div>

                <div className="polizas-form-group">
                  <label>Dirección (opcional)</label>
                  <input
                    type="text"
                    value={contratanteForm.direccion}
                    onChange={(e) =>
                      setContratanteForm({ ...contratanteForm, direccion: e.target.value })
                    }
                    placeholder="Calle, número, colonia, ciudad"
                  />
                </div>

                <div className="polizas-quick-actions">
                  <button
                    type="button"
                    onClick={() => setCurrentMode('search')}
                    className="polizas-btn-cancel"
                    disabled={saving}
                  >
                    Volver a búsqueda
                  </button>
                  <button
                    type="submit"
                    className="polizas-btn-submit"
                    disabled={saving}
                  >
                    {saving ? 'Guardando…' : 'Guardar y Asociar'}
                  </button>
                </div>
              </form>
            )}

            {/* Formulario Agente */}
            {catalogType === 'agente' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveAgente(false);
                }}
                className="polizas-quick-form"
              >
                <div className="polizas-form-row">
                  <div className="polizas-form-group">
                    <label>Cédula profesional / Clave CNSF *</label>
                    <input
                      type="text"
                      required
                      value={agenteForm.cedula}
                      onChange={(e) =>
                        setAgenteForm({ ...agenteForm, cedula: e.target.value })
                      }
                      placeholder="Ej: A1234567"
                    />
                  </div>
                  <div className="polizas-form-group">
                    <label>Nombre(s) *</label>
                    <input
                      type="text"
                      required
                      value={agenteForm.nombre}
                      onChange={(e) =>
                        setAgenteForm({ ...agenteForm, nombre: e.target.value })
                      }
                      placeholder="Nombre del agente"
                    />
                  </div>
                </div>

                <div className="polizas-form-row">
                  <div className="polizas-form-group">
                    <label>Apellidos (opcional)</label>
                    <input
                      type="text"
                      value={agenteForm.apellido}
                      onChange={(e) =>
                        setAgenteForm({ ...agenteForm, apellido: e.target.value })
                      }
                      placeholder="Apellidos"
                    />
                  </div>
                  <div className="polizas-form-group">
                    <label>Teléfono (opcional)</label>
                    <input
                      type="text"
                      value={agenteForm.telefono}
                      onChange={(e) =>
                        setAgenteForm({ ...agenteForm, telefono: e.target.value })
                      }
                      placeholder="Teléfono"
                    />
                  </div>
                </div>

                <div className="polizas-form-group">
                  <label>Correo electrónico (opcional)</label>
                  <input
                    type="email"
                    value={agenteForm.email}
                    onChange={(e) =>
                      setAgenteForm({ ...agenteForm, email: e.target.value })
                    }
                    placeholder="agente@correo.com"
                  />
                </div>

                {/* Relación con Aseguradora y Clave de Agente */}
                <div className="polizas-quick-agent-rel">
                  <p className="polizas-quick-agent-rel-title">
                    Vincular clave para la aseguradora de la póliza
                  </p>
                  <div className="polizas-form-row">
                    <div className="polizas-form-group">
                      <label>Aseguradora</label>
                      <select
                        value={agenteForm.aseguradora_id}
                        onChange={(e) =>
                          setAgenteForm({ ...agenteForm, aseguradora_id: e.target.value })
                        }
                      >
                        <option value="">Selecciona aseguradora…</option>
                        {(catalogos.aseguradoras || []).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="polizas-form-group">
                      <label>Clave de agente (opcional)</label>
                      <input
                        type="text"
                        value={agenteForm.clave_agente}
                        onChange={(e) =>
                          setAgenteForm({ ...agenteForm, clave_agente: e.target.value })
                        }
                        placeholder="Ej: CLV-09882"
                      />
                    </div>
                  </div>
                </div>

                <div className="polizas-quick-actions">
                  <button
                    type="button"
                    onClick={() => setCurrentMode('search')}
                    className="polizas-btn-cancel"
                    disabled={saving}
                  >
                    Volver a búsqueda
                  </button>
                  <button
                    type="submit"
                    className="polizas-btn-submit"
                    disabled={saving}
                  >
                    {saving ? 'Guardando…' : 'Registrar y Asociar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
