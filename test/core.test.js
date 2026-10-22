import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const moduleExists = async p => { try { return await import(new URL(p, root)); } catch (e) { if(e.code==='ERR_MODULE_NOT_FOUND') return {}; throw e; } };
const { validateDecision } = await moduleExists('src/contracts.js');
const { Store } = await moduleExists('src/store.js');
const { Pilot } = await moduleExists('src/pilot.js');
const { SpeedController } = await moduleExists('runner/speed.js');
export function dbFixture() {
 const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../migrations/0001.sql',import.meta.url),'utf8'));
 return { prepare(query) { const stmt=sql.prepare(query); let args=[]; return {bind(...values){args=values;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}};}};}, close(){sql.close();} };
}
const game={id:'fixture',provider:'fixture',url:'http://127.0.0.1:4177/demo',demo:true};
const point={type:'click',x:0.2,y:0.3};
test('contracts reject nonfinite and missing observation; accept normalized input',()=>{
 assert.equal(typeof validateDecision,'function');
 const d={commandId:'c',sessionId:'s',observationId:'o',revision:1,leaseId:'l',action:point,goal:'buy',target:'a',reason:'visible'};
 assert.equal(validateDecision(d).action.x,0.2);
 for(const x of [NaN,Infinity,-0.1,1.1])assert.throws(()=>validateDecision({...d,action:{...point,x}}));
 assert.throws(()=>validateDecision({...d,observationId:null}));
 assert.throws(()=>validateDecision({...d,action:{type:'eval',code:'x'}}));
});
test('D1 CAS preserves concurrent updates and survives new Store instance',async()=>{
 assert.equal(typeof Store,'function');const db=dbFixture(); const a=new Store(db),b=new Store(db);
 await a.create('test',{n:0});await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b).change('test',s=>{s.n++;return s.n;})));
 assert.equal((await new Store(db).read('test')).n,8);db.close();
});
async function setup(){const db=dbFixture(),store=new Store(db),pilot=new Pilot(store,{games:[game],allowFixture:true});
 const run=await pilot.startRun({gameIds:['fixture']});const session=await pilot.claimSession(run.id,'worker-0');return {db,store,pilot,run,session};}
