import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExportFilters, directExportMode } from '../src/utils/exportFilters.js';

test('búsqueda vacía se omite en los cinco módulos; búsqueda real sigue siendo texto', () => {
  for (const module of ['tramites', 'clientes', 'agentes', 'polizas', 'cobranza']) {
    for (const q of ['', '  ', null, undefined]) assert.deepEqual(normalizeExportFilters(module, { q }), {});
    assert.deepEqual(normalizeExportFilters(module, { q: 'Aprobación' }), { q: 'Aprobación' });
    for (const q of [[], {}, 2, false]) assert.throws(() => normalizeExportFilters(module, { q }), TypeError);
  }
});

test('conserva filtros del módulo y rechaza objetos o campos incompatibles', () => {
  const cases = { tramites: { semaforo: 'verde', estado: 'en_atencion' }, clientes: {}, agentes: { status: 'activo', empresa: 'Uno' },
    polizas: { estatus: 'Vigente', vencidas: false, hoy: '2026-10-28', tz_offset: 360 }, cobranza: { estatus: 'pendiente', poliza_id: 2, desde: '2026-10-01' } };
  for (const [module, filters] of Object.entries(cases)) assert.deepEqual(normalizeExportFilters(module, filters), filters);
  assert.throws(() => normalizeExportFilters('tramites', { empresa: 'Uno' }));
  assert.throws(() => normalizeExportFilters('polizas', { estatus: {} }));
});

test('exportación directa usa seleccionados con uno o varios IDs y filtrados sin selección', () => {
  assert.equal(directExportMode([1]), 'selected');
  assert.equal(directExportMode([1, 4]), 'selected');
  assert.equal(directExportMode([]), 'filtered');
});
