import {fork} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {CloudClient} from './cloud-client.js';
import {openDemo,prepareCatalogue} from './session.js';
import {captureObservation} from './capture.js';
const out='artifacts/cloud-probe';await mkdir(out,{recursive:true});
const cleanUrl=raw=>{try{const u=new URL(raw);return u.origin+u.pathname;}catch{return String(raw).slice(0,200);}};
const cleanError=error=>String(error?.message||error).replace(/https?:\/\/[^\s)"']+/g,cleanUrl).slice(0,600);
if(!process.env.PILOT_URL||!process.env.PILOT_RUNNER_TOKEN||!process.env.PILOT_RUN_ID)throw Error('Probe requires an explicit cloud run');
if(process.env.WG_CONFIG)throw Error('This diagnostic is explicitly without VPN');
if(process.argv[2]==='--worker'){
 const index=Number(process.argv[3]),browser=await chromium.launch({headless:true});
 const client=new CloudClient({url:process.env.PILOT_URL,token:process.env.PILOT_RUNNER_TOKEN});
 try{await Promise.all([0,1].map(async()=>{for(;;){
  const session=await client.call('claim',{runId:process.env.PILOT_RUN_ID,owner:'worker-'+index});if(!session)break;
  const base={sessionId:session.id,leaseId:session.leaseId},started=Date.now(),report={sessionId:session.id,worker:index,url:session.game.url,startedAt:new Date().toISOString(),actions:'catalogue-launch-only',purchases:0,spins:0};
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(4000);
  const errors=[];page.on('pageerror',e=>{if(errors.length<8)errors.push(cleanError(e));});
  page.on('response',r=>{if(r.request().isNavigationRequest()&&r.frame()===page.mainFrame())report.httpStatus=r.status();});
  const heartbeat=setInterval(()=>client.call('renew',base).catch(()=>{}),10000);
  try{
   await openDemo(page,session.game,event=>client.call('event',{...base,event}));
   await page.waitForTimeout(12000);
   if(await prepareCatalogue(page,event=>client.call('event',{...base,event})))await page.waitForTimeout(12000);
   const shot=await captureObservation(page);await client.upload(shot.observation.imageRef,shot.imageBytes);await client.call('observe',{...base,observation:shot.observation});
   await writeFile(out+'/'+session.id+'.jpg',shot.imageBytes);
   Object.assign(report,{captured:true,title:await page.title(),finalUrl:cleanUrl(page.url()),frames:page.frames().map(f=>cleanUrl(f.url())),imageRef:shot.observation.imageRef,controls:shot.observation.controls.map(c=>c.label),visibleText:(await page.locator('body').innerText({timeout:3000}).catch(()=>'' )).slice(0,1500)});
  }catch(error){report.captured=false;report.error=cleanError(error);}
  finally{
   clearInterval(heartbeat);await context.close();report.elapsedMs=Date.now()-started;report.pageErrors=errors;
   await client.call('failure',{...base,reason:report.captured?'diagnostic_capture_complete_no_gameplay_verified':report.error}).catch(e=>{report.closeError=cleanError(e);});
   await writeFile(out+'/'+session.id+'.json',JSON.stringify(report,null,2));process.send?.({type:'result',report});
  }
 }}));}finally{await browser.close();process.disconnect?.();}
}else{
 const reports=[],children=[];
 await Promise.all(Array.from({length:4},(_,index)=>new Promise((resolve,reject)=>{
  const child=fork(new URL(import.meta.url),['--worker',String(index)],{windowsHide:true,stdio:['ignore','inherit','inherit','ipc']});children.push(child);
  child.on('message',message=>{if(message.type==='result'){reports.push(message.report);console.log(JSON.stringify({completed:reports.length,captured:message.report.captured,worker:index}));}});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('probe_worker_exit_'+code)));
 })));
 const report={runId:process.env.PILOT_RUN_ID,network:'direct-no-vpn',workers:4,gamesPerWorker:2,purchases:0,spins:0,checkedAt:new Date().toISOString(),games:reports};
 const client=new CloudClient({url:process.env.PILOT_URL,token:process.env.PILOT_RUNNER_TOKEN});await client.call('report',{runId:report.runId,report});
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({total:reports.length,captured:reports.filter(r=>r.captured).length}));
 if(reports.length!==20)process.exitCode=1;
}
