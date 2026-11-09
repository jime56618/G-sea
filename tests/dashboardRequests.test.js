import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardRequestPool } from '../src/utils/dashboardRequests.js';

test('comparte solo solicitudes simultáneas del mismo alcance y no guarda respuestas', async () => {
  let count = 0; let finish;
  const acquire = createDashboardRequestPool(() => { count++; return new Promise(resolve => { finish = resolve; }); });
  const one = acquire('user1/ws1/token1', '/dashboard/summary');
  one.release();
  const two = acquire('user1/ws1/token1', '/dashboard/summary');
  await Promise.resolve(); assert.equal(count, 1); finish({ ok: true });
  assert.deepEqual(await two.promise, { ok: true }); two.release();
  const fresh = acquire('user1/ws1/token1', '/dashboard/summary'); await Promise.resolve(); assert.equal(count, 2);
  finish({ fresh: true }); await fresh.promise; fresh.release();
});

test('no comparte solicitudes entre usuarios, workspaces, tokens o rutas', async () => {
  let count = 0;
  const acquire = createDashboardRequestPool(async () => ++count);
  const handles = [['u1/w1/t1','/summary'],['u2/w1/t2','/summary'],['u1/w2/t1','/summary'],['u1/w1/t1','/totales']].map(([scope,path])=>acquire(scope,path));
  await Promise.all(handles.map(handle=>handle.promise)); assert.equal(count,4); handles.forEach(handle=>handle.release());
});

test('liberar un consumidor no cancela la consulta de otro', async () => {
  let signal; let finish;
  const acquire = createDashboardRequestPool((_path, options) => { signal=options.signal; return new Promise(resolve=>{finish=resolve;}); });
  const one=acquire('u1/w1','/summary'); const two=acquire('u1/w1','/summary'); one.release();
  await new Promise(resolve=>setTimeout(resolve,30)); assert.equal(signal.aborted,false);
  finish({}); await two.promise; two.release();
});
