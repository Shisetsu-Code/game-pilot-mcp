import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {chromium} from 'playwright';
const get=async p=>{try{return await import(new URL(p,import.meta.url));}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;}};
const {captureObservation}=await get('../runner/capture.js');const {executeInput}=await get('../runner/input.js');
const {runReplay}=await get('../runner/replay.js');
const {applyAnimationSpeed}=await get('../runner/speed.js');
const {dismissCatalogueOverlay,prepareCatalogue}=await get('../runner/session.js');
const html=`<!doctype html><html><body style="margin:0"><div style="height:80px"></div><iframe src="/game" style="margin-left:120px;width:800px;height:500px;border:0"></iframe></body></html>`;
const game=`<!doctype html><html><body style="margin:0;background:#eee"><h1>DEMO — fake credits</h1><button id="buy" style="margin:50px;width:180px;height:60px">Buy Bonus</button><div id="status">idle</div><script>window.clicks=0;document.querySelector('#buy').onclick=()=>{clicks++;document.querySelector('#status').textContent='purchase '+clicks;};</script></body></html>`;
async function fixture(t){const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(req.url==='/game'?game:html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));});const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto('http://127.0.0.1:'+server.address().port);return {page,browser};}
test('known late catalogue age links launch only the demo and journal both setup clicks',async t=>{
 const {page}=await fixture(t),events=[];
 await page.route('https://www.pragmaticplay.com/**',route=>route.fulfill({contentType:'text/html',body:`<a href="#" onclick="event.preventDefault();document.body.innerHTML='<button onclick=&quot;document.body.textContent=String(123)&quot;>Play Demo</button>'">Yes, I am 18 years or older</a>`}));
 await page.goto('https://www.pragmaticplay.com/en/games/fixture/');
 assert.equal(await prepareCatalogue(page,async e=>events.push(e)),true);assert.equal(await page.locator('body').innerText(),'123');assert.deepEqual(events.map(e=>e.label),['catalogue.adult-confirmation','catalogue.play-demo']);
});
test('capture can finish while a slow font outlasts the short control timeout',async t=>{
 const {page}=await fixture(t);await page.route('https://fixture.invalid/font.woff2',async route=>{await new Promise(r=>setTimeout(r,600));await route.abort();});
 await page.setContent('<style>@font-face{font-family:slow;src:url(https://fixture.invalid/font.woff2)}body{font-family:slow}</style><h1>Loading demo font</h1>',{waitUntil:'domcontentloaded'});page.setDefaultTimeout(100);
 const result=await captureObservation(page);assert.ok(result.imageBytes.length>100);assert.equal(result.observation.geometry.imageWidth,960);
});
test('an intercepted catalogue control is journaled and leaves its screenshot available for visual review',async t=>{
 const {page}=await fixture(t),events=[];await page.setContent('<button>Reject All</button><div style="position:fixed;inset:0;background:#ddd">Confirm age first</div>');
 assert.equal(await dismissCatalogueOverlay(page,async e=>events.push(e)),false);
 assert.equal(events.at(-1).type,'setup_blocked');const capture=await captureObservation(page);assert.ok(capture.imageBytes.length>100);
});
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
test('animation multiplier shortens browser wait while clocks remain real and reset restores 1x',async t=>{
 const {page}=await fixture(t);const frame=page.frames()[1];await frame.evaluate(()=>{window.anim=document.querySelector('#buy').animate([{opacity:1},{opacity:.5}],{duration:10000,iterations:Infinity});});
 await applyAnimationSpeed(frame,4);const start=await frame.evaluate(()=>({animation:anim.currentTime,real:performance.now(),date:Date.now()}));await page.waitForTimeout(150);const fast=await frame.evaluate(()=>({animation:anim.currentTime,real:performance.now(),date:Date.now()}));assert.ok((fast.animation-start.animation)/(fast.real-start.real)>2.5);assert.ok(Math.abs((fast.date-start.date)-(fast.real-start.real))<50);
 await applyAnimationSpeed(frame,1);const reset=await frame.evaluate(()=>({animation:anim.currentTime,real:performance.now()}));await page.waitForTimeout(150);const end=await frame.evaluate(()=>({animation:anim.currentTime,real:performance.now()}));assert.ok((end.animation-reset.animation)/(end.real-reset.real)<1.5);
});
test('visual target guard tolerates unrelated animation but rejects a changed target patch',async t=>{
 const {page}=await fixture(t);const shot=await captureObservation(page);const c=shot.observation.controls.find(c=>c.label==='Buy Bonus');await page.frames()[1].locator('#status').evaluate(el=>el.textContent='different background text');
 const command={commandId:'visual',goal:'buy',target:'canvas-only target',action:{type:'click',x:c.x,y:c.y}};const result=await executeInput(page,command,shot.observation,{issued:async()=>{}},{sourceImage:shot.imageBytes});assert.equal(result.status,'observed');
 const next=await captureObservation(page);await page.frames()[1].locator('#buy').evaluate(el=>el.style.background='black');await assert.rejects(()=>executeInput(page,command,next.observation,{issued:async()=>{throw Error('must not issue');}},{sourceImage:next.imageBytes}),/visual_target_changed/);
});
test('late catalogue cookie overlay is dismissed with a recorded setup click',async t=>{
 assert.equal(typeof dismissCatalogueOverlay,'function');const {page}=await fixture(t);await page.evaluate(()=>{const button=document.createElement('button');button.textContent='Reject All';button.onclick=()=>button.remove();document.body.append(button);});const events=[];await dismissCatalogueOverlay(page,event=>events.push(event));assert.equal(await page.getByRole('button',{name:'Reject All',exact:true}).count(),0);assert.equal(events[0].type,'setup_input');assert.ok(Number.isFinite(events[0].position.x));
});
test('frame movement during journal request blocks input after durable intent',async t=>{
 const {page}=await fixture(t);const shot=await captureObservation(page),c=shot.observation.controls.find(c=>c.label==='Buy Bonus');let issued=0;
 const result=await executeInput(page,{commandId:'race',action:{type:'click',x:c.x,y:c.y},target:'Buy Bonus'},shot.observation,{issued:async()=>{issued++;await page.locator('iframe').evaluate(el=>el.style.marginLeft='300px');}},{sourceImage:shot.imageBytes});
 assert.equal(result.status,'blocked');assert.equal(result.notExecuted,true);assert.equal(issued,1);assert.equal(await page.frames()[1].evaluate(()=>window.clicks),0);
});
test('partially clipped bordered iframe maps DOM center into the visible crop',async t=>{
 const {page}=await fixture(t);await page.locator('iframe').evaluate(el=>{el.style.marginLeft='-50px';el.style.border='5px solid black';});const shot=await captureObservation(page),c=shot.observation.controls.find(c=>c.label==='Buy Bonus');
 const actual=await page.frames()[1].locator('#buy').boundingBox();const mapped=shot.observation.geometry.clip.x+c.x*shot.observation.geometry.clip.width;assert.ok(Math.abs(mapped-(actual.x+actual.width/2))<1);assert.equal(shot.observation.geometry.clip.width,755);
});
