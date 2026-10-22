import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createLocalEnv,startLocalServer} from '../scripts/local.mjs';import {makePilot} from '../src/worker.js';import {startSupervisor} from '../runner/supervisor.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const demo=String.raw`<!doctype html><html><body style="font:20px Arial;background:#eef"><h1>Fixture DEMO — saldo ficticio</h1><main></main><script>
let screen='base',purchased=[],spins=0;function render(){document.body.setAttribute('data-pilot-state',JSON.stringify({screen,roundPhase:'idle',visibleOptions:screen==='menu'?['Bronze','Silver']:['Menu','Spin'],purchased,spins}));document.querySelector('main').innerHTML=screen==='base'?'<button onclick="screen=\'menu\';render()">Menu</button><button onclick="spins++;render()">Spin</button>':'<button onclick="purchased.push(\'Bronze\');render()">Bronze</button><button onclick="purchased.push(\'Silver\');render()">Silver</button><button onclick="screen=\'base\';render()">Back</button>';document.querySelector('main').insertAdjacentHTML('beforeend','<p>Compras: '+purchased.join(', ')+' · Tiradas: '+spins+'</p>');}render();</script><style>button{margin:20px;padding:25px}</style></body></html>`;
test('four real browser processes run eight games through batched MCP and durable replay export',{timeout:120000},async t=>{
 const fixture=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(demo);});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>fixture.close(r)));
 const games=Array.from({length:8},(_,i)=>({id:'fixture-'+i,provider:'fixture',url:'http://127.0.0.1:'+fixture.address().port,demo:true}));
 const token=crypto.randomUUID()+crypto.randomUUID(),runnerToken=crypto.randomUUID()+crypto.randomUUID();const directory=await mkdtemp(join(tmpdir(),'game-pilot-test-'));
 const env=await createLocalEnv({directory,mcpToken:token,runnerToken,catalog:{games},allowFixture:true});t.after(()=>env.close());const http=await startLocalServer(env,{port:0});t.after(()=>new Promise(r=>http.close(r)));const url='http://127.0.0.1:'+http.address().port;
 const client=new Client({name:'fixture-reviewer',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',url),{requestInit:{headers:{authorization:'Bearer '+token}}}));t.after(()=>client.close());
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return r.content[0]?.type==='text'?JSON.parse(r.content[0].text):r;};
 const run=await call('start_run',{gameIds:games.map(g=>g.id)});const pilot=makePilot(env),started=Date.now();
 const supervisor=startSupervisor({env:{...process.env,PILOT_URL:url,PILOT_RUNNER_TOKEN:runnerToken,PILOT_RUN_ID:run.id}});t.after(async()=>{supervisor.stop();await Promise.race([Promise.all(supervisor.children.map(c=>c.exitCode!==null?Promise.resolve():new Promise(r=>c.once('exit',r)))),pause(3000)]);for(const c of supervisor.children)if(c.exitCode===null)c.kill();});assert.equal(new Set(supervisor.children.map(c=>c.pid)).size,4);
 let ready=false;for(let i=0;i<160;i++){const status=await pilot.status(run.id);if(status.sessions.every(s=>s.phase==='observed')){ready=true;break;}await pause(100);}assert.equal(ready,true,'all eight contexts must become ready concurrently');
 const pending=new Map(),done=new Set(),stats={images:0,imageBytes:0,batches:0,maxBatch:0,actions:0,workers:4,sessions:8};let seq=0;
 for(let iteration=0;iteration<300&&done.size<8;iteration++){
  const response=await client.callTool({name:'get_observations',arguments:{runId:run.id,reviewerId:'fixture-reviewer',limit:8}});const observations=[];
  for(let i=0;i<response.content.length;i++){const item=response.content[i];if(item.type==='image'){stats.images++;stats.imageBytes+=Buffer.from(item.data,'base64').length;}else if(item.type==='text'){try{const o=JSON.parse(item.text);if(o.sessionId)observations.push(o);}catch{}}}
  if(!observations.length){await pause(100);continue;}stats.batches++;stats.maxBatch=Math.max(stats.maxBatch,observations.length);
  const reviews=observations.filter(o=>pending.has(o.sessionId)).map(o=>({sessionId:o.sessionId,commandId:pending.get(o.sessionId),observationId:o.observationId,leaseId:o.decisionLease,status:'verified',reason:'deterministic fixture state confirms transition'}));
  if(reviews.length){const results=await call('review_results',{reviews});assert.ok(results.every(r=>r.ok),JSON.stringify(results));for(const r of reviews)pending.delete(r.sessionId);}
  const decisions=[];
  for(const o of observations){if(done.has(o.sessionId))continue;let target,goal;
   if(o.state.screen==='menu'){
    target=['Bronze','Silver'].find(x=>!o.state.purchased.includes(x))||'Back';goal=target==='Back'?'navigate':'buy';
    await call('update_coverage',{sessionId:o.sessionId,options:[{id:'Bronze',disabled:false},{id:'Silver',disabled:false}],menuExhausted:true});
   }else if(o.state.purchased.length<2){target='Menu';goal='navigate';}
   else if(o.state.spins<3){target='Spin';goal='spin';}else{await call('complete_game',{sessionId:o.sessionId});done.add(o.sessionId);continue;}
   const control=o.controls.find(c=>c.label===target);assert.ok(control,'visible fixture control '+target);const commandId='c'+(++seq);
   decisions.push({commandId,sessionId:o.sessionId,observationId:o.observationId,revision:o.revision,leaseId:o.decisionLease,action:{type:'click',x:control.x,y:control.y},goal,target,reason:'visible fixture control'});pending.set(o.sessionId,commandId);
  }
  if(decisions.length){const results=await call('submit_decisions',{decisions});assert.ok(results.every(r=>r.ok),JSON.stringify(results));stats.actions+=decisions.length;}
  await pause(150);
 }
 assert.equal(done.size,8);assert.equal(stats.maxBatch,8);const status=await pilot.status(run.id);assert.equal(new Set(status.sessions.map(s=>s.owner)).size,4);assert.ok(status.sessions.every(s=>s.coverage.complete));
 const exported=await call('export_replay',{runId:run.id});assert.equal(exported.sessions,8);assert.ok(await env.IMAGES.get(exported.manifest));stats.elapsedMs=Date.now()-started;stats.averageImageBytes=Math.round(stats.imageBytes/stats.images);stats.note='Deterministic fixture reviewer, not a visual AI inference benchmark.';await writeFile('docs/pilot-evidence.json',JSON.stringify(stats,null,2));
 supervisor.stop();await Promise.all(supervisor.children.map(c=>c.exitCode!==null?Promise.resolve():new Promise(r=>c.once('exit',r))));
});
