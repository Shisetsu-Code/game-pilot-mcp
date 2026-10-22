import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {activeBrowserArgs,keepPageActive,readPageActivity} from '../runner/activity.js';
import {captureObservation} from '../runner/capture.js';

const game=`<!doctype html><body><canvas></canvas><script>
window.ticks={raf:0,timer:0};
function step(){if(!document.hidden&&document.hasFocus())ticks.raf++;requestAnimationFrame(step)}
requestAnimationFrame(step);setInterval(()=>{if(!document.hidden&&document.hasFocus())ticks.timer++},50);
</script>`;

test('eight demo tabs and cross-origin game frames keep rendering while another tab is foreground',async t=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(req.url==='/game'?game:`${game}<iframe src="http://localhost:${server.address().port}/game"></iframe>`);});
 await new Promise(r=>server.listen(0,r));
 const browser=await chromium.launch({headless:true,args:activeBrowserArgs});
 t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
 let initiallyUnfocused=0;
 const pages=await Promise.all(Array.from({length:8},async()=>{
  const context=await browser.newContext(),page=await context.newPage();
  const activity=await keepPageActive(page);await page.goto('http://127.0.0.1:'+server.address().port);await activity.ensureFrames();
  if(!(await readPageActivity(page.frames()[1])).focused)initiallyUnfocused++;
  await activity.focusGame(page.frames()[1]);return page;
 }));
 const frames=pages.flatMap(p=>p.frames());assert.equal(frames.length,16);
 t.diagnostic('Unfocused embedded games before native frame focus: '+initiallyUnfocused+'/8');
 const before=await Promise.all(frames.map(f=>f.evaluate(()=>({...ticks}))));
 for(const page of pages){await page.bringToFront();await new Promise(r=>setTimeout(r,120));}
 const after=await Promise.all(frames.map(f=>f.evaluate(()=>({...ticks}))));
 for(let i=0;i<frames.length;i++){
  assert.deepEqual(await readPageActivity(frames[i]),{visibility:'visible',hidden:false,focused:true},'frame '+i);
  assert.ok(after[i].raf-before[i].raf>=3,'frame '+i+' must keep animating');
  assert.ok(after[i].timer-before[i].timer>=3,'frame '+i+' must keep processing timers');
 }
 // Navigation must preserve the protocol setting without monkey-patching APIs.
 await pages[0].reload();await pages[7].bringToFront();
 const shot=await captureObservation(pages[0]);
 assert.deepEqual(shot.observation.activity,{visibility:'visible',hidden:false,focused:true});
 assert.deepEqual(await readPageActivity(pages[0].mainFrame()),{visibility:'visible',hidden:false,focused:true});
});
