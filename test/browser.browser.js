import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {chromium} from 'playwright';
const get=async p=>{try{return await import(new URL(p,import.meta.url));}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;}};
const {captureObservation}=await get('../runner/capture.js');const {executeInput}=await get('../runner/input.js');
const {runReplay}=await get('../runner/replay.js');
const html=`<!doctype html><html><body style="margin:0"><div style="height:80px"></div><iframe src="/game" style="margin-left:120px;width:800px;height:500px;border:0"></iframe></body></html>`;
const game=`<!doctype html><html><body style="margin:0;background:#eee"><h1>DEMO — fake credits</h1><button id="buy" style="margin:50px;width:180px;height:60px">Buy Bonus</button><div id="status">idle</div><script>window.clicks=0;document.querySelector('#buy').onclick=()=>{clicks++;document.querySelector('#status').textContent='purchase '+clicks;};</script></body></html>`;
async function fixture(t){const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(req.url==='/game'?game:html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));});const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto('http://127.0.0.1:'+server.address().port);return {page,browser};}
test('compressed capture maps iframe coordinates and records one checked click',async t=>{
 assert.equal(typeof captureObservation,'function');const {page}=await fixture(t);
 const shot=await captureObservation(page,{sessionId:'s'});assert.equal(shot.observation.geometry.imageWidth<=960,true);assert.ok(shot.imageBytes.length>0);assert.equal(shot.observation.geometry.clip.x,120);
 const target=shot.observation.controls.find(c=>c.label==='Buy Bonus');assert.ok(target);
 const calls=[];const command={commandId:'c1',action:{type:'click',x:target.x,y:target.y},target:'Buy Bonus',goal:'buy'};
 const result=await executeInput(page,command,shot.observation,{issued:async()=>calls.push('issued')});
 assert.deepEqual(calls,['issued']);assert.equal(result.status,'observed');assert.equal(await page.frames()[1].evaluate(()=>window.clicks),1);assert.equal(result.position.x>120,true);
});
test('changed iframe geometry blocks stale input before journal emission',async t=>{
 assert.equal(typeof executeInput,'function');const {page}=await fixture(t);const shot=await captureObservation(page,{sessionId:'s'});await page.locator('iframe').evaluate(el=>el.style.marginLeft='300px');
 let issued=0;await assert.rejects(()=>executeInput(page,{commandId:'c',action:{type:'click',x:.2,y:.2}},shot.observation,{issued:async()=>issued++}),/geometry_changed/);assert.equal(issued,0);assert.equal(await page.frames()[1].evaluate(()=>window.clicks),0);
});
test('replay checks targets and stops on absent control instead of stale coordinate clicks',async t=>{
 assert.equal(typeof runReplay,'function');const {page}=await fixture(t);const shot=await captureObservation(page,{sessionId:'s'});
 const result=await runReplay(page,[{target:'Missing control',action:{type:'click',x:.2,y:.2},beforeState:shot.observation.state}],{journal:{issued:async()=>{throw Error('should not issue');}}});assert.equal(result.status,'blocked');assert.equal(await page.frames()[1].evaluate(()=>window.clicks),0);
});
