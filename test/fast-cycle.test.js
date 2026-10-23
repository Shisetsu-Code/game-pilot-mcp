import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {Store} from '../src/store.js';import {Pilot} from '../src/pilot.js';
async function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001.sql',import.meta.url),'utf8'));
 const db={prepare(q){const stmt=sql.prepare(q);let args=[];return {bind(...a){args=a;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}};}};}};
 const games=[0,1].map(i=>({id:'g'+i,provider:'fixture',demo:true,url:'http://127.0.0.1:4177'}));const pilot=new Pilot(new Store(db),{games,allowFixture:true});
 const run=await pilot.startRun({gameIds:games.map(g=>g.id)});const sessions=await Promise.all([pilot.claimSession(run.id,'w0'),pilot.claimSession(run.id,'w1')]);return {pilot,run,sessions,close:()=>sql.close()};
}
const shot=(id,text='',controls=[])=>({observationId:id,geometry:{clip:{x:0,y:0,width:800,height:600},imageWidth:800,imageHeight:600},imageSha256:'a'.repeat(64),imageRef:id+'.jpg',state:{screen:'unclassified',roundPhase:'unknown'},text,controls});
test('fast batch classifies, reviews and dispatches independent siblings in one call',async()=>{
 const f=await fixture();try{
 assert.equal(typeof f.pilot.advanceBatch,'function');
 for(const s of f.sessions)await f.pilot.captured(s.id,s.leaseId,shot(s.id));
 const observations=await f.pilot.getObservations(f.run.id,'reviewer');
 const items=observations.map(o=>({sessionId:o.sessionId,observationId:o.observationId,leaseId:o.decisionLease,revision:o.revision,state:{screen:'base',roundPhase:'idle'},decision:{commandId:'c-'+o.sessionId,action:{type:'click',x:.5,y:.5},goal:'spin',target:'Spin',reason:'visible'}}));
 const result=await f.pilot.advanceBatch(items);assert.ok(result.every(r=>r.ok));assert.ok((await Promise.all(f.sessions.map(s=>f.pilot.poll(s.id,s.leaseId)))).every(p=>p.command.goal==='spin'));
 }finally{f.close();}
});
test('new runs finish at the requested two normal spins, without an unnecessary third',async()=>{
 const f=await fixture();try{const s=f.sessions[0];assert.equal(f.run.normalSpins,2);
 await f.pilot.store.change('session:'+s.id,x=>{x.coverage.menuExhausted=true;x.coverage.normalSpins=1;});
 assert.equal((await f.pilot.graph(s.id)).complete,false);
 await f.pilot.store.change('session:'+s.id,x=>{x.coverage.normalSpins=2;});assert.equal((await f.pilot.complete(s.id)).ok,true);
 }finally{f.close();}
});
test('one invalid item does not block siblings, and waiting releases the reviewer lease',async()=>{
 const f=await fixture();try{
 for(const s of f.sessions)await f.pilot.captured(s.id,s.leaseId,shot(s.id));const obs=await f.pilot.getObservations(f.run.id,'r');
 const items=obs.map(o=>({sessionId:o.sessionId,observationId:o.observationId,leaseId:o.decisionLease,revision:o.revision,state:{screen:'bonus',roundPhase:'active'}}));
 items[0].leaseId='expired';const result=await f.pilot.advanceBatch(items);assert.equal(result[0].ok,false);assert.equal(result[1].ok,true);
 assert.equal((await f.pilot.session(items[1].sessionId)).observation.decisionUntil,0);
 assert.equal((await f.pilot.getObservations(f.run.id,'r',1,[items[1].sessionId])).length,0);
 }finally{f.close();}
});
test('yield never clears an uncertain or blocked purchase',async()=>{
 const f=await fixture();try{const s=f.sessions[0];await f.pilot.captured(s.id,s.leaseId,shot('unknown'));
 for(const phase of ['uncertain','blocked']){
  await f.pilot.store.change('session:'+s.id,x=>{x.phase=phase;x.observation.decisionUntil=0;x.readyAt=0;});
  const [o]=await f.pilot.getObservations(f.run.id,'r',1,[s.id]);
  await f.pilot.advanceBatch([{sessionId:s.id,observationId:o.observationId,leaseId:o.decisionLease,revision:o.revision,state:{screen:'base',roundPhase:'idle'}}]);
  assert.equal((await f.pilot.session(s.id)).phase,phase);
 }
 }finally{f.close();}
});
test('autonomous prize dismissal is journaled, respects decision leases and confirms only after return to idle',async()=>{
 const f=await fixture();try{
 assert.equal(typeof f.pilot.queueRoutine,'function');const s=f.sessions[0];
 await f.pilot.captured(s.id,s.leaseId,shot('base'));const [o]=await f.pilot.getObservations(f.run.id,'reviewer',1,[s.id]);
 await f.pilot.annotate([{sessionId:s.id,observationId:o.observationId,leaseId:o.decisionLease,state:{screen:'base',roundPhase:'idle'}}]);
 await f.pilot.submitDecisions([{sessionId:s.id,observationId:o.observationId,leaseId:o.decisionLease,revision:o.revision,commandId:'buy',goal:'buy',target:'bonus',reason:'visible',action:{type:'click',x:.5,y:.5}}]);
 await f.pilot.issued(s.id,s.leaseId,'buy');await f.pilot.finish(s.id,s.leaseId,'buy',{status:'observed',observation:shot('bonus')});
 const prize=shot('prize','TOTAL WIN 75',[{label:'Click to continue',x:.5,y:.5}]);
 const queued=await f.pilot.queueRoutine(s.id,s.leaseId,prize);assert.equal(queued.ok,true);
 assert.equal((await f.pilot.graph(s.id)).coverage.purchases.bonus,undefined);
 const cmd=await f.pilot.command(s.id,s.leaseId);await f.pilot.issued(s.id,s.leaseId,cmd.commandId);
 await f.pilot.finish(s.id,s.leaseId,cmd.commandId,{status:'observed',observation:shot('idle','',[{label:'Spin',x:.8,y:.8}])});
 assert.equal((await f.pilot.graph(s.id)).coverage.purchases.bonus,'verified');
 assert.equal((await f.pilot.session(s.id)).commands[cmd.commandId].status,'verified');
 await f.pilot.getObservations(f.run.id,'reviewer',1,[s.id]);
 assert.equal((await f.pilot.queueRoutine(s.id,s.leaseId,{...prize,observationId:'late'})).ok,false);
 }finally{f.close();}
});
