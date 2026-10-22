import {captureObservation,selectGameFrame} from './capture.js';import {executeInput} from './input.js';import {SpeedController,applyAnimationSpeed} from './speed.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function setupClick(locator,label,onEvent){if(await locator.count()!==1||!(await locator.isVisible()))return false;const box=await locator.boundingBox();if(!box)return false;await onEvent({type:'setup_input',label,action:'click',position:{x:box.x+box.width/2,y:box.y+box.height/2},at:Date.now()});await locator.click({timeout:4000});return true;}
export async function dismissCatalogueOverlay(page,onEvent=async()=>{}){return setupClick(page.getByRole('button',{name:/^reject all$|^reject cookies$/i}),'catalogue.reject-cookies',onEvent);}
export async function openDemo(page,game,onEvent=async()=>{}){
 await onEvent({type:'navigation',url:game.url.split('?')[0],at:Date.now()});
 await page.goto(game.url,{waitUntil:'domcontentloaded',timeout:45000});
 // Only known catalogue launch/consent controls; game actions are always MCP-reviewed.
 if(game.provider==='pragmatic'){
  await dismissCatalogueOverlay(page,onEvent);
  const age=page.getByRole('button',{name:/^i am (over )?18|^yes,? i am (over )?18/i});await setupClick(age,'catalogue.adult-confirmation',onEvent);
  const demo=page.getByRole('button',{name:/^play demo$/i}).or(page.getByRole('link',{name:/^play demo$/i}));await setupClick(demo,'catalogue.play-demo',onEvent);
 }
 await page.waitForTimeout(750);
}
export async function runSession(browser,client,session,{signal,onState=()=>{}}={}){
 const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(4000);
 const base={sessionId:session.id,leaseId:session.leaseId};let localObservation=null,localImage=null,lastHeartbeat=0;
 const speed=new SpeedController({compatible:false});let lastVerified=0,appliedFactor=1,pageErrors=0,lastControlGeneration=null;
 page.on('pageerror',()=>pageErrors++);
 const setupEvent=event=>client.call('event',{...base,event});
 async function publish(detail=false){if(session.game.provider==='pragmatic')await dismissCatalogueOverlay(page,setupEvent);const shot=await captureObservation(page,{detail});await client.upload(shot.observation.imageRef,shot.imageBytes);localObservation=await client.call('observe',{...base,observation:shot.observation});localImage=shot.imageBytes;return shot;}
 try{
  await openDemo(page,session.game,setupEvent);await client.call('renew',base);await publish();onState({type:'session_ready',sessionId:session.id});
  while(!signal?.aborted){
   if(Date.now()-lastHeartbeat>15000){await client.call('renew',base);lastHeartbeat=Date.now();}
   const state=await client.call('state',base);
   if(state.controlGeneration!==lastControlGeneration){try{await client.call('ack',{...base,ack:state.runState,generation:state.controlGeneration});lastControlGeneration=state.controlGeneration;}catch(error){if(error.message==='stale_control_generation')continue;throw error;}}
   if(state.runState==='stopped')break;
   if(state.phase==='completed')break;
   if(state.runState==='paused'){await sleep(500);continue;}
   if(state.captureRequested){await publish(state.captureRequested.detail);continue;}
   // Compatibility is explicit: animations only when the inspected frame exposes them.
   const selected=await selectGameFrame(page);const count=await selected.frame.evaluate(()=>document.getAnimations().length);if(count>0&&!speed.disabled)speed.compatible=true;
   const idle=state.observation?.state.roundPhase==='idle';
   if(state.verifiedRounds>lastVerified){for(let i=lastVerified;i<state.verifiedRounds;i++)speed.recordTransition({verified:true,roundComplete:true});lastVerified=state.verifiedRounds;}
   if(['uncertain','blocked'].includes(state.phase))speed.recordTransition({uncertain:true});
   if(pageErrors&&appliedFactor>1)speed.recordTransition({error:'page_error_during_acceleration'});pageErrors=0;
   const requested=state.speed.requestedFactor;let factor=speed.nextFactor(idle);
   if(requested!==undefined){try{factor=speed.requestFactor(requested,idle);}catch{factor=speed.factor;}}
   if(factor!==appliedFactor||(appliedFactor>1&&count>0)){const changed=factor!==appliedFactor;const result=await applyAnimationSpeed(selected.frame,factor);speed.applied(factor,result.method);appliedFactor=factor;if(changed)await client.call('event',{...base,event:{type:'speed',...speed.status(),reason:speed.reason||'verified_rounds'}});}
   const command=await client.call('command',base);
   if(!command){await sleep(200);continue;}
   if(!localObservation||command.observationId!==localObservation.observationId)throw Error('runner_observation_mismatch');
   try{
    if(session.game.provider==='pragmatic')await dismissCatalogueOverlay(page,setupEvent);
    const result=await executeInput(page,command,localObservation,{issued:()=>client.call('issued',{...base,commandId:command.commandId})},{sourceImage:localImage});
    if(result.imageBytes){await client.upload(result.observation.imageRef,result.imageBytes);localImage=result.imageBytes;delete result.imageBytes;}
    await client.call('finish',{...base,commandId:command.commandId,result});localObservation=result.observation||localObservation;
   }catch(error){await client.call('event',{...base,event:{type:'input_error',commandId:command.commandId,error:error.message}}).catch(()=>{});throw error;}
  }
 }finally{await context.close();}
}
