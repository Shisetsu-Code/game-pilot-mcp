import sharp from 'sharp';
export {routineAction,roundEvidence} from '../src/routines.js';
export class ScreenGate{
 constructor({maxSilenceMs=30000,threshold=4}={}){this.maxSilenceMs=maxSilenceMs;this.threshold=threshold;this.last=null;this.at=0;}
 shouldPublish(frame,now=Date.now()){
  let changed=!this.last||frame.signature!==this.last.signature||now-this.at>=this.maxSilenceMs;
  if(!changed){let delta=0;for(let i=0;i<frame.pixels.length;i++)delta+=Math.abs(frame.pixels[i]-this.last.pixels[i]);changed=delta/frame.pixels.length>=this.threshold;}
  if(changed){this.last=frame;this.at=now;}return changed;
 }
 reset(){this.last=null;}
}
export async function screenFingerprint(shot){
 const pixels=await sharp(shot.imageBytes).resize(32,18,{fit:'fill'}).greyscale().raw().toBuffer();
 const o=shot.observation;
 return {pixels,signature:JSON.stringify([o.geometry.frameId,o.geometry.clip,o.controls.map(c=>[c.label,c.disabled]),o.state.screen,o.state.roundPhase])};
}
