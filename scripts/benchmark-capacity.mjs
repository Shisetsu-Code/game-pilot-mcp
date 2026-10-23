import {chromium} from 'playwright';
import os from 'node:os';
import {appendFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {activeBrowserArgs,keepPageActive} from '../runner/activity.js';
import {captureObservation} from '../runner/capture.js';
const counts=(process.env.PILOT_BENCH_SLOTS||'2,4,6,8').split(',').map(Number);
if(counts.some(n=>!Number.isInteger(n)||n<1||n>8))throw Error('invalid_benchmark_slots');
const quantile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];
const results=[];
for(const slots of counts){
 const browsers=[],pages=[],captureMs=[],failures=[];const openedAt=performance.now();
 try{
  await Promise.all(Array.from({length:slots},async()=>{
   const browser=await chromium.launch({headless:true,args:activeBrowserArgs});browsers.push(browser);
   const page=await browser.newPage({viewport:{width:1280,height:720}});pages.push(page);await keepPageActive(page);
   await page.setContent(`<canvas width="1280" height="640"></canvas><button onclick="window.clicks++">Inspect fixture</button><script>window.clicks=0;window.framesDrawn=0;const c=document.querySelector('canvas').getContext('2d');function draw(){framesDrawn++;c.fillStyle='#163346';c.fillRect(0,0,1280,640);for(let i=0;i<600;i++){c.fillStyle='hsl('+((i+framesDrawn)%360)+' 70% 60%)';c.fillRect((i*37+framesDrawn)%1280,(i*29)%640,20,20);}requestAnimationFrame(draw)}draw()</script>`);
  }));
  const startupMs=Math.round(performance.now()-openedAt);const starts=await Promise.all(pages.map(p=>p.evaluate(()=>framesDrawn)));
  const loopAt=performance.now();
  for(let round=0;round<5;round++)await Promise.all(pages.map(async(p,i)=>{
   const at=performance.now();try{await captureObservation(p);await p.getByRole('button',{name:'Inspect fixture'}).click({timeout:3000});captureMs.push(performance.now()-at);}catch(e){failures.push({page:i,error:e.message.split('\n')[0]});}
  }));
  const seconds=(performance.now()-loopAt)/1000;
  const ends=await Promise.all(pages.map(p=>p.evaluate(()=>({frames:framesDrawn,focused:document.hasFocus(),hidden:document.hidden,clicks}))));
  const record={slots,startupMs,operations:captureMs.length,elapsedSeconds:+seconds.toFixed(2),operationsPerSecond:+(captureMs.length/seconds).toFixed(2),p50Ms:Math.round(quantile(captureMs,.5)||0),p95Ms:Math.round(quantile(captureMs,.95)||0),availableMemoryGiB:+(os.freemem()/2**30).toFixed(2),minAnimationFrames:Math.min(...ends.map((e,i)=>e.frames-starts[i])),allFocused:ends.every(e=>e.focused&&!e.hidden),allClicks:ends.every(e=>e.clicks===5),failures};
  record.acceptable=!failures.length&&record.allFocused&&record.allClicks&&record.minAnimationFrames>0&&record.p95Ms<3000&&record.availableMemoryGiB>=1;
  results.push(record);console.log('CAPACITY_STAGE '+JSON.stringify(record));
 }finally{await Promise.all(browsers.map(b=>b.close()));}
}
const acceptable=results.filter(r=>r.acceptable);const best=acceptable.reduce((a,b)=>!a||b.operationsPerSecond>a.operationsPerSecond?b:a,null);
const report={host:os.hostname(),cpus:os.availableParallelism(),memoryGiB:+(os.totalmem()/2**30).toFixed(2),method:'Independent Chromium per game, animated canvas fixtures, five compressed captures plus checked DOM clicks per slot; excludes provider network and remote coordinator. Capacity is provisional for real games.',results,recommendedSlots:best?.slots||2};
console.log('CAPACITY_RESULT '+JSON.stringify(report));
await writeFile('capacity-results.json',JSON.stringify(report,null,2));
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,'## Browser capacity benchmark\n```json\n'+JSON.stringify(report,null,2)+'\n```\n');
if(!best)process.exitCode=1;
