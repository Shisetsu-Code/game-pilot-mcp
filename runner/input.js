import {selectGameFrame,captureObservation} from './capture.js';import {point} from '../src/contracts.js';
export function mapPoint(geometry,{x,y}){point(x);point(y);return {x:geometry.clip.x+x*geometry.clip.width,y:geometry.clip.y+y*geometry.clip.height};}
export async function executeInput(page,command,observation,journal){
 const current=await selectGameFrame(page),prior=observation.geometry;
 if(current.frameIndex!==prior.frameIndex||current.frame.url().split('?')[0]!==prior.frameId||['x','y','width','height'].some(k=>Math.abs(current.clip[k]-prior.clip[k])>1))throw Error('geometry_changed');
 // Detect same-geometry UI changes before emitting any input.
 const fresh=await captureObservation(page);const target=observation.controls?.find(c=>c.label===command.target);
 if(target&&!fresh.observation.controls.some(c=>c.label===target.label&&!c.disabled&&Math.abs(c.x-target.x)<.005&&Math.abs(c.y-target.y)<.005))throw Error('control_changed');
 if(!target&&command.action.type==='click'&&fresh.observation.imageSha256!==observation.imageSha256)throw Error('canvas_changed_request_new_observation');
 const a=command.action,position=['move','click','drag'].includes(a.type)?mapPoint(prior,a):null;
 await journal.issued(command.commandId);
 try{
  if(a.type==='move')await page.mouse.move(position.x,position.y);
  else if(a.type==='click')await page.mouse.click(position.x,position.y,{button:a.button||'left'});
  else if(a.type==='drag'){const to=mapPoint(prior,{x:a.toX,y:a.toY});await page.mouse.move(position.x,position.y);await page.mouse.down();try{await page.mouse.move(to.x,to.y,{steps:8});}finally{await page.mouse.up();}}
  else if(a.type==='scroll')await page.mouse.wheel(a.deltaX,a.deltaY);
  else if(a.type==='key')await page.keyboard.press(a.key);
  else throw Error('invalid_action');
  await page.waitForTimeout(250);
  const after=await captureObservation(page);return {status:'observed',commandId:command.commandId,position,before:observation.observationId,observation:after.observation,imageBytes:after.imageBytes,evidence:'Awaiting visual result review; a click alone is not success.'};
 }catch(e){return {status:'uncertain',commandId:command.commandId,position,error:e.message};}
}
