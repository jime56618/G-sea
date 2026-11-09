import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySelection, selectionReducer, isRecordSelected, selectionCount } from '../src/utils/recordSelection.js';

test('selección individual y por página conserva IDs de otras páginas', () => {
  let s = emptySelection('workspace-1/filter-a');
  s = selectionReducer(s, { type: 'toggle', scope: s.scope, ids: [1], checked: true });
  s = selectionReducer(s, { type: 'toggle', scope: s.scope, ids: [3, 4], checked: true });
  assert.deepEqual(s.ids, [1, 3, 4]);
  s = selectionReducer(s, { type: 'toggle', scope: s.scope, ids: [3, 4], checked: false });
  assert.deepEqual(s.ids, [1]);
});

test('todos los resultados filtrados no requiere cargar todos los IDs y admite exclusiones', () => {
  let s = selectionReducer(emptySelection('a'), { type: 'all', scope: 'a' });
  assert.equal(selectionCount(s, 10000), 10000);
  assert.equal(isRecordSelected(s, 9999), true);
  s = selectionReducer(s, { type: 'toggle', scope: 'a', ids: [1, 2], checked: false });
  assert.equal(selectionCount(s, 10000), 9998);
  assert.equal(isRecordSelected(s, 1), false);
  s = selectionReducer(s, { type: 'toggle', scope: 'a', ids: [1], checked: true });
  assert.equal(selectionCount(s, 10000), 9999);
  assert.equal(selectionCount(s, null), null);
});

test('cambios de workspace y filtros limpian selección, también al volver al filtro anterior', () => {
  let s = selectionReducer(emptySelection('workspace-1/a'), { type: 'toggle', scope: 'workspace-1/a', ids: [1], checked: true });
  s = selectionReducer(s, { type: 'clear', scope: 'workspace-1/b' });
  assert.equal(selectionCount(s, 10), 0);
  s = selectionReducer(s, { type: 'clear', scope: 'workspace-1/a' });
  assert.equal(selectionCount(s, 10), 0);
  s = selectionReducer(s, { type: 'all', scope: s.scope });
  s = selectionReducer(s, { type: 'clear', scope: 'workspace-2/a' });
  assert.equal(s.all, false); assert.deepEqual(s.excluded, []);
});
