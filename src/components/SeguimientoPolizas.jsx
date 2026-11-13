import { useRecordExport } from '../utils/useRecordExport';
import RecordExportTools, { RecordPageCheckbox, RecordRowCheckbox } from './RecordExportTools';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { createPortal } from 'react-dom';
import { apiFetch } from '../utils/apiClient';
import {
  Plus,
  FileText,
  Edit2,
  Trash2,
  Search,
  UploadCloud,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Filter,
  MoreVertical,
  Eye,
  Download,
  Copy,
  Sparkles,
  Loader2,
} from 'lucide-react';

import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import './css/SeguimientoPolizas.css';
import { readModuleCache, writeModuleCache } from '../utils/moduleCache';
import PolizaQuickCatalogModal from './PolizaQuickCatalogModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const POLIZAS_CACHE_KEY = 'polizas_list';
const CATALOGOS_CACHE_KEY = 'polizas_catalogos';

function authHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...authHeaders(), ...options.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.message ||
      (data.errors && Object.values(data.errors).flat().join(' ')) ||
      `Error HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/** Vigencia mostrada = fin de vigencia (como tu mock). Estatus derivado de fechas (no hay campo en BD). */
function mapPolizaFromApi(p) {
  const fin = p.fin_vigencia?.slice(0, 10);
  const inicio = p.inicio_vigencia?.slice(0, 10);
  const estatus = computeEstatus(inicio, fin);
  return {
    id: p.id,
    raw: p,
    numero: p.numero_poliza,
    aseguradora: p.aseguradora?.nombre || '—',
    contratante: p.contratante?.nombre || '—',
    vigencia: fin,
    inicio_vigencia: inicio,
    fin_vigencia: fin,
    estatus,
    aseguradora_id: p.aseguradora_id,
    contratante_id: p.contratante_id,
    agente_id: p.agente_id,
    ramo_id: p.ramo_id,
    subramo_id: p.subramo_id,
  };
}

function computeEstatus(inicioStr, finStr) {
  if (!finStr || !inicioStr) return 'No Vigente';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const fin = new Date(finStr);
  const inicio = new Date(inicioStr);
  fin.setHours(0, 0, 0, 0);
  inicio.setHours(0, 0, 0, 0);
  if (now >= inicio && now <= fin) return 'Vigente';
  return 'No Vigente';
}

const MENU_W = 180;
const MENU_H = 140;
const MENU_GAP = 8;
const SAFE_PADDING = 12;

const emptyForm = () => ({
  contratante_id: '',
  aseguradora_id: '',
  ramo_id: '',
  subramo_id: '',
  agente_id: '',
  numero_poliza: '',
  poliza_anterior_id: '',
  fecha_emision: '',
  inicio_vigencia: '',
  fin_vigencia: '',
  prima_neta: '',
  iva: '',
  prima_total: '',
  moneda: 'MXN',
  frecuencia_cobro: 'unico',
  monto_cuota: '',
  telefono_notificacion: '',
});

const IVA_RATE = 0.16;

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return (Math.round(n * 100) / 100).toFixed(2);
}

function divisorFrecuencia(frecuencia) {
  switch (String(frecuencia || '').toLowerCase()) {
    case 'mensual':
      return 12;
    case 'trimestral':
      return 4;
    case 'semestral':
      return 2;
    case 'anual':
    case 'unico':
    default:
      return 1;
  }
}

/**
 * Recalcula IVA, prima total y monto cuota.
 * Si `options.fromPdf` trae iva/prima_total/monto_cuota (aunque sea 0), se respetan
 * y no se fuerza el 16%.
 */
function applyPremiumCalc(prev, patch = {}, options = {}) {
  const next = { ...prev, ...patch };
  const netaRaw = next.prima_neta;
  const neta = netaRaw === '' || netaRaw == null ? NaN : Number(netaRaw);

  if (!Number.isFinite(neta) || neta < 0) {
    return {
      ...next,
      iva: '',
      prima_total: '',
      monto_cuota: '',
    };
  }

  const fromPdf = options.fromPdf || {};
  const hasPdfIva = fromPdf.iva !== undefined && fromPdf.iva !== null && fromPdf.iva !== '';
  const hasPdfTotal =
    fromPdf.prima_total !== undefined && fromPdf.prima_total !== null && fromPdf.prima_total !== '';
  const hasPdfCuota =
    fromPdf.monto_cuota !== undefined && fromPdf.monto_cuota !== null && fromPdf.monto_cuota !== '';

  const iva = hasPdfIva ? Number(fromPdf.iva) : neta * IVA_RATE;
  const total = hasPdfTotal ? Number(fromPdf.prima_total) : neta + iva;
  const divisor = divisorFrecuencia(next.frecuencia_cobro);
  const cuota = hasPdfCuota ? Number(fromPdf.monto_cuota) : total / divisor;

  return {
    ...next,
    iva: roundMoney(iva),
    prima_total: roundMoney(total),
    monto_cuota: roundMoney(cuota),
  };
}

async function requestPdfAiExtraction(file) {
  if (!file) throw new Error('No se ha seleccionado ningún archivo.');
  const isPdf = (file.type && file.type === 'application/pdf') || file.name?.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    throw new Error('El archivo seleccionado no es un documento PDF válido.');
  }
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_SIZE) {
    throw new Error('El archivo supera el tamaño máximo permitido de 10 MB.');
  }

  const formData = new FormData();
  formData.append('pdf', file);

  try {
    return await apiFetch('/polizas/extract-pdf', {
      method: 'POST',
      body: formData,
    });
  } catch (err) {
    const body = err.body || {};
    const code = body.code || '';

    if (code === 'pdf_password_protected') {
      throw new Error(
        'La póliza está protegida con contraseña. Remueve la contraseña del PDF antes de subirlo.'
      );
    }
    if (code === 'invalid_pdf' || code === 'invalid_pdf_header' || code === 'invalid_pdf_type' || code === 'pdf_parse_error') {
      throw new Error('El archivo no es un documento PDF válido o está dañado.');
    }
    if (code === 'invalid_pdf_size') {
      throw new Error('El archivo PDF supera el tamaño máximo permitido de 10 MB.');
    }
    if (code === 'unreadable_pdf_text') {
      throw new Error(
        'El archivo PDF no contiene texto suficiente ni legible para ser procesado por la IA.'
      );
    }
    if (code === 'gemini_rate_limit') {
      throw new Error(
        'El servicio de IA ha alcanzado su límite de consultas por minuto. Espera unos segundos y vuelve a intentarlo.'
      );
    }
    if (code === 'gemini_timeout') {
      throw new Error(
        'Se agotó el tiempo de espera al procesar la póliza con IA. Intenta con un archivo más ligero o de menos páginas.'
      );
    }
    if (code === 'gemini_connection_error') {
      throw new Error(
        'No se pudo conectar con el servicio de IA de Google. Verifica la conexión a internet o inténtalo más tarde.'
      );
    }
    if (code === 'gemini_not_configured' || code === 'gemini_auth_error') {
      throw new Error(
        'El servicio de análisis con IA no está configurado correctamente en el servidor.'
      );
    }
    if (code === 'gemini_service_unavailable') {
      throw new Error(
        'El servicio de Google Gemini no se encuentra disponible en este momento. Inténtalo más tarde.'
      );
    }
    if (code === 'gemini_http_error') {
      throw new Error(
        'Ocurrió un error al comunicarse con el servicio de IA. Inténtalo nuevamente.'
      );
    }
    if (code === 'gemini_invalid_json' || code === 'gemini_empty_response') {
      throw new Error(
        'La IA no pudo interpretar los datos de esta carátula. Revisa que el documento corresponda a una póliza de seguros válida.'
      );
    }
    if (code === 'gemini_safety_block') {
      throw new Error(
        'El documento no pudo ser analizado debido a restricciones de seguridad del servicio de IA.'
      );
    }

    throw new Error(body.message || err.message || 'Error al procesar la póliza con IA.');
  }
}

function mapAiFormData(aiForm, catalogos) {
  const rawNeta = aiForm.prima_neta != null ? String(aiForm.prima_neta) : '';
  const rawFreq = aiForm.frecuencia_cobro || 'unico';

  // Respeta IVA / total / cuota del PDF (incluye IVA = 0). Solo calcula 16% si el PDF no trae IVA.
  const base = applyPremiumCalc(
    {
      contratante_id: '',
      aseguradora_id: '',
      ramo_id: '',
      subramo_id: '',
      agente_id: '',
      numero_poliza: aiForm.numero_poliza || '',
      poliza_anterior_id: '',
      fecha_emision: aiForm.fecha_emision ? aiForm.fecha_emision.slice(0, 10) : '',
      inicio_vigencia: aiForm.inicio_vigencia ? aiForm.inicio_vigencia.slice(0, 10) : '',
      fin_vigencia: aiForm.fin_vigencia ? aiForm.fin_vigencia.slice(0, 10) : '',
      prima_neta: rawNeta,
      moneda: aiForm.moneda || 'MXN',
      frecuencia_cobro: rawFreq,
      telefono_notificacion: aiForm.telefono_notificacion || '',
    },
    { prima_neta: rawNeta, frecuencia_cobro: rawFreq },
    {
      fromPdf: {
        iva: aiForm.iva,
        prima_total: aiForm.prima_total,
        monto_cuota: aiForm.monto_cuota,
      },
    }
  );

  if (aiForm.contratante_id && catalogos.contratantes?.some((c) => String(c.id) === String(aiForm.contratante_id))) {
    base.contratante_id = String(aiForm.contratante_id);
  }

  if (aiForm.aseguradora_id && catalogos.aseguradoras?.some((a) => String(a.id) === String(aiForm.aseguradora_id))) {
    base.aseguradora_id = String(aiForm.aseguradora_id);
  }

  // Confiar en IDs del backend (pueden ser ramo/subramo recién creados por el extractor)
  if (aiForm.ramo_id) {
    base.ramo_id = String(aiForm.ramo_id);
  }

  if (aiForm.subramo_id) {
    base.subramo_id = String(aiForm.subramo_id);
  }

  if (aiForm.agente_id && catalogos.agentesWorkspace?.some((aw) => String(aw.id) === String(aiForm.agente_id))) {
    base.agente_id = String(aiForm.agente_id);
  }

  return base;
}

function mapAiDetalles(aiDetalles = {}) {
  const v = aiDetalles.vehiculo || {};
  const gm = aiDetalles.gastos_medicos || {};
  const vi = aiDetalles.viaje || {};

  return {
    vehiculo: {
      marca: v.marca ?? '',
      modelo: v.modelo ?? '',
      anio: v.anio != null ? String(v.anio) : '',
      serie: v.serie ?? '',
      placas: v.placas ?? '',
      motor: v.motor ?? '',
      pasajeros: v.pasajeros != null ? String(v.pasajeros) : '',
    },
    gastos_medicos: {
      nombre_plan: gm.nombre_plan ?? '',
      nivel_hospitalario: gm.nivel_hospitalario ?? '',
      suma_asegurada: gm.suma_asegurada != null ? String(gm.suma_asegurada) : '',
      suma_asegurada_texto: gm.suma_asegurada_texto ?? '',
      deducible: gm.deducible != null ? String(gm.deducible) : '',
      deducible_texto: gm.deducible_texto ?? '',
      coaseguro_porcentaje: gm.coaseguro_porcentaje != null ? String(gm.coaseguro_porcentaje) : '',
      tope_coaseguro: gm.tope_coaseguro != null ? String(gm.tope_coaseguro) : '',
      observaciones: gm.observaciones ?? '',
    },
    viaje: {
      nombre_plan: vi.nombre_plan ?? '',
      origen: vi.origen ?? '',
      destino: vi.destino ?? '',
      fecha_inicio_viaje: vi.fecha_inicio_viaje ?? '',
      fecha_fin_viaje: vi.fecha_fin_viaje ?? '',
      observaciones: vi.observaciones ?? '',
    },
    asegurados: Array.isArray(aiDetalles.asegurados)
      ? aiDetalles.asegurados.map((a) => ({
          nombre: a.nombre ?? '',
          fecha_nacimiento: a.fecha_nacimiento ?? '',
          sexo: a.sexo ?? '',
          parentesco: a.parentesco ?? '',
          rfc: a.rfc ?? '',
          curp: a.curp ?? '',
          antiguedad: a.antiguedad ?? '',
          titular: a.titular != null ? a.titular : '',
        }))
      : [],
    beneficiarios: Array.isArray(aiDetalles.beneficiarios)
      ? aiDetalles.beneficiarios.map((b) => ({
          nombre: b.nombre ?? '',
          parentesco: b.parentesco ?? '',
          porcentaje: b.porcentaje != null ? String(b.porcentaje) : '',
          fecha_nacimiento: b.fecha_nacimiento ?? '',
        }))
      : [],
    coberturas: Array.isArray(aiDetalles.coberturas)
      ? aiDetalles.coberturas.map((c) => ({
          nombre: c.nombre ?? '',
          clave: c.clave ?? '',
          suma_asegurada: c.suma_asegurada != null ? String(c.suma_asegurada) : '',
          suma_asegurada_texto: c.suma_asegurada_texto ?? '',
          deducible: c.deducible != null ? String(c.deducible) : '',
          deducible_texto: c.deducible_texto ?? '',
          coaseguro_porcentaje: c.coaseguro_porcentaje != null ? String(c.coaseguro_porcentaje) : '',
          prima: c.prima != null ? String(c.prima) : '',
          moneda: c.moneda ?? '',
          observaciones: c.observaciones ?? '',
        }))
      : [],
  };
}

function collectAiWarnings(aiResult, computedForm) {
  const warnings = [...(aiResult.warnings || [])];
  const detected = aiResult.detected || {};
  const aiForm = aiResult.form_data || {};

  if (!computedForm.contratante_id && detected.contratante?.nombre) {
    const msg = `Contratante detectado («${detected.contratante.nombre}»): no coincidió exactamente. Selecciónalo en la lista o regístralo si es nuevo.`;
    if (!warnings.some((w) => w.includes(detected.contratante.nombre))) {
      warnings.push(msg);
    }
  }

  if (!computedForm.aseguradora_id && detected.aseguradora_nombre) {
    const msg = `Aseguradora detectada («${detected.aseguradora_nombre}»): selecciónala manualmente del catálogo.`;
    if (!warnings.some((w) => w.includes(detected.aseguradora_nombre))) {
      warnings.push(msg);
    }
  }

  if (!computedForm.agente_id && detected.agente?.nombre) {
    const msg = `Agente detectado («${detected.agente.nombre}»): asígnalo manualmente si corresponde a un agente de tu promotoría.`;
    if (!warnings.some((w) => w.includes(detected.agente.nombre))) {
      warnings.push(msg);
    }
  }

  // Ya no avisamos IVA/total "calculado vs PDF": el form respeta los del PDF.

  return warnings;
}

const SeguimientoPolizas = () => {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const cachedPolizas = useMemo(() => readModuleCache(POLIZAS_CACHE_KEY), []);
  const [polizas, setPolizas] = useState(() => (Array.isArray(cachedPolizas) ? cachedPolizas : []));
  const [loading, setLoading] = useState(!cachedPolizas);
  const [listError, setListError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const [filterEstatus, setFilterEstatus] = useState('Todos');
  const [dashboardAlertFilter, setDashboardAlertFilter] = useState(() => (
    location.state?.alertFilter === 'vencidas' ? 'vencidas' : null
  ));
  const { can } = useAuth();
  useEffect(() => {
    if (location.state?.dashboardCreate) {
      const remainingState = { ...location.state };
      delete remainingState.dashboardCreate;
      navigate(location.pathname + location.search + location.hash, { replace: true, state: remainingState });
    }
  }, [location, navigate]);

  useEffect(() => {
    if (location.state?.alertFilter !== 'vencidas') return;
    setFilterEstatus('No Vigente');
    setDashboardAlertFilter('vencidas');
    navigate(location.pathname + location.search + location.hash, {
      replace: true,
      state: null,
    });
  }, [location, navigate]);
  const [modalType, setModalType] = useState(() => location.state?.dashboardCreate && can('polizas.manage') && can('polizas.view') ? 'add' : null);
  const [selectedPoliza, setSelectedPoliza] = useState(null);
  const [aiExtractionResult, setAiExtractionResult] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [activeMenuId, setActiveMenuId] = useState(null);
  const menuRef = useRef(null);

  const cachedCatalogos = useMemo(() => readModuleCache(CATALOGOS_CACHE_KEY), []);
  const [catalogos, setCatalogos] = useState(
    () =>
      cachedCatalogos || {
        contratantes: [],
        aseguradoras: [],
        ramos: [],
        subramos: [],
        agentesWorkspace: [],
      }
  );
  const [catalogosReady, setCatalogosReady] = useState(Boolean(cachedCatalogos?.contratantes));
  const [renovacionDisponible, setRenovacionDisponible] = useState(false);
  const catalogosAltaRevalidados = useRef(false);
  const catalogosEdicionRevalidados = useRef(null);

  const loadCatalogos = useCallback(async () => {
    const [contratantes, aseguradoras, ramos, subramos, agentesWorkspace] = await Promise.all([
      fetchJson(`${API_URL}/contratantes?per_page=500`).then((j) => j.data || []),
      fetchJson(`${API_URL}/aseguradoras?per_page=200`).then((j) => j.data || []),
      fetchJson(`${API_URL}/ramos?per_page=200`).then((j) => j.data || []),
      fetchJson(`${API_URL}/subramos?per_page=500`).then((j) => j.data || []),
      fetchJson(`${API_URL}/agentes_workspace?per_page=500`).then((j) => j.data || []),
    ]);
    const next = { contratantes, aseguradoras, ramos, subramos, agentesWorkspace };
    setCatalogos(next);
    writeModuleCache(CATALOGOS_CACHE_KEY, next);
    setCatalogosReady(true);
  }, []);

  const handleClearAiData = useCallback(() => {
    setAiExtractionResult(null);
  }, []);

  const handleAiExtractedFromUpload = useCallback((result) => {
    setAiExtractionResult(result);
    setSelectedPoliza(null);
    setModalType('add');
  }, []);

  const handleUpdateCatalogos = useCallback((catType, item) => {
    setCatalogos((prev) => {
      const next = { ...prev };
      if (catType === 'contratante') {
        if (!next.contratantes.some((c) => c.id === item.id)) {
          next.contratantes = [item, ...next.contratantes];
        }
      } else if (catType === 'agente') {
        if (!next.agentesWorkspace.some((a) => a.id === item.id)) {
          next.agentesWorkspace = [item, ...next.agentesWorkspace];
        }
      } else if (catType === 'aseguradora') {
        if (!next.aseguradoras.some((a) => a.id === item.id)) {
          next.aseguradoras = [item, ...next.aseguradoras];
        }
      } else if (catType === 'ramo') {
        if (!next.ramos.some((r) => r.id === item.id)) {
          next.ramos = [item, ...next.ramos];
        }
      } else if (catType === 'subramo') {
        if (!next.subramos.some((s) => s.id === item.id)) {
          next.subramos = [item, ...next.subramos];
        }
      }
      writeModuleCache(CATALOGOS_CACHE_KEY, next);
      return next;
    });
    loadCatalogos().catch(() => {});
  }, [loadCatalogos]);

  const loadPolizas = useCallback(async () => {
    if (!cachedPolizas) setLoading(true);
    setListError('');
    try {
      const json = await fetchJson(`${API_URL}/polizas?per_page=200`);
      const rows = (json.data || []).map(mapPolizaFromApi);
      setRenovacionDisponible(json.renovacion_disponible === true);
      setPolizas(rows);
      writeModuleCache(POLIZAS_CACHE_KEY, rows);
    } catch (e) {
      setListError(e.message || 'Error al cargar pólizas');
      if (!cachedPolizas) setPolizas([]);
    } finally {
      setLoading(false);
    }
  }, [cachedPolizas]);

  useEffect(() => {
    loadPolizas();
  }, [loadPolizas]);

  useEffect(() => {
    if (modalType !== 'edit') catalogosEdicionRevalidados.current = null;
    if (modalType === 'edit') {
      if (catalogosEdicionRevalidados.current !== selectedPoliza?.id) {
        catalogosEdicionRevalidados.current = selectedPoliza?.id;
        loadCatalogos().catch(() => {});
      }
      return;
    }
    if (modalType === 'add' || modalType === 'upload') {
      if (!catalogosAltaRevalidados.current) {
        catalogosAltaRevalidados.current = true;
        loadCatalogos().catch(() => {});
      }
      return;
    }
    catalogosAltaRevalidados.current = false;
    if (!modalType || modalType === 'delete') return;
    if (catalogosReady && catalogos.contratantes?.length) return;
    loadCatalogos().catch(() => {});
  }, [modalType, selectedPoliza?.id, catalogosReady, catalogos.contratantes?.length, loadCatalogos]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPolizas = useMemo(() => {
    return polizas.filter((p) => {
      const matchesSearch =
        !searchTerm ||
        p.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.contratante.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.aseguradora.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = dashboardAlertFilter === 'vencidas'
        ? Boolean(p.fin_vigencia && new Date(`${p.fin_vigencia}T00:00:00`) < new Date(new Date().toDateString()))
        : filterEstatus === 'Todos' || p.estatus === filterEstatus;
      return matchesSearch && matchesFilter;
    });
  }, [polizas, searchTerm, filterEstatus, dashboardAlertFilter]);

  const totalPages = Math.ceil(filteredPolizas.length / itemsPerPage) || 1;

  const paginatedPolizas = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredPolizas.slice(start, start + itemsPerPage);
  }, [filteredPolizas, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  const getStatusConfig = (estatus) => {
    return estatus === 'Vigente'
      ? {
          class: 'polizas-status-vigente',
          dot: 'polizas-dot-vigente',
          label: 'Vigente',
        }
      : {
          class: 'polizas-status-no-vigente',
          dot: 'polizas-dot-no-vigente',
          label: 'No Vigente',
        };
  };

  const handleMenuClick = (e, polizaId) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + MENU_GAP,
      left: rect.right - MENU_W,
    });
    setActiveMenuId((prev) => (prev === polizaId ? null : polizaId));
  };

  const showSuccess = (message) => {
    setSuccessMsg(message);
    window.clearTimeout(showSuccess._t);
    showSuccess._t = window.setTimeout(() => setSuccessMsg(''), 3500);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPoliza?.id) return;
    try {
      await fetch(`${API_URL}/polizas/${selectedPoliza.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }).then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.message || `Error ${res.status}`);
        }
      });
      setModalType(null);
      setSelectedPoliza(null);
      setActiveMenuId(null);
      await loadPolizas();
      showSuccess('Póliza eliminada correctamente.');
    } catch (e) {
      alert(e.message || 'No se pudo eliminar');
    }
  };

  const exportToday = new Date();
  const exportDate = [exportToday.getFullYear(), String(exportToday.getMonth() + 1).padStart(2, '0'), String(exportToday.getDate()).padStart(2, '0')].join('-');
  const exportController = useRecordExport('polizas', { q: searchTerm, estatus: filterEstatus, vencidas: dashboardAlertFilter === 'vencidas', hoy: exportDate, tz_offset: exportToday.getTimezoneOffset() }, paginatedPolizas.map(item => item.id), loading);

  return (
    <div className="polizas-container">
      <Sidebar onExpand={setIsSidebarExpanded} />

      <div
        className={`polizas-main-content ${
          isSidebarExpanded ? 'polizas-sidebar-expanded' : 'polizas-sidebar-collapsed'
        }`}
      >
        <Navbar />

        <main className="polizas-main">
          {successMsg && (
            <div className="polizas-toast-success" role="status">
              {successMsg}
            </div>
          )}
          <div className="polizas-header">
            <div className="polizas-header-left">
              <h1 className="polizas-title">Seguimiento de Pólizas</h1>
            </div>

            <div className="polizas-header-actions">
              <RecordExportTools controller={exportController} buttonClass="polizas-btn-upload" />
              <button
                type="button"
                onClick={() => {
                  setSelectedPoliza(null);
                  setModalType('add');
                }}
                className="polizas-btn-add"
              >
                <Plus size={18} />
                <span>Agregar Póliza</span>
              </button>
              <button type="button" onClick={() => setModalType('upload')} className="polizas-btn-upload">
                <UploadCloud size={18} />
                <span>Subir Documento</span>
              </button>
            </div>
          </div>

          {listError && (
            <p className="gsea-auth-error" style={{ margin: '0 0 1rem' }}>
              {listError}
            </p>
          )}
          {loading && <p style={{ marginBottom: '1rem' }}>Cargando pólizas…</p>}

          <div className="polizas-search-section">
            <div className="polizas-search-wrapper">
              <Search className="polizas-search-icon" size={18} />
              <input
                type="text"
                placeholder="Buscar por número, contratante o aseguradora..."
                className="polizas-search-input"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className="polizas-filter-wrapper">
              <label className="polizas-filter-label">
                <Filter size={16} />
                <span>Filtrar por:</span>
              </label>
              <select
                className="polizas-filter-select-visible"
                onChange={(e) => {
                  setFilterEstatus(e.target.value);
                  setDashboardAlertFilter(null);
                  setCurrentPage(1);
                }}
                value={filterEstatus}
              >
                <option value="Todos">Todos los estados</option>
                <option value="Vigente">Vigente</option>
                <option value="No Vigente">No Vigente</option>
              </select>
            </div>
          </div>
          <div className="polizas-table-container">
            <div className="polizas-table-wrapper">
              <table className="polizas-table">
                <thead>
                  <tr>

                    <th style={{ position: 'relative' }}><RecordPageCheckbox controller={exportController} />Número de Póliza</th>
                    <th>Aseguradora</th>
                    <th>Contratante</th>
                    <th className="text-center">Archivo</th>
                    <th>Vigencia (fin)</th>
                    <th>Estatus</th>
                    <th className="text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPolizas.map((poliza, index) => {
                    const statusConfig = getStatusConfig(poliza.estatus);
                    return (
                      <tr
                        key={poliza.id}
                        className="polizas-row"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <td style={{ position: "relative" }} className="polizas-cell polizas-cell-numero">
                        <RecordRowCheckbox controller={exportController} id={poliza.id} />
                          <span className="polizas-badge">{poliza.numero}</span>
                        </td>
                        <td className="polizas-cell polizas-cell-aseguradora">
                          <span className="polizas-aseguradora">{poliza.aseguradora}</span>
                        </td>
                        <td className="polizas-cell polizas-cell-contratante">
                          <span className="polizas-contratante">{poliza.contratante}</span>
                        </td>
                        <td className="polizas-cell polizas-cell-file text-center">
                          <button type="button" className="polizas-file-btn" title="Documentos (API: poliza_documentos)">
                            <FileText size={16} />
                          </button>
                        </td>
                        <td className="polizas-cell polizas-cell-vigencia">
                          <div className="polizas-vigencia">
                            <span>
                              {poliza.vigencia
                                ? new Date(poliza.vigencia).toLocaleDateString('es-MX', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                  })
                                : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="polizas-cell polizas-cell-status">
                          <div className={`polizas-status ${statusConfig.class}`}>
                            <span className={`polizas-status-dot ${statusConfig.dot}`} />
                            <span className="polizas-status-label">{statusConfig.label}</span>
                          </div>
                        </td>
                        <td className="polizas-cell polizas-cell-actions">
                          <div className="polizas-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPoliza(poliza);
                                setModalType('edit');
                              }}
                              className="polizas-action polizas-action-edit"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPoliza(poliza);
                                setModalType('delete');
                              }}
                              className="polizas-action polizas-action-delete"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                            <button
                              type="button"
                              className="polizas-menu-button"
                              onClick={(e) => handleMenuClick(e, poliza.id)}
                              title="Más opciones"
                            >
                              <MoreVertical size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="polizas-pagination polizas-pagination-new">
              <div className="polizas-pagination-info">
                Mostrando <span className="polizas-pagination-highlight">{paginatedPolizas.length}</span> de{' '}
                <span className="polizas-pagination-highlight">{filteredPolizas.length}</span> registros
              </div>

              <div className="polizas-pagination-options">
                <label className="polizas-page-size">
                  <span>Registros por página</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  >
                    {[5, 10, 20, 50].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="polizas-pagination-right polizas-pagination-right-inline">
                  <button
                    type="button"
                    className="polizas-pagination-arrowSolo"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    aria-label="Página anterior"
                    title="Anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <label className="polizas-page-picker">
                    <span>Página</span>
                    <select
                      value={currentPage}
                      onChange={(e) => setCurrentPage(Number(e.target.value))}
                    >
                      {Array.from({ length: totalPages }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1}
                        </option>
                      ))}
                    </select>
                    <span>de {totalPages}</span>
                  </label>

                  <button
                    type="button"
                    className="polizas-pagination-arrowSolo"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || filteredPolizas.length === 0}
                    aria-label="Página siguiente"
                    title="Siguiente"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {activeMenuId &&
        createPortal(
          <FloatingMenu
            refEl={menuRef}
            top={menuPosition.top}
            left={menuPosition.left}
            onClose={() => setActiveMenuId(null)}
          />,
          document.body
        )}

      {modalType && (
        <ModalManager
          renovacionDisponible={renovacionDisponible}
          polizas={polizas}
          type={modalType}
          data={selectedPoliza}
          catalogos={catalogos}
          onUpdateCatalogos={handleUpdateCatalogos}
          initialAiData={aiExtractionResult}
          onClearAiData={handleClearAiData}
          onAiExtractedFromUpload={handleAiExtractedFromUpload}
          onClose={() => {
            setModalType(null);
            setSelectedPoliza(null);
            setAiExtractionResult(null);
          }}
          onSaved={(kind) => {
            setModalType(null);
            setSelectedPoliza(null);
            setAiExtractionResult(null);
            loadPolizas();
            showSuccess(
              kind === 'edit'
                ? 'Póliza actualizada correctamente.'
                : 'Póliza guardada correctamente.'
            );
          }}
          onDeleteConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
};

const FloatingMenu = ({ refEl, top, left, onClose }) => {
  const maxLeft = window.innerWidth - MENU_W - SAFE_PADDING;
  const maxTop = window.innerHeight - MENU_H - SAFE_PADDING;
  const safeLeft = Math.max(SAFE_PADDING, Math.min(left, maxLeft));
  const safeTop = Math.max(SAFE_PADDING, Math.min(top, maxTop));

  return (
    <div
      ref={refEl}
      className="polizas-floating-menu polizas-floating-menu-portal"
      style={{
        position: 'fixed',
        top: safeTop,
        left: safeLeft,
        zIndex: 99999,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="polizas-floating-menu-items">
        <button type="button" className="polizas-floating-menu-item" onClick={onClose}>
          <Eye size={14} /> Ver detalles
        </button>
        <button type="button" className="polizas-floating-menu-item" onClick={onClose}>
          <Download size={14} /> Descargar
        </button>
        <button type="button" className="polizas-floating-menu-item" onClick={onClose}>
          <Copy size={14} /> Duplicar
        </button>
      </div>
    </div>
  );
};

function agentesFiltradosPorAseguradora(agentesWorkspace, aseguradoraId) {
  if (!aseguradoraId) return agentesWorkspace;
  const aid = Number(aseguradoraId);
  return agentesWorkspace.filter((aw) =>
    (aw.claves_aseguradora || []).some((c) => Number(c.aseguradora_id) === aid)
  );
}

// Campos adicionales del alta. Las claves corresponden al contrato de Laravel.
const detalleFields = {
  vehiculo: [
    ['marca', 'Marca'], ['modelo', 'Modelo'], ['anio', 'Año', 'number', 1900, 2100, 1],
    ['serie', 'Serie'], ['placas', 'Placas', 'text', 50], ['motor', 'Motor'],
    ['pasajeros', 'Pasajeros', 'number', 0, undefined, 1],
  ],
  asegurados: [
    ['nombre', 'Nombre *'], ['fecha_nacimiento', 'Fecha de nacimiento', 'date'],
    ['sexo', 'Sexo', 'text', 30], ['parentesco', 'Parentesco', 'text', 100],
    ['rfc', 'RFC', 'text', 20], ['curp', 'CURP', 'text', 20],
    ['antiguedad', 'Antigüedad', 'date'], ['titular', 'Titular', 'boolean'],
  ],
  beneficiarios: [
    ['nombre', 'Nombre *'], ['parentesco', 'Parentesco', 'text', 100],
    ['porcentaje', 'Porcentaje', 'number', 0, 100],
    ['fecha_nacimiento', 'Fecha de nacimiento', 'date'],
  ],
  coberturas: [
    ['nombre', 'Nombre *'], ['clave', 'Clave', 'text', 100],
    ['suma_asegurada', 'Suma asegurada', 'number', 0], ['suma_asegurada_texto', 'Suma asegurada (texto)'],
    ['deducible', 'Deducible', 'number', 0], ['deducible_texto', 'Deducible (texto)'],
    ['coaseguro_porcentaje', 'Coaseguro (%)', 'number', 0, 100], ['prima', 'Prima de cobertura', 'number', 0],
    ['moneda', 'Moneda', 'text', 10], ['observaciones', 'Observaciones', 'text', null],
  ],
  gastos_medicos: [
    ['nombre_plan', 'Plan'], ['nivel_hospitalario', 'Nivel hospitalario'],
    ['suma_asegurada', 'Suma asegurada', 'number', 0], ['suma_asegurada_texto', 'Suma asegurada (texto)'],
    ['deducible', 'Deducible', 'number', 0], ['deducible_texto', 'Deducible (texto)'],
    ['coaseguro_porcentaje', 'Coaseguro (%)', 'number', 0, 100],
    ['tope_coaseguro', 'Tope de coaseguro', 'number', 0], ['observaciones', 'Observaciones', 'text', null],
  ],
  viaje: [
    ['nombre_plan', 'Plan'], ['origen', 'Origen'], ['destino', 'Destino'],
    ['fecha_inicio_viaje', 'Inicio del viaje', 'date'], ['fecha_fin_viaje', 'Fin del viaje', 'date'],
    ['observaciones', 'Observaciones', 'text', null],
  ],
};

const emptyDetalles = () => ({ vehiculo: {}, gastos_medicos: {}, viaje: {}, asegurados: [], beneficiarios: [], coberturas: [] });

function tipoPolizaAlta(formData, catalogos) {
  const ramo = catalogos.ramos.find((r) => String(r.id) === String(formData.ramo_id));
  const subramo = catalogos.subramos.find((s) => String(s.id) === String(formData.subramo_id));
  if (subramo && String(subramo.ramo_id) !== String(formData.ramo_id)) return null;
  const nombre = (subramo?.nombre || ramo?.nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  // Coincidencias explícitas: VEHÍCULOS y ACCIDENTES Y ENFERMEDADES son demasiado generales.
  if (nombre === 'automoviles') return 'auto';
  if (nombre === 'motocicletas') return 'moto';
  if (nombre === 'vida') return 'vida';
  if (nombre === 'danos empresariales') return 'danos';
  if (['gastos medicos', 'gastos medicos mayores'].includes(nombre)) return 'medicos';
  if (nombre === 'accidentes personales') return 'accidentes';
  if (['viajes', 'seguro de viaje', 'seguro de viajes'].includes(nombre)) return 'viaje';
  return null;
}

function fieldsPorTipo(group, tipo) {
  const keys = tipo === 'moto' && group === 'vehiculo'
    ? ['marca', 'modelo', 'anio', 'serie', 'placas', 'motor']
    : tipo === 'vida' && group === 'asegurados'
      ? ['nombre', 'fecha_nacimiento', 'sexo', 'parentesco', 'rfc', 'curp']
      : tipo === 'vida' && group === 'coberturas'
        ? ['nombre', 'suma_asegurada', 'prima', 'observaciones']
        : tipo === 'danos' && group === 'coberturas'
          ? ['nombre', 'suma_asegurada', 'deducible', 'coaseguro_porcentaje', 'prima', 'observaciones']
          : null;
  return keys ? detalleFields[group].filter(([key]) => keys.includes(key)) : detalleFields[group];
}

function buildDetallesPayload(tipo, detalles) {
  const groups = ['auto', 'moto'].includes(tipo) ? ['vehiculo', 'coberturas']
    : tipo === 'medicos' ? ['gastos_medicos', 'asegurados', 'coberturas', 'beneficiarios']
      : ['accidentes', 'vida'].includes(tipo) ? ['asegurados', 'beneficiarios', 'coberturas']
        : tipo === 'viaje' ? ['viaje', 'asegurados', 'beneficiarios', 'coberturas']
          : tipo === 'danos' ? ['coberturas'] : [];
  const clean = (group, item) => {
    const result = {};
    for (const [key, , fieldType] of fieldsPorTipo(group, tipo)) {
      const raw = item[key];
      const value = typeof raw === 'string' ? raw.trim() : raw;
      if (value === '' || value == null) continue;
      if (fieldType === 'number') {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error('Revisa los importes de los datos adicionales.');
        result[key] = number;
      } else result[key] = value;
    }
    return result;
  };
  const payload = {};
  for (const group of groups) {
    if (Array.isArray(detalles[group])) {
      const rows = detalles[group].map((item) => clean(group, item));
      if (rows.some((row) => !row.nombre)) throw new Error('Captura el nombre de cada asegurado, beneficiario y cobertura agregados.');
      if (rows.length) payload[group] = rows;
    } else {
      const item = clean(group, detalles[group]);
      if (Object.keys(item).length) payload[group] = item;
    }
  }
  return payload;
}

const detalleRelations = { vehiculo: 'vehiculo', asegurados: 'asegurados', beneficiarios: 'beneficiarios', coberturas: 'coberturas', gastos_medicos: 'gastos_medicos', viaje: 'viaje' };

function relacionesCompletas(poliza) {
  return Boolean(poliza) && Object.values(detalleRelations).every((key) => Object.hasOwn(poliza, key));
}

function precargarDetalles(poliza) {
  const result = emptyDetalles();
  for (const [group, relation] of Object.entries(detalleRelations)) {
    const fields = [...detalleFields[group]];
    if (group === 'coberturas') fields.push(['orden', '', 'number']);
    if (group === 'beneficiarios') fields.push(['asegurado_id', '', 'number']);
    const normalize = (row) => Object.fromEntries(fields.filter(([key]) => Object.hasOwn(row, key)).map(([key, , fieldType]) => {
      const raw = row[key];
      const value = raw == null ? null : fieldType === 'date' ? String(raw).slice(0, 10)
        : fieldType === 'number' ? Number(raw) : fieldType === 'boolean' ? Boolean(Number(raw)) : raw;
      return [key, value];
    }));
    result[group] = Array.isArray(result[group]) ? (poliza[relation] || []).map(normalize) : normalize(poliza[relation] || {});
  }
  return result;
}

function buildDetallesEdicion(detalles, originales) {
  const payload = {};
  for (const group of Object.keys(detalleRelations)) {
    if (JSON.stringify(detalles[group]) === JSON.stringify(originales[group])) continue;
    if (group === 'asegurados' && originales.beneficiarios.some((row) => row.asegurado_id != null)) {
      throw new Error('No se pueden modificar asegurados con beneficiarios vinculados: se perderían sus asociaciones.');
    }
    // Conserva todos los campos validados, también los que no aparecen en este subramo.
    const fields = [...detalleFields[group]];
    if (group === 'coberturas') fields.push(['orden', '', 'number']);
    if (group === 'beneficiarios') fields.push(['asegurado_id', '', 'number']);
    const clean = (row) => Object.fromEntries(fields.filter(([key]) => Object.hasOwn(row, key)).map(([key, , fieldType]) => {
      const raw = row[key];
      const value = typeof raw === 'string' ? raw.trim() : raw;
      if (fieldType === 'number' && value !== '' && value != null && !Number.isFinite(Number(value))) throw new Error('Revisa los importes de los datos adicionales.');
      return [key, value === '' || value == null ? null : fieldType === 'number' ? Number(value) : value];
    }));
    const value = Array.isArray(detalles[group]) ? detalles[group].map(clean) : clean(detalles[group]);
    if (Array.isArray(value) && value.some((row) => !row.nombre)) throw new Error('Captura el nombre de cada asegurado, beneficiario y cobertura agregados.');
    if (group === 'vehiculo' && Object.entries(value).some(([key, v]) => v === null && originales.vehiculo[key] != null)) {
      throw new Error('El backend no permite vaciar campos existentes del vehículo. Captura un valor válido.');
    }
    payload[group] = value;
  }
  return payload;
}

function DetalleInputs({ group, tipo, value, onChange, disabled = false }) {
  return fieldsPorTipo(group, tipo).map(([key, label, fieldType = 'text', min, max, step]) => (
    <div className="polizas-form-group" key={key}>
      <label>{label}</label>
      {fieldType === 'boolean' ? (
        <select disabled={disabled} value={value[key] == null ? '' : String(value[key])} onChange={(e) => onChange(key, e.target.value === '' ? '' : e.target.value === 'true')}>
          <option value="">Selecciona…</option><option value="true">Sí</option><option value="false">No</option>
        </select>
      ) : (
        <input
          type={fieldType}
          disabled={disabled}
          value={value[key] ?? ''}
          required={key === 'nombre'}
          maxLength={fieldType === 'text' ? (min === null ? undefined : min ?? 255) : undefined}
          min={fieldType === 'number' ? min : key === 'fecha_fin_viaje' ? value.fecha_inicio_viaje || undefined : undefined}
          max={fieldType === 'number' ? max : undefined}
          step={fieldType === 'number' ? step ?? '0.01' : undefined}
          onChange={(e) => onChange(key, e.target.value)}
        />
      )}
    </div>
  ));
}

const ModalManager = ({
  type,
  data,
  catalogos,
  onUpdateCatalogos,
  renovacionDisponible,
  polizas = [],
  initialAiData,
  onClearAiData,
  onAiExtractedFromUpload,
  onClose,
  onSaved,
  onDeleteConfirm,
}) => {
  const { can } = useAuth();
  const isEdit = type === 'edit';
  const isDrawer = type === 'add' || type === 'edit';
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [formData, setFormData] = useState(() => emptyForm());
  const [detalles, setDetalles] = useState(emptyDetalles);
  const [cargaDetalles, setCargaDetalles] = useState({ id: null, originales: null, error: '' });
  const detallesListos = !isEdit || (cargaDetalles.id === data?.id && Boolean(cargaDetalles.originales));
  const aseguradosProtegidos = isEdit && Boolean(cargaDetalles.originales?.beneficiarios.some((row) => row.asegurado_id != null));
  const tipoAlta = isDrawer ? tipoPolizaAlta(formData, catalogos) : null;

  // Estados y referencias para IA y Subida
  const skipDetallesResetRef = useRef(false);
  const drawerFileInputRef = useRef(null);
  const uploadInputRef = useRef(null);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [drawerAiError, setDrawerAiError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [aiWarnings, setAiWarnings] = useState([]);
  const [aiDetectedData, setAiDetectedData] = useState(() => initialAiData?.detected || null);

  // Estado para modal de búsqueda / registro rápido de catálogos
  const [quickCatalog, setQuickCatalog] = useState({
    isOpen: false,
    mode: 'search',
    catalogType: 'contratante',
    initialData: {},
  });

  const handleOpenQuickCatalog = useCallback((catType, m = 'search', customData = null) => {
    let data = customData;
    if (!data && aiDetectedData) {
      if (catType === 'contratante') data = aiDetectedData.contratante;
      else if (catType === 'agente') data = aiDetectedData.agente;
      else if (catType === 'aseguradora') data = { nombre: aiDetectedData.aseguradora_nombre };
      else if (catType === 'ramo') data = { nombre: aiDetectedData.ramo_nombre };
      else if (catType === 'subramo') data = { nombre: aiDetectedData.subramo_nombre };
    }
    setQuickCatalog({
      isOpen: true,
      mode: m,
      catalogType: catType,
      initialData: data || {},
    });
  }, [aiDetectedData]);

  /**
   * Un clic: crea el contratante con lo detectado en el PDF y lo selecciona.
   * Si falla (duplicado / validación), abre el modal precargado.
   */
  const handleRegisterContratanteFromAi = useCallback(async () => {
    const c = aiDetectedData?.contratante;
    if (!c?.nombre?.trim()) {
      handleOpenQuickCatalog('contratante', 'create', c || {});
      return;
    }

    const nombre = String(c.nombre).trim();
    // Si ya existe en el catálogo local, solo selecciónalo
    const existing = (catalogos.contratantes || []).find(
      (x) => String(x.nombre || '').trim().toLowerCase() === nombre.toLowerCase()
    );
    if (existing) {
      if (onUpdateCatalogos) onUpdateCatalogos('contratante', existing);
      setFormData((prev) => ({ ...prev, contratante_id: String(existing.id) }));
      setAiWarnings((prev) => prev.filter((w) => !w.toLowerCase().includes('contratante')));
      return;
    }

    setDrawerAiError('');
    try {
      const res = await apiFetch('/contratantes', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          rfc: c.rfc || null,
          telefono: c.telefono || null,
          email: c.email || null,
          direccion: c.direccion || null,
        }),
      });
      const item = res?.data || res;
      if (onUpdateCatalogos) onUpdateCatalogos('contratante', item);
      setFormData((prev) => ({ ...prev, contratante_id: String(item.id) }));
      setAiWarnings((prev) => prev.filter((w) => !w.toLowerCase().includes('contratante')));
    } catch (ex) {
      setDrawerAiError(ex.message || 'No se pudo registrar el contratante. Complétalo en el formulario.');
      handleOpenQuickCatalog('contratante', 'create', c);
    }
  }, [aiDetectedData, catalogos.contratantes, handleOpenQuickCatalog, onUpdateCatalogos]);

  const handleCatalogItemSelect = useCallback((catType, item) => {
    if (!item) return;

    if (onUpdateCatalogos) {
      onUpdateCatalogos(catType, item);
    }

    if (catType === 'contratante') {
      setFormData((prev) => ({ ...prev, contratante_id: String(item.id) }));
      setAiWarnings((prev) => prev.filter((w) => !w.toLowerCase().includes('contratante')));
    } else if (catType === 'aseguradora') {
      setFormData((prev) => ({ ...prev, aseguradora_id: String(item.id) }));
      setAiWarnings((prev) => prev.filter((w) => !w.toLowerCase().includes('aseguradora')));
    } else if (catType === 'ramo') {
      skipDetallesResetRef.current = true;
      setFormData((prev) => ({ ...prev, ramo_id: String(item.id), subramo_id: '' }));
      setAiWarnings((prev) => prev.filter((w) => !w.toLowerCase().includes('ramo')));
    } else if (catType === 'subramo') {
      skipDetallesResetRef.current = true;
      setFormData((prev) => ({
        ...prev,
        ramo_id: String(item.ramo_id),
        subramo_id: String(item.id),
      }));
      setAiWarnings((prev) => prev.filter((w) => !w.toLowerCase().includes('subramo')));
    } else if (catType === 'agente') {
      setFormData((prev) => ({ ...prev, agente_id: String(item.id) }));
      setAiWarnings((prev) => prev.filter((w) => !w.toLowerCase().includes('agente')));
    }
  }, [onUpdateCatalogos]);

  const applyExtractedAiResult = useCallback((aiResult) => {
    skipDetallesResetRef.current = true;
    const matches = aiResult.matches || {};
    // Si el backend creó ramo/subramo nuevo, mételos al catálogo local para el select
    if (matches.ramo?.id && onUpdateCatalogos) {
      onUpdateCatalogos('ramos', { id: matches.ramo.id, nombre: matches.ramo.nombre });
    }
    if (matches.subramo?.id && matches.ramo?.id && onUpdateCatalogos) {
      onUpdateCatalogos('subramos', {
        id: matches.subramo.id,
        nombre: matches.subramo.nombre,
        ramo_id: matches.ramo.id,
      });
    }
    const newForm = mapAiFormData(aiResult.form_data || {}, catalogos);
    const newDetalles = mapAiDetalles(aiResult.detalles || {});
    setFormData((prev) => ({
      ...prev,
      ...newForm,
      poliza_anterior_id: prev.poliza_anterior_id || '',
    }));
    setDetalles(newDetalles);
    const w = collectAiWarnings(aiResult, newForm);
    setAiWarnings(w);
    setAiDetectedData(aiResult.detected || null);
    setDrawerAiError('');
  }, [catalogos, onUpdateCatalogos]);

  useEffect(() => {
    if (type !== 'edit') return;
    let active = true;
    setCargaDetalles({ id: data?.id, originales: null, error: '' });
    const load = async () => {
      try {
        const poliza = relacionesCompletas(data?.raw) ? data.raw : await fetchJson(`${API_URL}/polizas/${data.id}`);
        if (!relacionesCompletas(poliza)) throw new Error('La API no devolvió todas las relaciones de la póliza.');
        const next = precargarDetalles(poliza);
        if (!active) return;
        setDetalles(next);
        setCargaDetalles({ id: data.id, originales: next, error: '' });
      } catch (error) {
        if (active) setCargaDetalles({ id: data?.id, originales: null, error: error.message || 'No se pudieron cargar los detalles.' });
      }
    };
    load();
    return () => { active = false; };
  }, [type, data]);

  const appliedAiDataRef = useRef(null);
  const initializedEditIdRef = useRef(null);
  const prevRamoRef = useRef(formData.ramo_id);
  const prevSubramoRef = useRef(formData.subramo_id);

  // Evita trasladar información capturada a otro ramo o subramo manualmente, pero respeta la extracción de IA
  useEffect(() => {
    const prevRamo = prevRamoRef.current;
    const prevSubramo = prevSubramoRef.current;
    prevRamoRef.current = formData.ramo_id;
    prevSubramoRef.current = formData.subramo_id;

    if (skipDetallesResetRef.current) {
      skipDetallesResetRef.current = false;
      return;
    }
    // Si no había ramo previo (primera selección o autocompletado), no borrar detalles
    if (!prevRamo) {
      return;
    }
    // Si el ramo no cambió y solo cambió el subramo dentro del mismo ramo, no borrar detalles
    if (prevRamo === formData.ramo_id && prevSubramo !== formData.subramo_id) {
      return;
    }
    // Si hay datos detectados por IA en detalles (vehículo, asegurados, coberturas, etc.), no borrarlos
    const hasAiDetalles =
      (detalles.vehiculo && Object.values(detalles.vehiculo).some(Boolean)) ||
      (detalles.coberturas && detalles.coberturas.length > 0) ||
      (detalles.asegurados && detalles.asegurados.length > 0) ||
      (detalles.viaje && Object.values(detalles.viaje).some(Boolean)) ||
      (detalles.gastos_medicos && Object.values(detalles.gastos_medicos).some(Boolean));
    if (hasAiDetalles && aiDetectedData) {
      return;
    }

    if (type === 'add' && prevRamo !== formData.ramo_id) {
      setDetalles(emptyDetalles());
    }
  }, [type, formData.ramo_id, formData.subramo_id, aiDetectedData, detalles]);

  // Inicialización de datos de edición (solo cuando cambia la póliza seleccionada)
  useEffect(() => {
    if (type === 'edit' && data?.raw && initializedEditIdRef.current !== data.id) {
      initializedEditIdRef.current = data.id;
      const p = data.raw;
      setFormData(
        applyPremiumCalc(
          {
            contratante_id: String(p.contratante_id ?? ''),
            aseguradora_id: String(p.aseguradora_id ?? ''),
            ramo_id: String(p.ramo_id ?? ''),
            subramo_id: String(p.subramo_id ?? ''),
            agente_id: p.agente_id ? String(p.agente_id) : '',
            numero_poliza: p.numero_poliza || '',
            fecha_emision: p.fecha_emision?.slice(0, 10) || '',
            inicio_vigencia: p.inicio_vigencia?.slice(0, 10) || '',
            fin_vigencia: p.fin_vigencia?.slice(0, 10) || '',
            prima_neta: p.prima_neta != null ? String(p.prima_neta) : '',
            iva: p.iva != null ? String(p.iva) : '',
            prima_total: p.prima_total != null ? String(p.prima_total) : '',
            moneda: p.moneda || 'MXN',
            frecuencia_cobro: p.frecuencia_cobro || 'unico',
            monto_cuota: p.monto_cuota != null ? String(p.monto_cuota) : '',
            telefono_notificacion: p.telefono_notificacion || '',
          },
          {},
          {
            fromPdf: {
              iva: p.iva,
              prima_total: p.prima_total,
              monto_cuota: p.monto_cuota,
            },
          }
        )
      );
      setAiWarnings([]);
      setAiDetectedData(null);
    }
  }, [type, data?.id, data?.raw]);

  // Aplicación única de datos de extracción IA en alta (sin reiniciar en re-renders posteriores ni al actualizar catálogos)
  useEffect(() => {
    if (type === 'add' && initialAiData && appliedAiDataRef.current !== initialAiData) {
      appliedAiDataRef.current = initialAiData;
      skipDetallesResetRef.current = true;
      applyExtractedAiResult(initialAiData);
      setAiDetectedData(initialAiData.detected || null);
      if (onClearAiData) onClearAiData();
    }
  }, [type, initialAiData, applyExtractedAiResult, onClearAiData]);

  // Limpieza de mensajes de error al cambiar de tipo de modal
  useEffect(() => {
    setErr('');
    setDrawerAiError('');
    setUploadError('');
  }, [type]);

  const subramosFiltrados = useMemo(() => {
    if (!formData.ramo_id) return catalogos.subramos;
    return catalogos.subramos.filter((s) => String(s.ramo_id) === String(formData.ramo_id));
  }, [catalogos.subramos, formData.ramo_id]);

  const agentesOpciones = useMemo(
    () => agentesFiltradosPorAseguradora(catalogos.agentesWorkspace, formData.aseguradora_id),
    [catalogos.agentesWorkspace, formData.aseguradora_id]
  );

  const buildPayload = () => {
    const payload = {
      contratante_id: Number(formData.contratante_id),
      aseguradora_id: Number(formData.aseguradora_id),
      ramo_id: Number(formData.ramo_id),
      subramo_id: Number(formData.subramo_id),
      numero_poliza: formData.numero_poliza.trim(),
      inicio_vigencia: formData.inicio_vigencia,
      fin_vigencia: formData.fin_vigencia,
      moneda: formData.moneda || 'MXN',
    };
    if (formData.fecha_emision) payload.fecha_emision = formData.fecha_emision;
    if (type === 'add' && renovacionDisponible && formData.poliza_anterior_id) {
      payload.poliza_anterior_id = Number(formData.poliza_anterior_id);
    }
    if (formData.agente_id) payload.agente_id = Number(formData.agente_id);
    if (formData.prima_neta !== '') payload.prima_neta = Number(formData.prima_neta);
    if (formData.iva !== '') payload.iva = Number(formData.iva);
    if (formData.prima_total !== '') payload.prima_total = Number(formData.prima_total);
    if (formData.frecuencia_cobro) payload.frecuencia_cobro = formData.frecuencia_cobro;
    if (formData.monto_cuota !== '') payload.monto_cuota = Number(formData.monto_cuota);
    if (formData.telefono_notificacion.trim())
      payload.telefono_notificacion = formData.telefono_notificacion.trim();
    return payload;
  };

  const handleProcessUploadPdf = async (file) => {
    setUploadError('');
    if (!file) return;
    setAnalyzingAi(true);
    try {
      const res = await requestPdfAiExtraction(file);
      if (onAiExtractedFromUpload) {
        onAiExtractedFromUpload(res);
      }
    } catch (ex) {
      setUploadError(ex.message || 'Error al procesar el archivo.');
    } finally {
      setAnalyzingAi(false);
    }
  };

  const handleDrawerAiFile = async (file) => {
    setDrawerAiError('');
    if (!file) return;

    const hasManualData = Boolean(
      formData.numero_poliza?.trim() ||
      formData.contratante_id ||
      formData.aseguradora_id ||
      formData.ramo_id ||
      formData.prima_neta ||
      (detalles.vehiculo && Object.values(detalles.vehiculo).some(Boolean)) ||
      (detalles.coberturas && detalles.coberturas.length > 0) ||
      (detalles.asegurados && detalles.asegurados.length > 0)
    );

    if (isEdit) {
      const confirmEdit = window.confirm(
        '¿Deseas autocompletar la póliza con los datos extraídos de este PDF? Se actualizarán los campos en pantalla (los cambios no se guardarán en la base de datos hasta hacer clic en "Actualizar").'
      );
      if (!confirmEdit) return;
    } else if (hasManualData) {
      const confirmReplace = window.confirm(
        'El formulario ya contiene información capturada. ¿Deseas reemplazarla con los datos extraídos del PDF?'
      );
      if (!confirmReplace) return;
    }

    setAnalyzingAi(true);
    try {
      const res = await requestPdfAiExtraction(file);
      applyExtractedAiResult(res);
    } catch (ex) {
      setDrawerAiError(ex.message || 'Error al procesar la póliza con IA.');
    } finally {
      setAnalyzingAi(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const payload = buildPayload();
      if (type === 'add') {
        await fetchJson(`${API_URL}/polizas`, {
          method: 'POST',
          body: JSON.stringify({ ...payload, ...buildDetallesPayload(tipoAlta, detalles) }),
        });
      } else if (type === 'edit' && data?.id) {
        if (!detallesListos) throw new Error('Espera a que se carguen correctamente los detalles antes de guardar.');
        await fetchJson(`${API_URL}/polizas/${data.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...payload, ...buildDetallesEdicion(detalles, cargaDetalles.originales) }),
        });
      }
      onSaved(type === 'edit' ? 'edit' : 'add');
    } catch (ex) {
      setErr(ex.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const getModalTitle = () => {
    switch (type) {
      case 'add':
        return 'Nueva Póliza';
      case 'edit':
        return 'Editar Póliza';
      case 'delete':
        return 'Confirmar Eliminación';
      case 'upload':
        return 'Subir Documento';
      default:
        return '';
    }
  };

  return (
    <motion.div
      initial={isDrawer ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={isDrawer ? { opacity: 0 } : undefined}
      transition={isDrawer ? { duration: 0.22, ease: 'easeOut' } : undefined}
      className={`polizas-modal-overlay ${isDrawer ? 'polizas-drawer-overlay' : ''}`}
    >
      <motion.div
        initial={isDrawer ? { x: 56, opacity: 0.96 } : false}
        animate={isDrawer ? { x: 0, opacity: 1 } : undefined}
        exit={isDrawer ? { x: 56, opacity: 0.96 } : undefined}
        transition={isDrawer ? { duration: 0.34, ease: [0.22, 1, 0.36, 1] } : undefined}
        className={`polizas-modal ${type === 'delete' ? 'polizas-modal-delete' : ''} ${
          isDrawer ? 'polizas-drawer-panel' : ''
        }`}
      >
        <div className="polizas-modal-header">
          <h3 className="polizas-modal-title">{getModalTitle()}</h3>
          <button type="button" onClick={onClose} className="polizas-modal-close">
            <X size={20} />
          </button>
        </div>

        <div className="polizas-modal-content">
          {type === 'delete' ? (
            <div className="polizas-delete-content">
              <div className="polizas-delete-warning">
                <AlertCircle size={40} />
              </div>
              <p className="polizas-delete-text">
                ¿Eliminar la póliza <strong>{data?.numero}</strong>?
              </p>
              <p className="polizas-delete-subtext">Esta acción no se puede deshacer.</p>
              <div className="polizas-delete-actions">
                <button type="button" onClick={onDeleteConfirm} className="polizas-btn-delete-confirm">
                  Eliminar
                </button>
                <button type="button" onClick={onClose} className="polizas-btn-delete-cancel">
                  Cancelar
                </button>
              </div>
            </div>
          ) : type === 'upload' ? (
            analyzingAi ? (
              <div className="polizas-ai-loading-container">
                <Loader2 size={44} className="polizas-ai-spinner" />
                <p className="polizas-ai-loading-title">Analizando póliza con inteligencia artificial…</p>
                <p className="polizas-ai-loading-sub">
                  Google Gemini está leyendo la carátula para extraer número de póliza, vigencias, primas, coberturas y datos del bien asegurado.
                </p>
              </div>
            ) : (
              <div className="polizas-upload-content">
                {uploadError && (
                  <div className="polizas-ai-alert-error" role="alert">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertCircle size={18} />
                      <span>{uploadError}</span>
                    </div>
                    <button
                      type="button"
                      className="polizas-ai-alert-close"
                      onClick={() => setUploadError('')}
                      aria-label="Cerrar error"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div
                  className={`polizas-upload-area ${isDragging ? 'is-dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleProcessUploadPdf(f);
                  }}
                  onClick={() => uploadInputRef.current?.click()}
                  title="Haz clic para seleccionar o arrastra aquí tu póliza PDF"
                >
                  <UploadCloud size={44} className="polizas-upload-icon" />
                  <p className="polizas-upload-text">Arrastra aquí la carátula de la póliza en PDF o haz clic para seleccionar</p>
                  <p className="polizas-upload-hint">Formatos soportados: PDF hasta 10 MB con texto seleccionable</p>
                  <input
                    type="file"
                    ref={uploadInputRef}
                    accept=".pdf"
                    className="polizas-upload-input"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleProcessUploadPdf(f);
                      e.target.value = '';
                    }}
                  />
                </div>
                <div className="polizas-upload-actions">
                  <button type="button" onClick={onClose} className="polizas-btn-cancel">
                    Cancelar
                  </button>
                </div>
              </div>
            )
          ) : (
            <form onSubmit={handleSubmit} className="polizas-form">
              <div className="polizas-ai-toolbar">
                <button
                  type="button"
                  className="polizas-ai-btn-trigger"
                  disabled={analyzingAi}
                  onClick={() => drawerFileInputRef.current?.click()}
                  title="Sube una carátula en PDF para autocompletar este formulario mediante Gemini"
                >
                  {analyzingAi ? (
                    <>
                      <Loader2 size={16} className="polizas-ai-spinner" />
                      <span>Analizando póliza con inteligencia artificial…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} className="polizas-ai-icon-sparkle" />
                      <span>Autocompletar con IA desde PDF</span>
                    </>
                  )}
                </button>
                <input
                  type="file"
                  ref={drawerFileInputRef}
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleDrawerAiFile(f);
                    e.target.value = '';
                  }}
                />
                <span className="polizas-ai-toolbar-hint">
                  Extrae vigencias, primas, coberturas y bien asegurado con Google Gemini
                </span>
              </div>

              {drawerAiError && (
                <div className="polizas-ai-alert-error" role="alert">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={18} />
                    <span>{drawerAiError}</span>
                  </div>
                  <button
                    type="button"
                    className="polizas-ai-alert-close"
                    onClick={() => setDrawerAiError('')}
                    aria-label="Cerrar error"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {aiWarnings.length > 0 && (
                <div className="polizas-ai-banner" role="status">
                  <div className="polizas-ai-banner-header">
                    <div className="polizas-ai-banner-title">
                      <Sparkles size={18} className="polizas-ai-icon-sparkle" />
                      <strong>Información autocompletada con IA (Google Gemini)</strong>
                    </div>
                    <button
                      type="button"
                      className="polizas-ai-alert-close"
                      onClick={() => setAiWarnings([])}
                      aria-label="Descartar avisos"
                      title="Descartar aviso"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="polizas-ai-banner-sub">
                    Revisa y ajusta los campos autocompletados antes de guardar. Se detectaron los siguientes puntos para atención manual:
                  </p>
                  <ul className="polizas-ai-warning-list">
                    {aiWarnings.map((w, idx) => {
                      const lower = w.toLowerCase();
                      const isContratante = lower.includes('contratante');
                      const isAgente = lower.includes('agente');
                      const isAseguradora = lower.includes('aseguradora');
                      const isRamo = lower.includes('ramo') && !lower.includes('subramo');
                      const isSubramo = lower.includes('subramo');

                      return (
                        <li key={idx} className="polizas-ai-warning-item">
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
                            <AlertCircle size={14} className="polizas-ai-warning-icon" />
                            <div style={{ flex: 1 }}>
                              <span>{w}</span>
                              {(isContratante || isAgente || isAseguradora || isRamo || isSubramo) && (
                                <div className="polizas-ai-warning-actions">
                                  {isContratante && (
                                    <>
                                      <button
                                        type="button"
                                        className="polizas-ai-warning-btn"
                                        onClick={() => handleOpenQuickCatalog('contratante', 'search')}
                                      >
                                        <Search size={11} /> Buscar existente
                                      </button>
                                      {can('contratantes.manage') && (
                                        <button
                                          type="button"
                                          className="polizas-ai-warning-btn is-primary"
                                          onClick={handleRegisterContratanteFromAi}
                                          title="Crea el contratante con los datos del PDF y lo selecciona"
                                        >
                                          <Plus size={11} /> Registrar con datos del PDF
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {isAgente && (
                                    <>
                                      <button
                                        type="button"
                                        className="polizas-ai-warning-btn"
                                        onClick={() => handleOpenQuickCatalog('agente', 'search')}
                                      >
                                        <Search size={11} /> Buscar existente
                                      </button>
                                      {can('agentes.manage') && (
                                        <button
                                          type="button"
                                          className="polizas-ai-warning-btn is-primary"
                                          onClick={() => handleOpenQuickCatalog('agente', 'create', aiDetectedData?.agente)}
                                        >
                                          <Plus size={11} /> Registrar nuevo
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {isAseguradora && (
                                    <button
                                      type="button"
                                      className="polizas-ai-warning-btn"
                                      onClick={() => handleOpenQuickCatalog('aseguradora', 'search')}
                                    >
                                      <Search size={11} /> Buscar aseguradora en catálogo
                                    </button>
                                  )}
                                  {isRamo && (
                                    <button
                                      type="button"
                                      className="polizas-ai-warning-btn"
                                      onClick={() => handleOpenQuickCatalog('ramo', 'search')}
                                    >
                                      <Search size={11} /> Buscar ramo en catálogo
                                    </button>
                                  )}
                                  {isSubramo && (
                                    <button
                                      type="button"
                                      className="polizas-ai-warning-btn"
                                      onClick={() => handleOpenQuickCatalog('subramo', 'search')}
                                    >
                                      <Search size={11} /> Buscar subramo en catálogo
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {err && <p className="gsea-auth-error">{err}</p>}

              <div className="polizas-form-group">
                <div className="polizas-field-label-row">
                  <label>Contratante *</label>
                  <div className="polizas-field-actions">
                    <button
                      type="button"
                      className="polizas-field-action-btn"
                      onClick={() => handleOpenQuickCatalog('contratante', 'search')}
                      title="Buscar contratante existente"
                    >
                      <Search size={11} /> Buscar
                    </button>
                    {can('contratantes.manage') && (
                      <button
                        type="button"
                        className="polizas-field-action-btn is-create"
                        onClick={() =>
                          aiDetectedData?.contratante?.nombre
                            ? handleRegisterContratanteFromAi()
                            : handleOpenQuickCatalog('contratante', 'create', aiDetectedData?.contratante)
                        }
                        title="Registrar contratante (usa datos del PDF si hay extracción)"
                      >
                        <Plus size={11} /> Agregar
                      </button>
                    )}
                  </div>
                </div>
                <select
                  required
                  value={formData.contratante_id}
                  onChange={(e) => setFormData({ ...formData, contratante_id: e.target.value })}
                >
                  <option value="">Selecciona…</option>
                  {catalogos.contratantes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="polizas-form-group">
                <div className="polizas-field-label-row">
                  <label>Aseguradora *</label>
                  <div className="polizas-field-actions">
                    <button
                      type="button"
                      className="polizas-field-action-btn"
                      onClick={() => handleOpenQuickCatalog('aseguradora', 'search')}
                      title="Buscar aseguradora en catálogo"
                    >
                      <Search size={11} /> Buscar
                    </button>
                  </div>
                </div>
                <select
                  required
                  value={formData.aseguradora_id}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      aseguradora_id: e.target.value,
                      agente_id: '',
                    })
                  }
                >
                  <option value="">Selecciona…</option>
                  {catalogos.aseguradoras.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="polizas-form-row">
                <div className="polizas-form-group">
                  <div className="polizas-field-label-row">
                    <label>Ramo *</label>
                    <div className="polizas-field-actions">
                      <button
                        type="button"
                        className="polizas-field-action-btn"
                        onClick={() => handleOpenQuickCatalog('ramo', 'search')}
                        title="Buscar ramo en catálogo"
                      >
                        <Search size={11} /> Buscar
                      </button>
                    </div>
                  </div>
                  <select
                    required
                    value={formData.ramo_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ramo_id: e.target.value,
                        subramo_id: '',
                      })
                    }
                  >
                    <option value="">Selecciona…</option>
                    {catalogos.ramos.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="polizas-form-group">
                  <div className="polizas-field-label-row">
                    <label>Subramo *</label>
                    <div className="polizas-field-actions">
                      <button
                        type="button"
                        className="polizas-field-action-btn"
                        onClick={() => handleOpenQuickCatalog('subramo', 'search')}
                        title="Buscar subramo en catálogo"
                      >
                        <Search size={11} /> Buscar
                      </button>
                    </div>
                  </div>
                  <select
                    required
                    value={formData.subramo_id}
                    onChange={(e) => setFormData({ ...formData, subramo_id: e.target.value })}
                  >
                    <option value="">Selecciona…</option>
                    {subramosFiltrados.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="polizas-form-group">
                <div className="polizas-field-label-row">
                  <label>Agente (opcional, id agente_workspace)</label>
                  <div className="polizas-field-actions">
                    <button
                      type="button"
                      className="polizas-field-action-btn"
                      onClick={() => handleOpenQuickCatalog('agente', 'search')}
                      title="Buscar agente existente"
                    >
                      <Search size={11} /> Buscar
                    </button>
                    {can('agentes.manage') && (
                      <button
                        type="button"
                        className="polizas-field-action-btn is-create"
                        onClick={() => handleOpenQuickCatalog('agente', 'create', aiDetectedData?.agente)}
                        title="Registrar nuevo agente"
                      >
                        <Plus size={11} /> Agregar
                      </button>
                    )}
                  </div>
                </div>
                <select
                  value={formData.agente_id}
                  onChange={(e) => setFormData({ ...formData, agente_id: e.target.value })}
                >
                  <option value="">Ninguno</option>
                  {agentesOpciones.map((aw) => (
                    <option key={aw.id} value={aw.id}>
                      {aw.agente?.nombre} {aw.agente?.apellido || ''} ( #{aw.id} )
                    </option>
                  ))}
                </select>
                <small style={{ opacity: 0.8 }}>
                  Debe tener clave para la aseguradora elegida.
                </small>
              </div>

              {type === 'add' && <div className="polizas-form-group">
                <label>¿Es renovación? Póliza anterior</label>
                <select
                  disabled={!renovacionDisponible}
                  value={formData.poliza_anterior_id || ''}
                  onChange={e => setFormData({ ...formData, poliza_anterior_id: e.target.value })}
                >
                  <option value="">No es renovación</option>
                  {polizas
                    .filter((p) => p?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.id} · {p.numero || p.numero_poliza || 'Sin número'}
                        {p.finVigencia || p.fin_vigencia
                          ? ` · fin ${String(p.finVigencia || p.fin_vigencia).slice(0, 10)}`
                          : ''}
                      </option>
                    ))}
                </select>
                <small>
                  {renovacionDisponible
                    ? 'Si renuevas una póliza vencida, elígela aquí. Eso alimenta la Tasa de renovación del Dashboard.'
                    : 'Vínculo disponible al aplicar la migración de renovaciones.'}
                </small>
              </div>}
              <div className="polizas-form-group">
                <label>Número de póliza *</label>
                <input
                  required
                  value={formData.numero_poliza}
                  onChange={(e) => setFormData({ ...formData, numero_poliza: e.target.value })}
                  placeholder="Ej: 123-456789-01"
                />
              </div>

              <div className="polizas-form-row">
                <div className="polizas-form-group">
                  <label>Fecha de emisión</label>
                  <input
                    type="date"
                    value={formData.fecha_emision}
                    onChange={(e) => setFormData({ ...formData, fecha_emision: e.target.value })}
                  />
                  <small>Define el mes de Pólizas vendidas, Prima emitida y Meta comercial.</small>
                </div>
                <div className="polizas-form-group">
                  <label>Moneda</label>
                  <input
                    value={formData.moneda}
                    onChange={(e) => setFormData({ ...formData, moneda: e.target.value })}
                    placeholder="MXN"
                  />
                  <small>Debe coincidir con la moneda de la meta (ej. MXN).</small>
                </div>
              </div>

              <div className="polizas-form-row">
                <div className="polizas-form-group">
                  <label>Inicio vigencia *</label>
                  <input
                    type="date"
                    required
                    value={formData.inicio_vigencia}
                    onChange={(e) => setFormData({ ...formData, inicio_vigencia: e.target.value })}
                  />
                </div>
                <div className="polizas-form-group">
                  <label>Fin vigencia *</label>
                  <input
                    type="date"
                    required
                    value={formData.fin_vigencia}
                    onChange={(e) => setFormData({ ...formData, fin_vigencia: e.target.value })}
                  />
                </div>
              </div>

              <div className="polizas-form-row">
                <div className="polizas-form-group">
                  <label>Prima neta</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.prima_neta}
                    onChange={(e) =>
                      setFormData((prev) => applyPremiumCalc(prev, { prima_neta: e.target.value }))
                    }
                  />
                </div>
                <div className="polizas-form-group">
                  <label>IVA</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.iva}
                    readOnly
                    title="Se calcula automáticamente: prima neta × 16%"
                  />
                </div>
                <div className="polizas-form-group">
                  <label>Prima total</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.prima_total}
                    readOnly
                    title="Se calcula automáticamente: prima neta + IVA"
                  />
                </div>
              </div>

              <div className="polizas-form-row">
                <div className="polizas-form-group">
                  <label>Frecuencia de cobro</label>
                  <select
                    value={formData.frecuencia_cobro}
                    onChange={(e) =>
                      setFormData((prev) =>
                        applyPremiumCalc(prev, { frecuencia_cobro: e.target.value })
                      )
                    }
                  >
                    <option value="unico">Único</option>
                    <option value="mensual">Mensual</option>
                    <option value="trimestral">Trimestral</option>
                  </select>
                </div>
                <div className="polizas-form-group">
                  <label>Monto por cuota</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.monto_cuota}
                    readOnly
                    placeholder="Prima total ÷ frecuencia"
                    title="Se calcula automáticamente según frecuencia"
                  />
                </div>
                <div className="polizas-form-group">
                  <label>Tel. notificación cobranza</label>
                  <input
                    value={formData.telefono_notificacion}
                    onChange={(e) =>
                      setFormData({ ...formData, telefono_notificacion: e.target.value })
                    }
                    placeholder="Opcional; si vacío, tel. del contratante"
                  />
                </div>
              </div>

              {isEdit && !detallesListos && <p className="gsea-auth-error">{cargaDetalles.error || 'Cargando datos específicos de la póliza…'}</p>}
              {isEdit && detallesListos && !tipoAlta && <p className="gsea-auth-error">No se pudo identificar una sección específica con el ramo y subramo del catálogo actual.</p>}
              {isDrawer && detallesListos && tipoAlta && (
                <>
                  {(['auto', 'moto'].includes(tipoAlta) ? ['vehiculo'] : tipoAlta === 'medicos' ? ['gastos_medicos'] : tipoAlta === 'viaje' ? ['viaje'] : []).map((group) => (
                    <React.Fragment key={group}>
                      <div className="polizas-form-group"><label>{group === 'vehiculo' ? 'Datos del vehículo' : group === 'gastos_medicos' ? 'Gastos médicos' : 'Datos del viaje'}</label></div>
                      <div className="polizas-form-row">
                        <DetalleInputs group={group} tipo={tipoAlta} value={detalles[group]} onChange={(key, value) => setDetalles((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }))} />
                      </div>
                    </React.Fragment>
                  ))}
                  {(['auto', 'moto', 'danos'].includes(tipoAlta) ? ['coberturas'] : ['asegurados', 'beneficiarios', 'coberturas']).map((group) => (
                    <React.Fragment key={group}>
                      <div className="polizas-form-group"><label>{group === 'asegurados' ? 'Asegurados' : group === 'beneficiarios' ? 'Beneficiarios' : 'Coberturas'}</label></div>
                      {group === 'asegurados' && aseguradosProtegidos && <p className="gsea-auth-error">No se pueden modificar asegurados con beneficiarios vinculados: se perderían sus asociaciones.</p>}
                      {detalles[group].map((item, index) => (
                        <React.Fragment key={index}>
                          <div className="polizas-form-row">
                            <DetalleInputs group={group} tipo={tipoAlta} value={item} disabled={group === 'asegurados' && aseguradosProtegidos} onChange={(key, value) => setDetalles((prev) => ({ ...prev, [group]: prev[group].map((row, i) => i === index ? { ...row, [key]: value } : row) }))} />
                          </div>
                          <button type="button" className="polizas-btn-cancel" disabled={group === 'asegurados' && aseguradosProtegidos} onClick={() => setDetalles((prev) => ({ ...prev, [group]: prev[group].filter((_, i) => i !== index) }))}>
                            Quitar {group === 'asegurados' ? 'asegurado' : group === 'beneficiarios' ? 'beneficiario' : 'cobertura'} {index + 1}
                          </button>
                        </React.Fragment>
                      ))}
                      <button type="button" className="polizas-btn-cancel" disabled={group === 'asegurados' && aseguradosProtegidos} onClick={() => setDetalles((prev) => ({ ...prev, [group]: [...prev[group], {}] }))}>
                        Agregar {group === 'asegurados' ? 'asegurado' : group === 'beneficiarios' ? 'beneficiario' : 'cobertura'}
                      </button>
                    </React.Fragment>
                  ))}
                </>
              )}

              <div className="polizas-form-actions">
                <button type="button" onClick={onClose} className="polizas-btn-cancel">
                  Cancelar
                </button>
                <button type="submit" className="polizas-btn-submit" disabled={saving || !detallesListos}>
                  {saving ? 'Guardando…' : type === 'add' ? 'Guardar Póliza' : 'Actualizar'}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
      <PolizaQuickCatalogModal
        isOpen={quickCatalog.isOpen}
        mode={quickCatalog.mode}
        catalogType={quickCatalog.catalogType}
        initialData={quickCatalog.initialData}
        catalogos={catalogos}
        selectedAseguradoraId={formData.aseguradora_id}
        selectedRamoId={formData.ramo_id}
        canManageContratantes={can('contratantes.manage')}
        canManageAgentes={can('agentes.manage')}
        onSelect={handleCatalogItemSelect}
        onClose={() => setQuickCatalog((prev) => ({ ...prev, isOpen: false }))}
      />
    </motion.div>
  );
};

export default SeguimientoPolizas;