async function observe(p,s,id='obs') {return p.observe(s.id,s.leaseId,{observationId:id,geometry:{clip:{x:0,y:0,width:1280,height:720},imageWidth:960,imageHeight:540,frameId:'main'},imageRef:'a.jpg',imageSha256:'a'.repeat(64),state:{screen:'base',visibleOptions:['buy'],roundPhase:'idle'},controls:[]});}
test('automatic recapture never invalidates a reviewer lease or a queued input',async()=>{
 const {db,pilot,run,session}=await setup();try{
 const raw=await observe(pilot,session);const [leased]=await pilot.getObservations(run.id,'reviewer');
 assert.equal(await pilot.captured(session.id,session.leaseId,{...raw,observationId:'auto-1'},{automatic:true}),null);
 assert.equal((await pilot.session(session.id)).observation.observationId,raw.observationId);
 const decision={commandId:'capture-guard',sessionId:session.id,observationId:leased.observationId,revision:leased.revision,leaseId:leased.decisionLease,action:point,goal:'spin',target:'spin',reason:'visible'};
 assert.equal((await pilot.submitDecisions([decision]))[0].ok,true);
 assert.equal(await pilot.captured(session.id,session.leaseId,{...raw,observationId:'auto-2'},{automatic:true}),null);
 assert.equal((await pilot.command(session.id,session.leaseId)).commandId,decision.commandId);
 await pilot.deferCommand(session.id,session.leaseId,decision.commandId,'screenshot timeout');
 assert.equal((await pilot.session(session.id)).commands[decision.commandId].result.notExecuted,true);
 assert.ok(await pilot.captured(session.id,session.leaseId,{...raw,observationId:'auto-3'},{automatic:true}));
 assert.ok((await pilot.session(session.id)).captureRequested);
 }finally{db.close();}
});
test('lease ownership excludes other workers and stale observations cannot execute',async()=>{
 assert.equal(typeof Pilot,'function');const {db,pilot,run,session}=await setup();
 assert.equal(await pilot.claimSession(run.id,'worker-1'),null);
 await observe(pilot,session);const batch=await pilot.getObservations(run.id,'reviewer');assert.equal(batch.length,1);
 const d={commandId:'c1',sessionId:session.id,observationId:'obs',revision:batch[0].revision,leaseId:batch[0].decisionLease,action:point,goal:'buy',target:'bonus',reason:'visible'};
 assert.equal((await pilot.submitDecisions([d]))[0].ok,true);
 assert.equal((await pilot.submitDecisions([d]))[0].duplicate,true);
 assert.equal((await pilot.submitDecisions([{...d,action:{...point,x:0.8}}]))[0].ok,false);
 const command=await pilot.command(session.id,session.leaseId);assert.equal(command.commandId,'c1');
 await pilot.issued(session.id,session.leaseId,'c1');
 await pilot.recover(Number.MAX_SAFE_INTEGER);
 const s=await pilot.store.read('session:'+session.id);assert.equal(s.commands.c1.status,'uncertain');assert.equal(s.phase,'uncertain');
 db.close();
});
test('batches return ready games without slow session; review lease expires safely',async()=>{
 assert.equal(typeof Pilot,'function');const db=dbFixture();let now=1000;
 const games=Array.from({length:8},(_,i)=>({...game,id:'g'+i}));const pilot=new Pilot(new Store(db),{games,allowFixture:true,clock:()=>now});
 const run=await pilot.startRun({gameIds:games.map(x=>x.id)});
 const sessions=[];for(let i=0;i<8;i++)sessions.push(await pilot.claimSession(run.id,'w'+Math.floor(i/2)));
 for(let i=0;i<7;i++)await observe(pilot,sessions[i],'obs'+i);
 const batch=await pilot.getObservations(run.id,'r1');assert.equal(batch.length,7);assert.equal(new Set(batch.map(x=>x.sessionId)).size,7);
 assert.equal((await pilot.getObservations(run.id,'r2')).length,0);now+=181000;
 const again=await pilot.getObservations(run.id,'r2');assert.equal(again.length,7);
 const d={commandId:'late',sessionId:sessions[0].id,observationId:'obs0',revision:1,leaseId:batch[0].decisionLease,action:point,goal:'navigate',target:'menu',reason:'visible'};
 assert.equal((await pilot.submitDecisions([d]))[0].ok,false);db.close();
});
test('BFS is semantic, per game, persists branches and leaves partial menus incomplete',async()=>{
 assert.equal(typeof Pilot,'function');const {db,pilot,session}=await setup();
 await observe(pilot,session);await observe(pilot,session,'obs2');
 const graph=await pilot.graph(session.id);assert.equal(graph.nodes.length,1);assert.equal(graph.complete,false);
 assert.equal(graph.frontier.length,1);assert.equal(graph.nodes[0].depth,0);db.close();
});
test('pause prevents queued input and stop has independent acknowledgments',async()=>{
 assert.equal(typeof Pilot,'function');const {db,pilot,run,session}=await setup();
 await pilot.control(run.id,'pause');assert.equal(await pilot.command(session.id,session.leaseId),null);
 const stopped=await pilot.control(run.id,'stop');await pilot.acknowledge(session.id,session.leaseId,'stopped',stopped.generation);
 const status=await pilot.status(run.id);assert.equal(status.state,'stopped');assert.equal(status.sessions[0].ack,'stopped');db.close();
});
test('speed escalates only between verified rounds and disables on uncertainty',()=>{
 assert.equal(typeof SpeedController,'function');const c=new SpeedController({compatible:true});
 for(let i=0;i<3;i++)c.recordTransition({verified:true,roundComplete:true});assert.equal(c.nextFactor(false),1);assert.equal(c.nextFactor(true),2);
 c.applied(2,'native');for(let i=0;i<3;i++)c.recordTransition({verified:true,roundComplete:true});assert.equal(c.nextFactor(true),4);
 c.recordTransition({uncertain:true});assert.equal(c.nextFactor(true),1);assert.equal(c.status().disabled,true);
 assert.throws(()=>c.requestFactor(8,true));assert.equal(new SpeedController().nextFactor(true),1);
});
test('observed click is not a verified purchase; reviewer verifies only current leased evidence',async()=>{
 const {db,pilot,session}=await setup();assert.equal(typeof pilot.reviewResults,'function');await observe(pilot,session);
 const [o]=await pilot.getObservations(session.runId,'r');const d={commandId:'buy1',sessionId:session.id,observationId:o.observationId,revision:o.revision,leaseId:o.decisionLease,action:point,goal:'buy',target:'bonus',reason:'visible'};
 assert.equal((await pilot.submitDecisions([d]))[0].ok,true);await pilot.issued(session.id,session.leaseId,'buy1');
 const after={...o,observationId:'after',imageRef:'b.jpg',state:{screen:'bonus',roundPhase:'idle',visibleOptions:['continue']}};
 await pilot.finish(session.id,session.leaseId,'buy1',{status:'observed',observation:after});assert.equal((await pilot.graph(session.id)).coverage.purchases.bonus,undefined);
 const [next]=await pilot.getObservations(session.runId,'r');const review={sessionId:session.id,commandId:'buy1',observationId:'after',leaseId:next.decisionLease,status:'verified',reason:'bonus completed; back to idle'};
 assert.equal((await pilot.reviewResults([{...review,leaseId:'old'}]))[0].ok,false);assert.equal((await pilot.reviewResults([review]))[0].ok,true);assert.equal((await pilot.graph(session.id)).coverage.purchases.bonus,'verified');db.close();
});
test('vision annotations classify unknown screens and checked replay omits uncertain actions',async()=>{
 const {db,pilot,session,run}=await setup();assert.equal(typeof pilot.annotate,'function');await observe(pilot,session);const [o]=await pilot.getObservations(run.id,'r');
 const result=await pilot.annotate([{sessionId:session.id,observationId:o.observationId,leaseId:o.decisionLease,state:{screen:'purchase-menu',roundPhase:'idle',visibleOptions:['bonus']}}]);assert.equal(result[0].ok,true);assert.equal((await pilot.session(session.id)).observation.state.screen,'purchase-menu');
 const replay=await pilot.startReplay(run.id);assert.ok(replay.id);assert.equal((await pilot.session(replay.sessions[0])).replaySteps.length,0);db.close();
});
test('ready batch fairness rotates a repeatedly ready first session',async()=>{
 const db=dbFixture();let now=1000;const pilot=new Pilot(new Store(db),{games:[game,{...game,id:'g2'}],allowFixture:true,clock:()=>now});const run=await pilot.startRun({gameIds:['fixture','g2']});const a=await pilot.claimSession(run.id,'w'),b=await pilot.claimSession(run.id,'w');await observe(pilot,a,'a');await observe(pilot,b,'b');
 const [first]=await pilot.getObservations(run.id,'r',1);now++;await observe(pilot,a,'a2');const [next]=await pilot.getObservations(run.id,'r',1);assert.notEqual(next.sessionId,first.sessionId);db.close();
});
test('replay advance resolves a unique fresh target and refuses a state mismatch',async()=>{
 const {db,pilot,session,run}=await setup();assert.equal(typeof pilot.advanceReplay,'function');
 await pilot.store.change('session:'+session.id,s=>{s.replaySteps=[{commandId:'source',target:'Menu',goal:'navigate',action:point,beforeState:{screen:'base'}}];});
 await observe(pilot,session);await pilot.store.change('session:'+session.id,s=>{s.observation.controls=[{label:'Menu',x:.6,y:.4,disabled:false}];});const [o]=await pilot.getObservations(run.id,'r');
 const r=await pilot.advanceReplay([{sessionId:session.id,observationId:o.observationId,leaseId:o.decisionLease}]);assert.equal(r[0].ok,true);const cmd=await pilot.command(session.id,session.leaseId);assert.equal(cmd.action.x,.6);db.close();
});
test('idle supervisor discovers runs; failed session preserves uncertainty and releases capacity',async()=>{
 const {db,pilot,session,run}=await setup();assert.equal(typeof pilot.availableRuns,'function');assert.ok((await pilot.availableRuns()).some(r=>r.id===run.id));assert.equal(typeof pilot.failSession,'function');
 await pilot.failSession(session.id,session.leaseId,'browser_closed');assert.equal((await pilot.session(session.id)).phase,'blocked');assert.equal((await pilot.run(run.id)).assignments[session.id].done,true);db.close();
});
test('status recovers a crashed worker lease and preserves its unconfirmed issued input',async()=>{
 const {db,pilot,session,run}=await setup();await observe(pilot,session);const [o]=await pilot.getObservations(run.id,'r');const d={commandId:'crash',sessionId:session.id,observationId:o.observationId,revision:o.revision,leaseId:o.decisionLease,action:point,goal:'buy',target:'bonus',reason:'visible'};await pilot.submitDecisions([d]);await pilot.issued(session.id,session.leaseId,'crash');pilot.clock=()=>Date.now()+61000;
 const status=await pilot.status(run.id);assert.equal(status.sessions[0].phase,'uncertain');assert.equal((await pilot.run(run.id)).assignments[session.id].done,true);db.close();
});
test('active bonus permits linked continuation, but no second purchase or premature purchase verification',async()=>{
 const {db,pilot,session,run}=await setup();await observe(pilot,session);const [o]=await pilot.getObservations(run.id,'r');const decision={commandId:'purchase',sessionId:session.id,observationId:o.observationId,revision:o.revision,leaseId:o.decisionLease,action:point,goal:'buy',target:'bonus',reason:'visible'};await pilot.submitDecisions([decision]);await pilot.issued(session.id,session.leaseId,'purchase');
 await pilot.finish(session.id,session.leaseId,'purchase',{status:'observed',observation:{...o,observationId:'bonus-screen',state:{screen:'bonus',roundPhase:'active',visibleOptions:['Continue']}}});const [after]=await pilot.getObservations(run.id,'r');
 const premature=await pilot.reviewResults([{sessionId:session.id,commandId:'purchase',observationId:after.observationId,leaseId:after.decisionLease,status:'verified',reason:'bonus still active'}]);assert.equal(premature[0].ok,false);
 const next={...decision,commandId:'continue',observationId:after.observationId,revision:after.revision,leaseId:after.decisionLease,goal:'continue',target:'Continue',roundCommandId:'purchase'};
 assert.equal((await pilot.submitDecisions([{...next,commandId:'second-purchase',goal:'buy'}]))[0].ok,false);assert.equal((await pilot.submitDecisions([next]))[0].ok,true);assert.equal((await pilot.graph(session.id)).coverage.purchases.bonus,undefined);db.close();
});
test('each pause generation requires a new matching runner acknowledgment',async()=>{
 const {db,pilot,session,run}=await setup();const first=await pilot.control(run.id,'pause');await pilot.acknowledge(session.id,session.leaseId,'paused',first.generation);assert.equal((await pilot.status(run.id)).sessions[0].ack,'paused');await pilot.control(run.id,'resume');const second=await pilot.control(run.id,'pause');assert.equal((await pilot.status(run.id)).sessions[0].ack,null);assert.notEqual(second.generation,first.generation);await assert.rejects(()=>pilot.acknowledge(session.id,session.leaseId,'paused',first.generation),/stale_control/);db.close();
});
test('visual annotation resolves the actual transition node without generic nodes or extra depth',async()=>{
 const {db,pilot,session,run}=await setup();await observe(pilot,session);const [before]=await pilot.getObservations(run.id,'r');const d={commandId:'menu',sessionId:session.id,observationId:before.observationId,revision:before.revision,leaseId:before.decisionLease,action:point,goal:'navigate',target:'Menu',reason:'visible'};await pilot.submitDecisions([d]);await pilot.issued(session.id,session.leaseId,'menu');await pilot.finish(session.id,session.leaseId,'menu',{status:'observed',observation:{...before,observationId:'visual-menu',state:{screen:'unclassified',roundPhase:'unknown',visibleOptions:[]}}});const [after]=await pilot.getObservations(run.id,'r');await pilot.annotate([{sessionId:session.id,observationId:after.observationId,leaseId:after.decisionLease,state:{screen:'purchase-menu',roundPhase:'idle',visibleOptions:['bonus']}}]);const graph=await pilot.graph(session.id);const edge=graph.edges.find(e=>e.commandId==='menu');assert.equal(graph.nodes.find(n=>n.id===edge.to).state.screen,'purchase-menu');assert.equal(graph.nodes.length,2);assert.equal(graph.nodes.find(n=>n.id===edge.to).depth,1);db.close();
});
test('replay export retains original pre-input image, geometry and classified state',async()=>{
 const {db,pilot,session,run}=await setup();await observe(pilot,session);const [before]=await pilot.getObservations(run.id,'r');const d={commandId:'trace',sessionId:session.id,observationId:before.observationId,revision:before.revision,leaseId:before.decisionLease,action:point,goal:'navigate',target:'Menu',reason:'visible'};await pilot.submitDecisions([d]);await pilot.issued(session.id,session.leaseId,'trace');await pilot.finish(session.id,session.leaseId,'trace',{status:'observed',observation:{...before,observationId:'after-trace',imageRef:'different.jpg'}});const bundle=await pilot.exportReplay(run.id),source=bundle.sessions[0].commands.trace.sourceObservation;assert.equal(source.imageRef,'a.jpg');assert.equal(source.geometry.imageWidth,960);assert.equal(source.state.screen,'base');db.close();
});
test('menu pages merge option discoveries and cannot erase an unpurchased earlier option',async()=>{
 const {db,pilot,session}=await setup();await pilot.coverage(session.id,{options:[{id:'A',disabled:false,pageId:'one'}],menuExhausted:false});await pilot.coverage(session.id,{options:[{id:'B',disabled:false,pageId:'two'}],menuExhausted:true});await pilot.store.change('session:'+session.id,s=>{s.coverage.purchases.B='verified';s.coverage.normalSpins=3;});const graph=await pilot.graph(session.id);assert.equal(graph.coverage.options.length,2);assert.equal(graph.complete,false);assert.deepEqual(graph.coverage.options.find(o=>o.id==='A').pages,['one']);db.close();
});
