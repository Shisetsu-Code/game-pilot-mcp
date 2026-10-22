import sharp from 'sharp';import {createHash} from 'node:crypto';
export async function selectGameFrame(page){
 const vp=page.viewportSize();let best={frame:page.mainFrame(),frameIndex:0,clip:{x:0,y:0,width:vp.width,height:vp.height}};
 let largest=0;for(const [frameIndex,frame] of page.frames().entries()){if(frame===page.mainFrame())continue;try{const element=await frame.frameElement(),box=await element.boundingBox();if(!box||box.width<200||box.height<150)continue;const clip={x:Math.max(0,box.x),y:Math.max(0,box.y),width:Math.min(box.width,vp.width-Math.max(0,box.x)),height:Math.min(box.height,vp.height-Math.max(0,box.y))};const area=clip.width*clip.height;if(area>largest){largest=area;best={frame,frameIndex,clip};}}catch{}}
 return best;
}
export async function captureObservation(page,{quality=45,maxWidth=960,detail=false}={}){
 const selected=await selectGameFrame(page);const {frame,frameIndex,clip}=selected;
 const original=await page.screenshot({type:'jpeg',quality:detail?80:quality,clip});
 const imageBytes=await sharp(original).resize({width:Math.min(Math.round(clip.width),detail?1600:maxWidth),withoutEnlargement:true}).jpeg({quality:detail?80:quality}).toBuffer();
 const meta=await sharp(imageBytes).metadata();
 const controls=await frame.evaluate(()=>Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"],a')).slice(0,150).map((el,i)=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return {id:'dom-'+i,label:(el.innerText||el.getAttribute('aria-label')||el.value||'').trim().slice(0,160),left:r.left,top:r.top,width:r.width,height:r.height,disabled:el.disabled===true||el.getAttribute('aria-disabled')==='true',visible:r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none'};}).filter(c=>c.visible&&c.label));
 const mapped=controls.map(c=>({...c,x:(c.left+c.width/2)/clip.width,y:(c.top+c.height/2)/clip.height})).filter(c=>c.x>=0&&c.x<=1&&c.y>=0&&c.y<=1);
 // Unknown canvas states remain explicitly unknown until a vision reviewer classifies them.
 const state={screen:'unclassified',visibleOptions:mapped.map(c=>c.label),roundPhase:'unknown'};
 const fixture=await frame.evaluate(()=>document.querySelector('[data-pilot-state]')?.getAttribute('data-pilot-state')||null);if(fixture){try{Object.assign(state,JSON.parse(fixture));}catch{}}
 const imageSha256=createHash('sha256').update(imageBytes).digest('hex');
 return {imageBytes,observation:{observationId:crypto.randomUUID(),geometry:{clip,imageWidth:meta.width,imageHeight:meta.height,frameIndex,frameId:frame.url().split('?')[0],viewport:page.viewportSize()},imageRef:imageSha256+'.jpg',imageSha256,state,controls:mapped}};
}
