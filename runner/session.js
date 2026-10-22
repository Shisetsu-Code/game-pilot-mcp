import {captureObservation,selectGameFrame} from './capture.js';import {executeInput} from './input.js';import {SpeedController,applyAnimationSpeed} from './speed.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function openDemo(page,game){
 await page.goto(game.url,{waitUntil:'domcontentloaded',timeout:45000});
 // Only known catalogue launch/consent controls; game actions are always MCP-reviewed.
 if(game.provider==='pragmatic'){
  const reject=page.getByRole('button',{name:/reject all|reject cookies/i});if(await reject.count()===1)await reject.click({timeout:2000}).catch(()=>{});
  const age=page.getByRole('button',{name:/^i am (over )?18|^yes,? i am (over )?18/i});if(await age.count()===1)await age.click({timeout:2000}).catch(()=>{});
  const demo=page.getByRole('button',{name:/^play demo$/i}).or(page.getByRole('link',{name:/^play demo$/i}));if(await demo.count()===1)await demo.click({timeout:10000});
 }
 await page.waitForTimeout(750);
}
export async function runSession(browser,client,session,{signal,onState=()=>{}}={}){
 const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(4000);
 const base={sessionId:session.id,leaseId:session.leaseId};let localObservation=null,lastHeartbeat=0;
 const speed=new SpeedController({compatible:false});let lastVerified=0;
 async function publish(detail=false){const shot=await captureObservation(page,{detail});await client.upload(shot.observation.imageRef,shot.imageBytes);localObservation=await client.call('observe',{...base,observation:shot.observation});return shot;}
 try{
  await openDemo(page,session.game);await publish();onState({type:'session_ready',sessionId:session.id});
  while(!signal?.aborted){
   if(Date.now()-lastHeartbeat>15000){await client.call('renew',base);lastHeartbeat=Date.now();}
   const state=await client.call('state',base);if(state.runState==='stopped'){await client.call('ack',{...base,ack:'stopped'});break;}
   if(state.phase==='completed')break;
   if(state.runState==='paused'){await client.call('ack',{...base,ack:'paused'});await sleep(500);continue;}
   if(state.captureRequested){await publish(state.captureRequested.detail);continue;}
   // Compatibility is explicit: animations only when the inspected frame exposes them.
   const selected=await selectGameFrame(page);const count=await selected.frame.evaluate(()=>document.getAnimations().length);if(count>0&&!speed.disabled)speed.compatible=true;
   const idle=state.observation?.state.roundPhase==='idle';
   if(state.verifiedRounds>lastVerified){for(let i=lastVerified;i<state.verifiedRounds;i++)speed.recordTransition({verified:true,roundComplete:true});lastVerified=state.verifiedRounds;}
   if(['uncertain','blocked'].includes(state.phase))speed.recordTransition({uncertain:true});
   const requested=state.speed.requestedFactor;let factor=speed.nextFactor(idle);
   if(requested!==undefined){try{factor=speed.requestFactor(requested,idle);}catch{factor=speed.factor;}}
   if(factor!==speed.factor){const result=await applyAnimationSpeed(selected.frame,factor);speed.applied(factor,result.method);await client.call('event',{...base,event:{type:'speed',...speed.status(),reason:speed.reason||'verified_rounds'}});}
   const command=await client.call('command',base);
   if(!command){await sleep(200);continue;}
   if(!localObservation||command.observationId!==localObservation.observationId)throw Error('runner_observation_mismatch');
   try{
    const result=await executeInput(page,command,localObservation,{issued:()=>client.call('issued',{...base,commandId:command.commandId})});
    if(result.imageBytes){await client.upload(result.observation.imageRef,result.imageBytes);delete result.imageBytes;}
    await client.call('finish',{...base,commandId:command.commandId,result});localObservation=result.observation||localObservation;
   }catch(error){await client.call('event',{...base,event:{type:'input_error',commandId:command.commandId,error:error.message}}).catch(()=>{});throw error;}
  }
 }finally{await context.close();}
}
