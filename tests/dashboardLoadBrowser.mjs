// Medición de render/peticiones con latencias controladas. Todas las APIs están simuladas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const label = process.argv[2] || 'before';
const base = 'http://127.0.0.1:5173';
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gsea-dashboard-load-'));
const profile = path.join(folder, 'profile'); fs.mkdirSync(profile);
const session = { user: { id: 1, name: 'Prueba', email: 'test@example.test', current_workspace_id: 1 }, current_workspace: { id: 1, nombre: 'Prueba', membership: { role: { slug: 'admin' }, permissions: ['dashboard.view','polizas.view','contratantes.view','tramites.view','calendar.view','cobranza.view'] }, subscription: { is_accessible: true, is_locked: false } }, workspaces: [] };
const summary = { workspace_id: 1, clientes_total: 37, polizas_vencidas: 3, resumen_periodo: { polizas_emitidas: 42, por_moneda: [{ moneda: 'MXN', prima_total: '1250' }] }, tramites: { total: 1, estados: null, totales_por_semaforo: [{ semaforo: 'verde', total: 1 }] }, graficas: {} };
const group = { cantidad: 1, montos_por_moneda: { MXN: 125 } };
const calls = []; const errors = []; let socket; let id = 0; const pending = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const proc = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new','--no-first-run','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], { windowsHide: true, stdio: 'ignore' });
const send = (method, params = {}) => new Promise((resolve,reject) => { const key=++id; pending.set(key,{resolve,reject}); socket.send(JSON.stringify({id:key,method,params})); });
const evaluate = async expression => (await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
try {
  for(let i=0;i<100&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++) await pause(100);
  const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
  const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const msg=JSON.parse(event.data);
    if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p?.reject(msg.error):p?.resolve(msg.result);return;}
    if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    if(msg.method!=='Fetch.requestPaused')return;
    (async()=>{
      const {requestId,request}=msg.params;const url=new URL(request.url);
      if(url.origin===base){await send('Fetch.continueRequest',{requestId});return;}
      if(!url.pathname.includes('/api/')){await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});return;}
      calls.push(url.pathname+url.search);
      let body={},delay=100;
      if(url.pathname.endsWith('/user'))body=session;
      else if(url.pathname.endsWith('/dashboard/summary')){body=summary;delay=120;}
      else if(url.pathname.endsWith('/dashboard/cobranza')){body={vencidas:group,totales_generales:group,pagadas:group,casos_prioritarios:[]};delay=180;}
      else if(url.pathname.endsWith('/dashboard/totales')){body={workspace_id:1,clientes_total:37,polizas_vencidas:3};delay=80;}
      else if(url.pathname.endsWith('/contratantes')){body={total:37,data:[]};delay=800;}
      else if(url.pathname.endsWith('/polizas')){body={total:3,data:[]};delay=800;}
      else if(url.pathname.endsWith('/calendar/events')){body={workspace_id:1,timezone:'America/Merida',total:0,listado:{total:0,data:[]}};delay=1200;}
      else if(url.pathname.endsWith('/dashboard/metas-comerciales'))body={workspace_id:1,disponible:false,metas:[],puede_crear:false,puede_editar:false};
      await pause(delay);
      await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:base},{name:'Access-Control-Allow-Headers',value:'*'}],body:Buffer.from(JSON.stringify(body)).toString('base64')}).catch(()=>{});
    })().catch(error=>errors.push(String(error)));
  };
  await send('Runtime.enable');await send('Page.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();sessionStorage.clear();localStorage.setItem('token','sintetico');localStorage.setItem('auth_session',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('user',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('current_workspace_id','1');`});
  await send('Page.navigate',{url:base+'/dashboard'});
  const start=Date.now();let first=null,complete=null;
  for(let i=0;i<400;i++){
    const state=await evaluate(`({populated:Array.from(document.querySelectorAll('.gsea-kpi-value')).some(e=>e.textContent.trim()==='42'),complete:!!document.querySelector('.gsea-sync-pill')})`);
    if(state?.populated&&first===null)first=Date.now()-start;
    if(state?.complete){complete=Date.now()-start;break;}await pause(20);
  }
  assert.notEqual(first,null);assert.notEqual(complete,null);assert.deepEqual(errors,[]);
  const result={label,first_kpi_ms:first,all_sections_ms:complete,requests:calls.length,calls};
  fs.writeFileSync(path.join(os.tmpdir(),`gsea-dashboard-browser-${label}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{if(socket?.readyState===1){try{await send('Browser.close');}catch{}socket.close();}proc.kill();}
