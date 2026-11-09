// Navegador con perfil temporal y API completamente interceptada. No usa sesión ni datos reales.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';

const base = process.env.GSEA_VISUAL_URL || 'http://127.0.0.1:5173';
const browser = process.env.GSEA_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gsea-export-visual-'));
const profile = path.join(out, 'profile');
fs.mkdirSync(profile);
const fixture = spawnSync('php', ['-r', "require 'vendor/autoload.php'; $p=(new App\\Services\\Exports\\XlsxExporter())->write([['nombre'=>'Registro sintetico']],['Nombre'=>['nombre','text']]); echo base64_encode(file_get_contents($p)); unlink($p);"], { cwd: path.resolve('../gseaback'), encoding: 'utf8' });
assert.equal(fixture.status, 0, fixture.stderr);
const xlsx = fixture.stdout;
const originalComponents = process.env.GSEA_ORIGINAL_COMPONENTS || path.join(os.tmpdir(), 'gsea-export-before/gseafront/src/components');
const compareOriginal = fs.existsSync(path.join(originalComponents, 'Tramites.jsx'));
const perms = ['dashboard.view','tramites.view','tramites.manage','contratantes.view','contratantes.manage','agentes.view','agentes.manage','polizas.view','polizas.manage','cobranza.view','cobranza.manage','calendar.view'];
const session = { user: { id: 1, name: 'Usuario de prueba', email: 'test@example.test', current_workspace_id: 1 },
  current_workspace: { id: 1, nombre: 'Prueba visual aislada', subscription: { is_accessible: true, is_locked: false }, membership: { permissions: perms, role: { slug: 'admin', nombre: 'Administrador' } } }, workspaces: [] };
const clients = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, nombre: `Cliente ${i + 1}`, email: `cliente${i + 1}@example.test`, telefono: '5551234567', rfc: 'TEST010101AAA', direccion: 'Dirección de prueba', polizas_count: 1, created_at: '2026-10-28T12:00:00Z' }));
const agents = clients.map(c => ({ id: c.id, workspace_id: 1, status: 'activo', agente_id: c.id, agente: { id: c.id, nombre: `Agente ${c.id}`, apellido: 'Prueba', cedula: `CED-${c.id}`, email: c.email, telefono: c.telefono, ciudad: 'Mérida', estado: 'Yucatán', fecha_alta: '2026-10-01' }, claves_aseguradora: [] }));
const policies = clients.map(c => ({ id: c.id, contratante_id: c.id, numero_poliza: `POL-${c.id}`, inicio_vigencia: '2026-01-01', fin_vigencia: '2026-12-31', fecha_emision: '2026-10-01', prima_total: 125.5, moneda: 'MXN', contratante: c, aseguradora_id: 1, aseguradora: { id: 1, nombre: 'Aseguradora de prueba' }, agenteWorkspace: agents[c.id - 1], ramo_id: 1, subramo_id: 1 }));
const tramites = clients.map(c => ({ id: c.id, workspace_id: 1, folio: `TR-${c.id}`, etapa: 'Aprobación', semaforo: 'verde', nombre_agente: `Agente ${c.id}`, ramo: 'Autos', poliza_referencia: `POL-${c.id}`, fecha_alta: '2026-10-01', fecha_ultima_modificacion: '2026-10-28T12:00:00Z', estado: null }));
const cuotas = policies.map(p => ({ id: p.id, poliza_id: p.id, poliza: p, numero_cuota: 1, monto: 125.5, fecha_programada: '2026-10-28', estatus: 'pendiente' }));
const list = data => ({ data, total: data.length, current_page: 1, last_page: 1, estado_disponible: false, renovacion_disponible: false });
const routes = [['tramites', 'Tramites.jsx'], ['clientes', 'Clientes.jsx'], ['agentes', 'Agentes.jsx'], ['seguimiento-polizas', 'SeguimientoPolizas.jsx'], ['seguimiento-cobranza', 'SeguimientoCobranza.jsx']];
const requests = []; const errors = [];
const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws; const pending = new Map(); let seq = 0; let original = false;
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception));
  return result.result.value;
};
const until = async (fn, message) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await delay(100); } throw new Error(message); };
const dependencies = { react: 'react', 'react-router-dom': 'react-router-dom', 'react-icons/fi': 'react-icons_fi', 'framer-motion': 'framer-motion', 'lucide-react': 'lucide-react', '@headlessui/react': '@headlessui_react', '@tanstack/react-table': '@tanstack_react-table', 'react-dom': 'react-dom' };

