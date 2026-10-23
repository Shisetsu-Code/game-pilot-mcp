import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {chromium} from 'playwright';
import {createLocalEnv,startLocalServer} from '../scripts/local.mjs';import {makePilot} from '../src/worker.js';import {CloudClient} from '../runner/cloud-client.js';import {runSession} from '../runner/session.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('eight games buy concurrently and close their prizes without another GPT decision',{timeout:60000},async t=>{
 const html=`<body><main></main><script>
 function base(){document.querySelector('main').innerHTML='<button onclick="buy()">Buy Bonus</button><button>Spin</button>';}
 function buy(){window.buys=(window.buys||0)+1;document.querySelector('main').innerHTML='<button disabled>Spin</button><p>Free spins remaining 3</p>';setTimeout(()=>{document.querySelector('main').innerHTML='<h1>TOTAL WIN 75</h1><button onclick="base()">Click to continue</button>';},1100);}base();</script>`;
 const web=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(html);});await new Promise(r=>web.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>web.close(r)));
 const games=Array.from({length:8},(_,i)=>({id:'auto-'+i,provider:'fixture',url:'http://127.0.0.1:'+web.address().port,demo:true}));
 const token=crypto.randomUUID(),runnerToken=crypto.randomUUID(),directory=await mkdtemp(join(tmpdir(),'pilot-auto-'));
 const env=await createLocalEnv({directory,mcpToken:token,runnerToken,catalog:{games},allowFixture:true});t.after(()=>env.close());const http=await startLocalServer(env,{port:0});t.after(()=>new Promise(r=>http.close(r)));
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const pilot=makePilot(env),run=await pilot.startRun({gameIds:games.map(g=>g.id)});
 const sessions=[];for(let i=0;i<8;i++)sessions.push(await pilot.claimSession(run.id,'w'+Math.floor(i/2)));
 const abort=new AbortController(),client=new CloudClient({url:'http://127.0.0.1:'+http.address().port,token:runnerToken});
 const tasks=sessions.map(s=>runSession(browser,client,s,{signal:abort.signal}));t.after(async()=>{abort.abort();await Promise.allSettled(tasks);});
 const until=async predicate=>{const end=Date.now()+40000;while(Date.now()<end){if(await predicate())return;await sleep(100);}throw Error('autopilot_timeout');};
 await until(async()=>(await Promise.all(sessions.map(s=>pilot.session(s.id)))).every(s=>s.phase==='observed'));
 const observations=await pilot.getObservations(run.id,'fixture-gpt');assert.equal(observations.length,8);
 const results=await pilot.advanceBatch(observations.map(o=>{const c=o.controls.find(c=>c.label==='Buy Bonus');return {sessionId:o.sessionId,observationId:o.observationId,revision:o.revision,leaseId:o.decisionLease,state:{screen:'base',roundPhase:'idle'},decision:{commandId:'buy-'+o.sessionId,goal:'buy',target:'bonus',reason:'visible fixture bonus',action:{type:'click',x:c.x,y:c.y}}};}));assert.ok(results.every(r=>r.ok));
 const started=Date.now();await until(async()=>(await Promise.all(sessions.map(s=>pilot.session(s.id)))).every(s=>s.coverage.purchases.bonus==='verified'));
 const finished=await Promise.all(sessions.map(s=>pilot.session(s.id)));
 assert.ok(finished.every(s=>Object.values(s.commands).filter(c=>c.goal==='buy').length===1));
 assert.ok(finished.every(s=>s.events.some(e=>e.type==='automatic_review')));
 assert.ok(Math.max(...finished.map(s=>s.commands['buy-'+s.id].issuedAt))-Math.min(...finished.map(s=>s.commands['buy-'+s.id].issuedAt))<6000,'purchases must overlap rather than run sequentially');
 console.log(JSON.stringify({benchmark:'eight-concurrent-prize-routines',games:8,gptDecisionBatches:1,elapsedMs:Date.now()-started}));
 abort.abort();await Promise.all(tasks);
});
