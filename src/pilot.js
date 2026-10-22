import {id,requireValue,validateDecision,validateObservation,publicDemoUrl} from './contracts.js';
import {recordState,transition,graphView} from './graph.js';
import {validateQueue} from './queue.js';
const uuid=()=>crypto.randomUUID();
const leaseMs=60000,reviewMs=180000;
export class Pilot{
 constructor(store,{games=[],allowFixture=false,clock=()=>Date.now()}={}){this.store=store;this.games=games;this.allowFixture=allowFixture;this.clock=clock;}
 async startRun({gameIds},approvedGames=this.games){
  requireValue(Array.isArray(gameIds)&&gameIds.length>0&&gameIds.length<=64&&new Set(gameIds).size===gameIds.length,'select_1_to_64_unique_games');
  const games=await Promise.all(gameIds.map(async gameId=>{const g=approvedGames.find(x=>x.id===gameId),approval=await this.store.read('demo:'+gameId);requireValue(g&&(g.demo===true||approval),'unverified_demo');return {...g,demo:true,url:publicDemoUrl(g.url,{allowFixture:this.allowFixture})};}));
  const run={id:uuid(),state:'preparing',controlGeneration:0,createdAt:this.clock(),sessions:[],workers:4,gamesPerWorker:2,normalSpins:3};
  await this.store.create('run:'+run.id,run);
  for(const game of games){const s={id:uuid(),runId:run.id,game,phase:'pending',owner:null,leaseId:null,leaseUntil:0,revision:0,observation:null,commands:{},events:[],graph:{nodes:[],edges:[],frontier:[]},coverage:{purchases:{},normalSpins:0,menuExhausted:false,options:[]},speed:{factor:1},ack:null};await this.store.create('session:'+s.id,s);run.sessions.push(s.id);}
  await this.store.change('run:'+run.id,r=>{Object.assign(r,run,{state:'running'});});return {...run,state:'running'};
 }
 async startLinkRun(raw){
  const queue=validateQueue(raw),key='queue:'+queue.id,fingerprint=JSON.stringify(queue);
  if(!await this.store.create(key,{fingerprint,state:'preparing'})){
   const prior=await this.store.read(key);requireValue(prior.fingerprint===fingerprint,'queue_conflict');
   requireValue(prior.runId,'queue_preparing_or_interrupted_do_not_resubmit');return this.run(prior.runId);
  }
  const games=queue.urls.map((url,index)=>({id:queue.id+':'+index,provider:/(^|\.)pragmaticplay\.com$/.test(new URL(url).hostname)?'pragmatic':new URL(url).hostname,name:new URL(url).hostname+' / '+(index+1),url,demo:true,source:'user-confirmed-demo-queue',queueId:queue.id}));
  const run=await this.startRun({gameIds:games.map(g=>g.id)},games);
  await this.store.change(key,q=>{q.runId=run.id;q.state='ready';});return run;
 }
 async run(runId){id(runId);const r=await this.store.read('run:'+runId);requireValue(r,'run_not_found');return r;}
 async session(sessionId){id(sessionId);const s=await this.store.read('session:'+sessionId);requireValue(s,'session_not_found');return s;}
 guard(s,leaseId){requireValue(s.leaseId===leaseId&&s.leaseUntil>this.clock(),'session_lease_expired');}
 async claimSession(runId,owner){id(owner);const run=await this.run(runId);if(run.state!=='running')return null;
  // Owner is an authenticated supervisor slot. CAS on run enforces 4 slots x 2 games.
  const reservation=await this.store.change('run:'+runId,r=>{
   r.assignments??={};const entries=Object.values(r.assignments).filter(x=>!x.done);const owners=new Set(entries.map(x=>x.owner));
   if(!owners.has(owner)&&owners.size>=4)return null;if(entries.filter(x=>x.owner===owner).length>=2)return null;
   const sid=r.sessions.find(x=>!r.assignments[x]);if(!sid)return null;const token=uuid();r.assignments[sid]={owner,token};return {sid,token};
  });if(!reservation)return null;
  return this.store.change('session:'+reservation.sid,s=>{if(s.phase!=='pending')return null;s.owner=owner;s.leaseId=reservation.token;s.leaseUntil=this.clock()+leaseMs;s.phase='loading';return structuredClone(s);});
 }
 async renew(sessionId,leaseId){return this.store.change('session:'+id(sessionId),s=>{this.guard(s,leaseId);s.leaseUntil=this.clock()+leaseMs;return {leaseUntil:s.leaseUntil};});}
 async observe(sessionId,leaseId,raw){validateObservation(raw);return this.store.change('session:'+id(sessionId),s=>{
  this.guard(s,leaseId);requireValue(!Object.values(s.commands).some(c=>c.status==='queued'||c.status==='issued'),'command_pending');
  s.revision++;s.observation={...raw,sessionId:s.id,gameId:s.game.id,providerId:s.game.provider,revision:s.revision,capturedAt:this.clock(),decisionLease:null,decisionUntil:0};
  recordState(s,s.observation);if(s.phase!=='uncertain'&&s.phase!=='blocked')s.phase='observed';return s.observation;
 });}
 async getObservations(runId,reviewerId,limit=8){id(reviewerId);requireValue(Number.isInteger(limit)&&limit>=1&&limit<=8,'invalid_batch_limit');const run=await this.run(runId);const out=[];
  const ordered=await Promise.all(run.sessions.map(sid=>this.session(sid)));ordered.sort((a,b)=>(a.lastReviewAt||0)-(b.lastReviewAt||0));
  for(const snapshot of ordered){const sid=snapshot.id;if(out.length>=limit)break;const o=await this.store.change('session:'+sid,s=>{
   if(!s.observation||!['observed','waiting_decision','uncertain','blocked'].includes(s.phase)||s.observation.decisionUntil>this.clock())return null;
   s.observation.decisionLease=uuid();s.observation.decisionUntil=this.clock()+reviewMs;s.observation.reviewerId=reviewerId;s.lastReviewAt=this.clock();if(s.phase==='observed')s.phase='waiting_decision';return {...s.observation,phase:s.phase};
  });if(o)out.push(o);}return out;
 }
 async submitDecisions(decisions){requireValue(Array.isArray(decisions)&&decisions.length<=8,'invalid_batch');const results=[];for(const raw of decisions){try{const d=validateDecision(raw),run=await this.run((await this.session(d.sessionId)).runId);requireValue(run.state==='running','run_not_running');
   const result=await this.store.change('session:'+d.sessionId,s=>{
    const prior=s.commands[d.commandId];if(prior){requireValue(JSON.stringify(prior.decision)===JSON.stringify(d),'command_conflict');return {ok:true,commandId:d.commandId,duplicate:true,status:prior.status};}
    const o=s.observation;requireValue(s.leaseUntil>this.clock(),'session_lease_expired');requireValue(['observed','waiting_decision'].includes(s.phase),'session_not_ready');
    requireValue(o&&o.observationId===d.observationId&&o.revision===d.revision&&o.decisionLease===d.leaseId&&o.decisionUntil>this.clock(),'stale_observation');
    const pending=Object.values(s.commands).filter(c=>c.status==='observed'),round=s.commands[d.roundCommandId];
    const continuation=['continue','pick'].includes(d.goal)&&o.state.roundPhase==='active'&&round?.status==='observed'&&['buy','spin'].includes(round.goal);
    requireValue(pending.length===0||continuation,'review_previous_result_first');
    requireValue(o.state.screen!=='unclassified','classify_observation_first');
    requireValue(!['buy','spin'].includes(d.goal)||o.state.roundPhase==='idle','round_not_idle');
    requireValue(!Object.values(s.commands).some(c=>['queued','issued'].includes(c.status)),'session_busy');
    const {decisionLease,decisionUntil,reviewerId,...sourceObservation}=structuredClone(o);
    s.commands[d.commandId]={...d,decision:d,sourceObservation,nodeId:s.currentNode,status:'queued',queuedAt:this.clock()};s.phase='queued';o.decisionUntil=0;return {ok:true,commandId:d.commandId};
   });results.push(result);
  }catch(e){results.push({ok:false,commandId:raw?.commandId,code:e.message});}}return results;}
 async command(sessionId,leaseId){const s=await this.session(sessionId);this.guard(s,leaseId);const run=await this.run(s.runId);if(run.state!=='running')return null;return Object.values(s.commands).find(c=>c.status==='queued')||null;}
 async issued(sessionId,leaseId,commandId){const initial=await this.session(sessionId);requireValue((await this.run(initial.runId)).state==='running','run_not_running');return this.store.change('session:'+id(sessionId),s=>{
  this.guard(s,leaseId);const c=s.commands[commandId];requireValue(c?.status==='queued','command_not_queued');requireValue(c.revision===s.revision,'stale_observation');c.status='issued';c.issuedAt=this.clock();s.phase='executing';return {ok:true};
 });}
 async finish(sessionId,leaseId,commandId,result){requireValue(['observed','verified','uncertain','blocked'].includes(result.status),'invalid_result');return this.store.change('session:'+id(sessionId),s=>{
  this.guard(s,leaseId);const c=s.commands[commandId];requireValue(c,'command_not_found');if(c.status!=='issued')return {ok:false,code:'command_not_issued'};
  c.status=result.status;c.result=result;c.finishedAt=this.clock();if(result.observation){validateObservation(result.observation);s.revision++;s.observation={...result.observation,sessionId:s.id,gameId:s.game.id,providerId:s.game.provider,revision:s.revision,capturedAt:this.clock(),decisionUntil:0};recordState(s,s.observation);result.observation=structuredClone(s.observation);}
  transition(s,c,result);s.phase=['verified','observed'].includes(result.status)||result.notExecuted===true?'observed':result.status;s.events.push({type:'action',...c});return {ok:true};
 });}
 async recover(now=this.clock(),runId=null){const snapshots=runId?await Promise.all((await this.run(runId)).sessions.map(sid=>this.session(sid))):await this.store.list('session:');for(const s0 of snapshots)if(s0.leaseUntil&&s0.leaseUntil<=now){const token=await this.store.change('session:'+s0.id,s=>{
  if(s.leaseUntil>now||s.recoveredLease===s.leaseId)return null;
  for(const c of Object.values(s.commands))if(['queued','issued'].includes(c.status))c.status=c.status==='issued'?'uncertain':'blocked';
  if(!['stopped','completed'].includes(s.phase))s.phase=Object.values(s.commands).some(c=>c.status==='uncertain')?'uncertain':'blocked';
  s.recoveredLease=s.leaseId;return s.leaseId;
 });if(token)await this.store.change('run:'+s0.runId,r=>{if(r.assignments?.[s0.id]?.token===token)r.assignments[s0.id].done=true;});}}
 async control(runId,action){requireValue(['pause','resume','stop'].includes(action),'invalid_control');return this.store.change('run:'+id(runId),r=>{requireValue(r.state!=='stopped'||action==='stop','run_stopped');r.state={pause:'paused',resume:'running',stop:'stopped'}[action];r.controlGeneration=(r.controlGeneration||0)+1;return {state:r.state,generation:r.controlGeneration};});}
 async acknowledge(sessionId,leaseId,ack,generation){const initial=await this.session(sessionId),run=await this.run(initial.runId);requireValue(Number.isInteger(generation)&&generation===run.controlGeneration,'stale_control_generation');requireValue(ack===run.state,'incorrect_control_ack');return this.store.change('session:'+id(sessionId),s=>{this.guard(s,leaseId);s.ack=ack;s.ackGeneration=generation;return {ok:true};});}
 async graph(sessionId){return graphView(await this.session(sessionId));}
 async status(runId){await this.recover(this.clock(),runId);const r=await this.run(runId);const sessions=await Promise.all(r.sessions.map(async sid=>{const s=await this.session(sid);return {id:s.id,gameId:s.game.id,phase:s.phase,owner:s.owner,ack:s.ackGeneration===r.controlGeneration?s.ack:null,speed:s.speed,coverage:graphView(s)};}));return {...r,sessions};}
 async coverage(sessionId,{options,menuExhausted,expandedNodeId}){return this.store.change('session:'+id(sessionId),s=>{requireValue(Array.isArray(options)&&options.length<=100,'invalid_options');const merged=new Map(s.coverage.options.map(o=>[o.id,o]));for(const option of options){requireValue(typeof option.id==='string'&&option.id.length>0&&option.id.length<=200&&typeof option.disabled==='boolean','invalid_option');const old=merged.get(option.id),page=String(option.pageId||'default');merged.set(option.id,{...old,...option,disabled:old?old.disabled&&option.disabled:option.disabled,currentlyDisabled:option.disabled,pages:[...new Set([...(old?.pages||[]),page])]});}s.coverage.options=[...merged.values()];s.coverage.menuExhausted=menuExhausted===true;if(expandedNodeId){const n=s.graph.nodes.find(x=>x.id===expandedNodeId);requireValue(n,'node_not_found');n.expanded=true;s.graph.frontier=s.graph.frontier.filter(x=>x!==n.id);}return graphView(s);});}
 async requestObservation(sessionId,detail=false){return this.store.change('session:'+id(sessionId),s=>{s.captureRequested={detail};return {ok:true};});}
 async speed(sessionId,factor){requireValue([1,2,4].includes(factor),'unsupported_factor');return this.store.change('session:'+id(sessionId),s=>{s.speed.requestedFactor=factor;return s.speed;});}
 async runnerEvent(sessionId,leaseId,event){return this.store.change('session:'+id(sessionId),s=>{this.guard(s,leaseId);requireValue(JSON.stringify(event).length<8000,'event_too_large');s.events.push({...event,at:this.clock()});if(event.type==='speed')s.speed={...s.speed,...event};return {ok:true};});}
 async exportReplay(runId){const r=await this.run(runId);return {version:1,run:r,sessions:await Promise.all(r.sessions.map(sid=>this.session(sid))),notice:'Inputs are reproducible; random rewards are not.'};}
 checkReview(s,a){const o=s.observation;requireValue(o&&o.observationId===a.observationId&&o.decisionLease===a.leaseId&&o.decisionUntil>this.clock(),'stale_observation');return o;}
 async annotate(annotations){const out=[];for(const a of annotations){try{out.push(await this.store.change('session:'+id(a.sessionId),s=>{const o=this.checkReview(s,a);requireValue(a.state&&typeof a.state.screen==='string'&&['idle','active','unknown'].includes(a.state.roundPhase),'invalid_state');requireValue(JSON.stringify(a.state).length<16000,'state_too_large');o.state=a.state;recordState(s,o);for(const c of Object.values(s.commands))if(c.result?.observation?.observationId===o.observationId)c.result.observation=structuredClone(o);s.events.push({type:'classification',observationId:o.observationId,state:a.state,nodeId:o.nodeId,at:this.clock()});return {ok:true,sessionId:s.id};}));}catch(e){out.push({ok:false,sessionId:a.sessionId,code:e.message});}}return out;}
 async reviewResults(reviews){const out=[];for(const a of reviews){try{out.push(await this.store.change('session:'+id(a.sessionId),s=>{this.checkReview(s,a);requireValue(['verified','blocked'].includes(a.status)&&typeof a.reason==='string'&&a.reason.length>0&&a.reason.length<=1000,'invalid_review');const c=s.commands[a.commandId];requireValue(c&&c.status==='observed','no_observed_result');
   requireValue(!(a.status==='verified'&&['buy','spin'].includes(c.goal))||s.observation.state.roundPhase==='idle','round_not_complete');
   c.status=a.status;c.review={...a,at:this.clock()};const edge=s.graph.edges.find(x=>x.commandId===c.commandId);if(edge)edge.status=a.status;
   if(a.status==='verified'){if(c.goal==='buy')s.coverage.purchases[c.target]='verified';if(c.goal==='spin')s.coverage.normalSpins++;}s.events.push({type:'review',...a,at:this.clock()});s.phase=a.status==='verified'?'waiting_decision':'blocked';return {ok:true,commandId:c.commandId};}));}catch(e){out.push({ok:false,commandId:a.commandId,code:e.message});}}return out;}
 async reconcile(a){return this.store.change('session:'+id(a.sessionId),s=>{this.checkReview(s,a);const c=s.commands[a.commandId];requireValue(c&&['uncertain','blocked'].includes(c.status),'no_uncertain_result');requireValue(['verified','blocked'].includes(a.status)&&a.reason.length<=1000,'invalid_reconciliation');c.status=a.status;c.review={...a,at:this.clock()};if(a.status==='verified'){if(c.goal==='buy')s.coverage.purchases[c.target]='verified';if(c.goal==='spin')s.coverage.normalSpins++;}s.events.push({type:'reconciliation',...a,at:this.clock()});s.phase='observed';return {ok:true};});}
 async startReplay(sourceRunId){const bundle=await this.exportReplay(sourceRunId);const replay=await this.startRun({gameIds:bundle.sessions.map(s=>s.game.id)},bundle.sessions.map(s=>s.game));for(let i=0;i<bundle.sessions.length;i++){const source=bundle.sessions[i];await this.store.change('session:'+replay.sessions[i],s=>{s.replaySteps=Object.values(source.commands).filter(c=>c.status==='verified').sort((a,b)=>a.queuedAt-b.queuedAt).map(c=>({...c,beforeState:source.graph.nodes.find(n=>n.id===c.nodeId)?.state}));s.replaySource=sourceRunId;});}return replay;}
 async complete(sessionId){const s=await this.session(sessionId);requireValue(graphView(s).complete,'coverage_incomplete');await this.store.change('session:'+s.id,x=>{requireValue(!Object.values(x.commands).some(c=>['queued','issued','observed'].includes(c.status)),'command_pending');x.phase='completed';});await this.store.change('run:'+s.runId,r=>{if(r.assignments?.[s.id])r.assignments[s.id].done=true;});return {ok:true};}
 async runnerState(sessionId,leaseId){const s=await this.session(sessionId);this.guard(s,leaseId);const run=await this.run(s.runId);return {runState:run.state,controlGeneration:run.controlGeneration,phase:s.phase,captureRequested:s.captureRequested,speed:s.speed,observation:s.observation,replaySteps:s.replaySteps,verifiedRounds:Object.values(s.commands).filter(c=>['buy','spin'].includes(c.goal)&&c.status==='verified').length};}
 async captured(sessionId,leaseId,raw){const result=await this.observe(sessionId,leaseId,raw);await this.store.change('session:'+sessionId,s=>{this.guard(s,leaseId);s.captureRequested=null;});return result;}
 async approveDemo(gameId,evidence){id(gameId);const game=this.games.find(x=>x.id===gameId);requireValue(game,'game_not_found');requireValue(typeof evidence==='string'&&evidence.length>=10&&evidence.length<=1000,'demo_evidence_required');publicDemoUrl(game.url,{allowFixture:this.allowFixture});await this.store.create('demo:'+gameId,{gameId,evidence,approvedAt:this.clock()});return {ok:true,gameId,scope:'catalogue_launch_and_fictitious_demo_only'};}
 async availableRuns(){return (await this.store.list('run:')).filter(r=>r.state==='running').map(r=>({id:r.id,createdAt:r.createdAt}));}
 async failSession(sessionId,leaseId,reason){const s=await this.session(sessionId);await this.store.change('session:'+id(sessionId),x=>{this.guard(x,leaseId);for(const c of Object.values(x.commands))if(['queued','issued'].includes(c.status))c.status=c.status==='issued'?'uncertain':'blocked';x.phase=Object.values(x.commands).some(c=>c.status==='uncertain')?'uncertain':'blocked';x.events.push({type:'failure',reason:String(reason).slice(0,300),at:this.clock()});x.leaseUntil=this.clock();});await this.store.change('run:'+s.runId,r=>{if(r.assignments?.[s.id])r.assignments[s.id].done=true;});return {ok:true};}
 async advanceReplay(requests){const results=[];for(const a of requests){try{
  const s=await this.session(a.sessionId),o=this.checkReview(s,a);requireValue(Array.isArray(s.replaySteps),'not_a_replay');requireValue(!Object.values(s.commands).some(c=>c.status!=='verified'),'review_previous_replay_step');
  const index=Object.keys(s.commands).length,step=s.replaySteps[index];if(!step){results.push({ok:true,sessionId:s.id,complete:true});continue;}
  requireValue(step.beforeState?.screen&&step.beforeState.screen!=='unclassified'&&o.state.screen===step.beforeState.screen,'replay_state_mismatch');
  const matches=o.controls.filter(c=>c.label===step.target&&!c.disabled);requireValue(matches.length===1,'replay_target_not_unique_request_visual_review');
  const target=matches[0],decision={commandId:'replay-'+index+'-'+s.runId,sessionId:s.id,observationId:o.observationId,revision:o.revision,leaseId:o.decisionLease,action:{...step.action,...(['click','move','drag'].includes(step.action.type)?{x:target.x,y:target.y}:{})},goal:step.goal,target:step.target,reason:'checked replay target in fresh observation'};
  results.push((await this.submitDecisions([decision]))[0]);
 }catch(e){results.push({ok:false,sessionId:a.sessionId,code:e.message});}}return results;}
}
