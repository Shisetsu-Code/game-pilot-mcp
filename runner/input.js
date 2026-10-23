import {selectGameFrame,captureObservation} from './capture.js';import {point} from '../src/contracts.js';import {matchVisualTarget} from './visual-match.js';
export function mapPoint(geometry,{x,y}){point(x);point(y);return {x:geometry.clip.x+x*geometry.clip.width,y:geometry.clip.y+y*geometry.clip.height};}
async function validateFresh(page,command,observation,sourceImage){
 const current=await selectGameFrame(page),prior=observation.geometry;
 if(current.frameIndex!==prior.frameIndex||current.frame.url().split('?')[0]!==prior.frameId||['x','y','width','height'].some(k=>Math.abs(current.clip[k]-prior.clip[k])>1)||JSON.stringify(current.frameOrigin)!==JSON.stringify(prior.frameOrigin))throw Error('geometry_changed');
 // Detect same-geometry UI changes before emitting any input.
 const fresh=await captureObservation(page,observation.profile||{});const target=observation.controls?.find(c=>c.label===command.target&&Math.abs(c.x-command.action.x)<.02&&Math.abs(c.y-command.action.y)<.02);
 if(target&&!fresh.observation.controls.some(c=>c.label===target.label&&!c.disabled&&Math.abs(c.x-target.x)<.005&&Math.abs(c.y-target.y)<.005))throw Error('control_changed');
 if(command.action.type==='click'&&fresh.observation.imageSha256!==observation.imageSha256&&(!target||sourceImage)){
  if(!sourceImage)throw Error('canvas_changed_request_new_observation');
  const width=prior.imageWidth,height=prior.imageHeight;
  if(fresh.observation.geometry.imageWidth!==width||fresh.observation.geometry.imageHeight!==height)throw Error('visual_geometry_changed');
  const match=await matchVisualTarget(sourceImage,fresh.imageBytes,{x:Math.round(command.action.x*width),y:Math.round(command.action.y*height),width,height});
  if(!match)throw Error('visual_target_changed');fresh.visualOffset=match;

 }
 return fresh;
}
export async function executeInput(page,command,observation,journal,{sourceImage}={}){
 await validateFresh(page,command,observation,sourceImage);
 const prior=observation.geometry,a=command.action;let position=['move','click','drag'].includes(a.type)?mapPoint(prior,a):null,checked;
 await journal.issued(command.commandId);
 try{checked=await validateFresh(page,command,observation,sourceImage);}catch(error){const after=await captureObservation(page,observation.profile||{}).catch(()=>null);return {status:'blocked',notExecuted:true,commandId:command.commandId,error:error.message,...(after?{observation:after.observation,imageBytes:after.imageBytes}:{})};}
 if(a.type==='click'&&checked.visualOffset){position.x+=checked.visualOffset.dx*prior.clip.width/prior.imageWidth;position.y+=checked.visualOffset.dy*prior.clip.height/prior.imageHeight;}
 try{
  if(a.type==='move')await page.mouse.move(position.x,position.y);
  else if(a.type==='click')await page.mouse.click(position.x,position.y,{button:a.button||'left',delay:80});
  else if(a.type==='drag'){const to=mapPoint(prior,{x:a.toX,y:a.toY});await page.mouse.move(position.x,position.y);await page.mouse.down();try{await page.mouse.move(to.x,to.y,{steps:8});}finally{await page.mouse.up();}}
  else if(a.type==='scroll')await page.mouse.wheel(a.deltaX,a.deltaY);
  else if(a.type==='key')await page.keyboard.press(a.key);
  else throw Error('invalid_action');
  await page.waitForTimeout(250);
  const after=await captureObservation(page,observation.profile||{});return {status:'observed',commandId:command.commandId,position,visualOffset:checked.visualOffset,before:observation.observationId,observation:after.observation,imageBytes:after.imageBytes,evidence:'Awaiting visual result review; a click alone is not success.'};
 }catch(e){return {status:'uncertain',commandId:command.commandId,position,error:e.message};}
}
