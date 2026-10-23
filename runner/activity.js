// Chromium's supported test controls keep independent demo tabs foreground-active.
// Do not rewrite document.hidden/hasFocus or suppress a game's event handlers.
import {optionalFrameRead} from './frame-read.js';
export const activeBrowserArgs = [
 '--disable-background-timer-throttling',
 '--disable-backgrounding-occluded-windows',
 '--disable-renderer-backgrounding',
];
const pageActivity=new WeakMap();

export async function keepPageActive(page) {
 const sessions=new Map();
 async function enable(target) {
 const cdp = await page.context().newCDPSession(target);
 try {
  await cdp.send('Emulation.setFocusEmulationEnabled', {enabled:true});
  if(target===page)await cdp.send('Page.setWebLifecycleState', {state:'active'});
 } catch (error) {
  await cdp.detach().catch(()=>{});
  throw new Error('page_activity_setup_failed: '+error.message);
 }
 // Keep the session attached: detaching resets Chromium's emulation settings.
 return cdp;
 }
 const main=await enable(page);sessions.set(page.mainFrame(),Promise.resolve(main));
 function attach(frame){
  if(sessions.has(frame))return sessions.get(frame);
  const pending=enable(frame).catch(error=>{
   sessions.delete(frame);
   // Same-process child frames share the parent's protocol target.
   if(/does not have a separate CDP session|part of the parent frame.s session/i.test(error.message))return null;
   if(frame.isDetached()||page.isClosed())return null;
   throw error;
  });sessions.set(frame,pending);return pending;
 }
 const release=frame=>{const pending=sessions.get(frame);sessions.delete(frame);pending?.then(cdp=>cdp?.detach()).catch(()=>{});};
 page.on('frameattached',frame=>{attach(frame).catch(()=>{});});
 page.on('framenavigated',frame=>{if(frame!==page.mainFrame())release(frame);attach(frame).catch(()=>{});});
 page.on('framedetached',release);
 page.once('close',()=>{for(const pending of sessions.values())pending.then(cdp=>cdp?.detach()).catch(()=>{});});
 const activity={
  async screenshot({clip,quality}){
   let timer;
   try{const result=await Promise.race([
    main.send('Page.captureScreenshot',{format:'jpeg',quality,clip:{...clip,scale:1},fromSurface:true,captureBeyondViewport:false}),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('capture_timeout: compositor screenshot exceeded 10000ms')),10000);}),
   ]);return Buffer.from(result.data,'base64');}finally{clearTimeout(timer);}
  },
  async ensureFrames(){await Promise.all(page.frames().map(attach));},
  async focusGame(frame){
   await attach(frame);
   if(await optionalFrameRead(frame,()=>document.hasFocus(),false))return;
   const chain=[];for(let f=frame;f.parentFrame();f=f.parentFrame())chain.unshift(f);
   for(const child of chain){const element=await child.frameElement();try{await element.evaluate(el=>el.focus({preventScroll:true}));}finally{await element.dispose();}}
  },
 };
 pageActivity.set(page,activity);return activity;
}

export async function activateGameFrame(page,frame){
 const activity=pageActivity.get(page);if(activity){await page.bringToFront();await activity.focusGame(frame);}
}

export async function screenshotNow(page,{clip,quality}){
 const activity=pageActivity.get(page);
 return activity?activity.screenshot({clip,quality}):page.screenshot({type:'jpeg',quality,clip,timeout:20000});
}

export async function readPageActivity(frame) {
 return optionalFrameRead(frame,()=>({visibility:document.visibilityState,hidden:document.hidden,focused:document.hasFocus()}),{visibility:'unknown',hidden:null,focused:null});
}
