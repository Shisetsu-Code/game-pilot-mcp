import {captureObservation,selectGameFrame} from './capture.js';import {executeInput} from './input.js';import {SpeedController,applyAnimationSpeed} from './speed.js';
import {captureContinuously,isTransientCaptureError,isTerminalDocumentStatus} from './capture-retry.js';
import {keepPageActive} from './activity.js';
import {optionalFrameRead} from './frame-read.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const catalogueHosts=new Set(['pragmaticplay.com','www.pragmaticplay.com','belatragames.com','www.belatragames.com','3oaks.com','www.3oaks.com','games.evolution.com','rubyplay.com','www.rubyplay.com','amusnet.com','www.amusnet.com','playngo.com','www.playngo.com','yggdrasilgaming.com','www.yggdrasilgaming.com']);
async function setupClick(locator,label,onEvent){
 const startedAt=Date.now();let box;
 try{if(await locator.count()!==1||!(await locator.isVisible()))return false;box=await locator.boundingBox();}catch(error){await onEvent({type:'setup_blocked',label,reason:error.message.split('\n')[0]});return false;}
 if(!box)return false;
 await onEvent({type:'setup_input',label,action:'click',position:{x:box.x+box.width/2,y:box.y+box.height/2},at:Date.now()});
 const inputStartedAt=Date.now();
 try{await locator.click({timeout:1200});await onEvent({type:'setup_result',label,status:'clicked',at:Date.now(),elapsedMs:Date.now()-startedAt,inputMs:Date.now()-inputStartedAt});return true;}
 catch(error){await onEvent({type:'setup_blocked',label,reason:error.message.split('\n')[0],elapsedMs:Date.now()-startedAt});return false;}
}
export async function dismissCatalogueOverlay(page,onEvent=async()=>{}){
 return setupClick(page.getByRole('button',{name:/^reject all$|^reject cookies$|^decline all$|^rechazar todas(?: las cookies)?$|^rechazar todo$/i}),'catalogue.reject-cookies',onEvent);
}
export async function prepareCatalogue(page,onEvent=async()=>{}){
 let changed=await dismissCatalogueOverlay(page,onEvent);
 if(!catalogueHosts.has(new URL(page.url()).hostname))return changed;
 // Parent consent overlays can remain visible above an already-created game iframe.
 const name=/^yes,? i(?: am|'m) (?:18|21)(?:\+| years (?:or older|old or older|old))?$|^i am (?:over )?(?:18|21)(?:\+| years old)?$|^sí,? tengo 18 años o más$/i;
 const age=page.getByRole('button',{name}).or(page.getByRole('link',{name}));
 if(await setupClick(age,'catalogue.adult-confirmation',onEvent))changed=true;
 const demoName=/^play demo$|^demo$|^jugar demo$|^jugar ahora$|^try demo$|^demo play$/i;
 const demo=page.getByRole('button',{name:demoName}).or(page.getByRole('link',{name:demoName}));
 // A visible game frame means launch succeeded; do not relaunch it on later captures.
 if((await selectGameFrame(page)).frame===page.mainFrame()&&await setupClick(demo,'catalogue.play-demo',onEvent))changed=true;
 return changed;
}
export async function openDemo(page,game,onEvent=async()=>{}){
 await onEvent({type:'navigation',url:game.url.split('?')[0],at:Date.now()});
 try{await page.goto(game.url,{waitUntil:'domcontentloaded',timeout:45000});}catch(error){if(!isTransientCaptureError(error))throw error;await onEvent({type:'navigation_wait',reason:error.message.split('\n')[0]});}
 await prepareCatalogue(page,onEvent);
 await page.waitForTimeout(750);
}
export async function runSession(browser,client,session,{signal,onState=()=>{}}={}){
 const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(4000);
 const base={sessionId:session.id,leaseId:session.leaseId};let localObservation=null,localImage=null,lastHeartbeat=0,lastCaptureAt=0,leaseError=null;
 const documentStatus=new Map();page.on('response',response=>{if(response.request().resourceType()==='document')documentStatus.set(response.frame(),response.status());});
 const terminal=()=>{const main=documentStatus.get(page.mainFrame()),game=documentStatus.get(page.frames()[localObservation?.geometry.frameIndex]);return isTerminalDocumentStatus(main)?main:isTerminalDocumentStatus(game)?game:null;};
 const heartbeat=setInterval(()=>client.call('renew',base).catch(error=>{leaseError=error;}),10000);
 const speed=new SpeedController({compatible:false});let lastVerified=0,appliedFactor=1,pageErrors=0,lastControlGeneration=null;
 page.on('pageerror',()=>pageErrors++);
 const setupEvent=event=>client.call('event',{...base,event});
 async function publish(detail=false,automatic=false){
  const shot=await captureContinuously(()=>captureObservation(page,{detail}),{signal,terminal,onRetry:async retry=>{if(leaseError)throw leaseError;await setupEvent({type:'capture_wait',...retry});let state=await client.call('state',base);while(state.runState==='paused'&&!signal?.aborted){await sleep(1000);state=await client.call('state',base);}if(state.runState==='stopped')throw Error('capture_stopped');}});
  await client.upload(shot.observation.imageRef,shot.imageBytes);const observed=await client.call('observe',{...base,observation:shot.observation,automatic});lastCaptureAt=Date.now();if(observed){localObservation=observed;localImage=shot.imageBytes;}return shot;
 }
 try{
  await keepPageActive(page);
  await setupEvent({type:'browser_activity_policy',focusEmulation:true,backgroundThrottling:false});
  await openDemo(page,session.game,setupEvent);await client.call('renew',base);await prepareCatalogue(page,setupEvent);await publish();onState({type:'session_ready',sessionId:session.id});
  while(!signal?.aborted){
   if(leaseError)throw leaseError;
   if(terminal()){await publish();throw Error('terminal_http_'+terminal());}
   if(Date.now()-lastHeartbeat>15000){await client.call('renew',base);lastHeartbeat=Date.now();}
   const {state,command}=await client.call('poll',base);
   if(state.controlGeneration!==lastControlGeneration){try{await client.call('ack',{...base,ack:state.runState,generation:state.controlGeneration});lastControlGeneration=state.controlGeneration;}catch(error){if(error.message==='stale_control_generation')continue;throw error;}}
   if(state.runState==='stopped')break;
   if(state.phase==='completed')break;
   if(state.runState==='paused'){await sleep(500);continue;}
   if(state.captureRequested&&!['queued','executing'].includes(state.phase)){await prepareCatalogue(page,setupEvent);await publish(state.captureRequested.detail);continue;}
   const waitingCapture=state.phase==='uncertain'||['unclassified','loading','intro'].includes(state.observation?.state.screen)||state.observation?.state.roundPhase==='active';
   if(waitingCapture&&!['queued','executing','blocked'].includes(state.phase)&&!(state.observation?.decisionUntil>Date.now())&&Date.now()-lastCaptureAt>=5000){await prepareCatalogue(page,setupEvent);await publish(false,true);continue;}
   // Compatibility is explicit: animations only when the inspected frame exposes them.
   let count=0,selected;
   if(state.verifiedRounds>=3||appliedFactor>1){selected=await selectGameFrame(page);count=await optionalFrameRead(selected.frame,()=>document.getAnimations().length,0);if(count>0&&!speed.disabled)speed.compatible=true;}
   const idle=state.observation?.state.roundPhase==='idle';
   if(state.verifiedRounds>lastVerified){for(let i=lastVerified;i<state.verifiedRounds;i++)speed.recordTransition({verified:true,roundComplete:true});lastVerified=state.verifiedRounds;}
   if(['uncertain','blocked'].includes(state.phase))speed.recordTransition({uncertain:true});
   if(pageErrors&&appliedFactor>1)speed.recordTransition({error:'page_error_during_acceleration'});pageErrors=0;
   const requested=state.speed.requestedFactor;let factor=speed.nextFactor(idle);
   if(requested!==undefined){try{factor=speed.requestFactor(requested,idle);}catch{factor=speed.factor;}}
   if(factor!==appliedFactor||(appliedFactor>1&&count>0)){const changed=factor!==appliedFactor;const result=await applyAnimationSpeed(selected.frame,factor);speed.applied(factor,result.method);appliedFactor=factor;if(changed)await client.call('event',{...base,event:{type:'speed',...speed.status(),reason:speed.reason||'verified_rounds'}});}
   if(!command){await sleep(200);continue;}
   if(!localObservation||command.observationId!==localObservation.observationId)throw Error('runner_observation_mismatch');
   try{
    if(session.game.provider==='pragmatic')await dismissCatalogueOverlay(page,setupEvent);
    const result=await executeInput(page,command,localObservation,{issued:()=>client.call('issued',{...base,commandId:command.commandId})},{sourceImage:localImage});
    if(result.imageBytes){await client.upload(result.observation.imageRef,result.imageBytes);localImage=result.imageBytes;delete result.imageBytes;}
    await client.call('finish',{...base,commandId:command.commandId,result});localObservation=result.observation||localObservation;
   }catch(error){await client.call('event',{...base,event:{type:'input_error',commandId:command.commandId,error:error.message}}).catch(()=>{});
    if(isTransientCaptureError(error)||/^(geometry_changed|control_changed|visual_target_changed|canvas_changed_request_new_observation|visual_geometry_changed)$/.test(error.message)){
     const queued=await client.call('command',base);if(queued?.commandId===command.commandId)await client.call('defer',{...base,commandId:command.commandId,reason:error.message});
     else await client.call('finish',{...base,commandId:command.commandId,result:{status:'uncertain',error:error.message}});
     continue;
    }throw error;}
  }
 }finally{clearInterval(heartbeat);await context.close();}
}