try {
  await until(() => fs.existsSync(path.join(profile, 'DevToolsActivePort')), 'El navegador no inició');
  const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p?.reject(new Error(JSON.stringify(msg.error))); else p?.resolve(msg.result); return; }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(msg.params.exceptionDetails));
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') console.log('Browser console:', msg.params.args.map(a => a.value || a.description).join(' '));
    if (msg.method !== 'Fetch.requestPaused') return;
    (async () => {
      const { requestId, request } = msg.params;
      const url = new URL(request.url);
      const fulfill = (body, type = 'application/json', extra = []) => send('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: new URL(base).origin }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Expose-Headers', value: 'Content-Disposition' }, ...extra], body: type.includes('spreadsheetml') ? xlsx : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
      if (url.origin === new URL(base).origin) {
        const file = routes.find(([, component]) => url.pathname === `/src/components/${component}`)?.[1];
        if (original && file) {
          const source = fs.readFileSync(path.join(originalComponents, file), 'utf8')
            .replace(/import\s+React,\s*\{([^}]+)\}\s+from\s+['"]react['"];?/, 'import React from "react"; const {$1} = React;')
            .replace(/import\s*\{([^}]+)\}\s+from\s+['"]react-dom['"];?/, 'import __originalReactDOM from "react-dom"; const {$1} = __originalReactDOM;');
          let code = transformSync(source, { loader: 'jsx', jsx: 'transform', format: 'esm' }).code;
          code = 'import.meta.env = {DEV: true, VITE_API_URL: "http://127.0.0.1:8000/api"};\n' + code;
          const current = await (await fetch(`${base}/src/components/${file}`)).text();
          const canonical = new Map([...current.matchAll(/(?:from\s*|import\s*)["'](\/[^"']+)["']/g)].map(m => [m[1].split('?')[0], m[1]]));
          code = code.replace(/((?:from\s*|import\s*)["'])([^"']+)(["'])/g, (all, a, id, z) => {
            let target = dependencies[id] ? `/node_modules/.vite/deps/${dependencies[id]}.js` : id.startsWith('.') ? new URL(id, `${base}/src/components/${file}`).pathname : id;
            if (id.startsWith('.') && !path.extname(target)) {
              const extension = ['.jsx', '.js'].find(ext => fs.existsSync(path.join(process.cwd(), target.slice(1) + ext)));
              if (extension) target += extension;
            }
            return `${a}${canonical.get(target) || target}${z}`;
          });
          await fulfill(code, 'application/javascript');
        } else await send('Fetch.continueRequest', { requestId });
        return;
      }
      // Todo lo ajeno al Vite local se simula o bloquea; ninguna petición llega al backend real.
      if (!url.pathname.includes('/api/')) { await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); return; }
      if (request.method === 'OPTIONS') { await fulfill(''); return; }
      let body = request.postData ? JSON.parse(request.postData) : {};
      if (url.pathname.includes('/exports/')) {
        if (body.filters?.q !== undefined) assert.equal(typeof body.filters.q, 'string');
        requests.push({ path: url.pathname, body });
        if (url.pathname.endsWith('/count')) await fulfill({ workspace_id: 1, total: (body.ids || []).length, accessible_ids: body.ids || [] });
        else await fulfill('', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', [{ name: 'Content-Disposition', value: 'attachment; filename="gsea-prueba.xlsx"' }]);
        return;
      }
      assert.equal(request.method, 'GET', `Petición operativa no permitida: ${request.url}`);
      const endpoint = url.pathname.split('/api/')[1];
      const values = { user: session, tramites: list(tramites), contratantes: list(clients), agentes_workspace: list(agents), polizas: list(policies), cobranza_cuotas: list(cuotas), aseguradoras: list([{ id: 1, nombre: 'Aseguradora de prueba' }]), ramos: list([{ id: 1, nombre: 'Autos' }]), subramos: list([{ id: 1, ramo_id: 1, nombre: 'Autos' }]) };
      await fulfill(values[endpoint] || list([]));
    })().catch(error => { errors.push(error.message); send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {}); });
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(out, 'downloads') });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('token','token-sintetico');localStorage.setItem('auth_session',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('user',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('current_workspace_id','1');` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  for (const [route] of routes) {
    for (const variant of compareOriginal ? ['original', 'corregido'] : ['corregido']) {
      original = variant === 'original';
      await send('Page.navigate', { url: `${base}/${route}?visual=${variant}` });
      try { await until(() => evaluate('Boolean(document.querySelector("table tbody tr"))'), `No cargó ${route}/${variant}`); }
      catch (error) { console.log(JSON.stringify({ errors, body: await evaluate('document.body.innerText'), url: await evaluate('location.href') })); throw error; }
      await delay(700);
      if (!original) {
        await until(() => evaluate('Boolean(document.querySelector("table tbody input[type=checkbox]:not(:disabled)"))'), `Checkbox no habilitado ${route}`);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.trim()==='Exportar').length`), 1);
        assert.equal(await evaluate(`Boolean(document.querySelector('select[aria-label="Alcance de exportación"]'))`), false);
        assert.equal(await evaluate(`/Seleccionar todos los resultados filtrados|Limpiar selección|\\d+ seleccionados/.test(document.body.innerText)`), false);
        for (const count of [0, 1, 2]) {
          await evaluate(`document.querySelectorAll('table tbody input[type=checkbox]').forEach((box,i)=>{if(box.checked!==(i<${count}))box.click()})`);
          const before = requests.filter(r => !r.path.endsWith('/count')).length;
          await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Exportar').click()`);
          await until(() => requests.filter(r => !r.path.endsWith('/count')).length > before, 'No se emitió descarga');
          const request = requests.filter(r => !r.path.endsWith('/count')).at(-1);
          assert.equal(request.body.mode, count ? 'selected' : 'filtered');
          assert.equal(request.body.ids.length, count);
          assert.equal(request.body.filters.q, undefined);
          await until(() => evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Exportar'&&!b.disabled)`), 'No finalizó descarga');
        }
        await evaluate(`document.querySelectorAll('table tbody input[type=checkbox]').forEach(box=>{if(box.checked)box.click()})`);
        await evaluate(`document.querySelector('table thead input[type=checkbox]').click()`);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('table tbody input[type=checkbox]')).every(box=>box.checked)`), true);
        await evaluate(`document.querySelector('table thead input[type=checkbox]').click()`);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('table tbody input[type=checkbox]')).some(box=>box.checked)`), false);
      }
      await delay(1200); // Esperar las animaciones de filas existentes antes de comparar.
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(out, `${route}-${variant}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`${route}/${variant}: renderizado y captura correctos`);
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'peticiones.json'), JSON.stringify(requests, null, 2));
  console.log(`OK: 5 módulos, 15 descargas simuladas, ${compareOriginal ? 'capturas original/corregido' : 'capturas corregidas (sin snapshot original)'}. Artefactos: ${out}`);
} finally {
  if (ws?.readyState === 1) { try { await send('Browser.close'); } catch {} ws.close(); }
  proc.kill();
}
