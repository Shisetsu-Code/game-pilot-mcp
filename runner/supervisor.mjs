import {fork} from 'node:child_process';import {pathToFileURL} from 'node:url';import {chromium} from 'playwright';import {CloudClient} from './cloud-client.js';import {runSession} from './session.js';
import {activeBrowserArgs} from './activity.js';
export function validateSupervisorConfig({workers=4,gamesPerWorker=2}={}){if(workers!==4||gamesPerWorker!==2)throw Error('requires_four_workers_two_games');return {workers,gamesPerWorker};}
export function startSupervisor(config={}){
 validateSupervisorConfig(config);const children=[];for(let i=0;i<4;i++){const child=fork(new URL('./supervisor.mjs',import.meta.url),['--worker',String(i)],{windowsHide:true,env:config.env||process.env,stdio:['ignore','inherit','inherit','ipc']});children.push(child);}
 return {children,stop(){for(const c of children)if(c.connected)c.send({type:'stop'});},status(){return children.map(c=>({pid:c.pid,exitCode:c.exitCode}));}};
}
async function worker(index){const controller=new AbortController();
 const client=new CloudClient({url:process.env.PILOT_URL,token:process.env.PILOT_RUNNER_TOKEN});process.on('message',m=>{if(m.type==='stop')controller.abort();});
 process.on('SIGTERM',()=>controller.abort());
 try{await Promise.all([0,1].map(async()=>{const browser=await chromium.launch({headless:process.env.PILOT_HEADLESS!=='false',args:activeBrowserArgs});try{while(!controller.signal.aborted){
  try{const runs=process.env.PILOT_RUN_ID?[{id:process.env.PILOT_RUN_ID}]:await client.call('runs',{});let session=null;
   for(const run of runs){session=await client.call('claim',{runId:run.id,owner:'worker-'+index});if(session)break;}
   if(!session){if(process.env.PILOT_RUN_ID)break;await new Promise(r=>setTimeout(r,1000));continue;}
   try{await runSession(browser,client,session,{signal:controller.signal,onState:s=>console.log(JSON.stringify(s))});}catch(e){console.error(JSON.stringify({sessionId:session.id,error:e.message}));await client.call('failure',{sessionId:session.id,leaseId:session.leaseId,reason:e.message}).catch(()=>{});}
  }catch(e){console.error(JSON.stringify({worker:index,error:e.message}));if(process.env.PILOT_RUN_ID)break;await new Promise(r=>setTimeout(r,1000));}
 }}finally{await browser.close();}}));}finally{process.disconnect?.();}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.env.PILOT_URL||!process.env.PILOT_RUNNER_TOKEN)throw Error('Set PILOT_URL and PILOT_RUNNER_TOKEN; PILOT_RUN_ID is optional');
 if(process.argv[2]==='--worker')await worker(process.argv[3]);else{const supervisor=startSupervisor();for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>supervisor.stop());}
}

