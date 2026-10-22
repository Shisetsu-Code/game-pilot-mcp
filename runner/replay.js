import {captureObservation} from './capture.js';import {executeInput} from './input.js';
export async function runReplay(page,steps,{journal,onObservation=async()=>{},verify=async()=>false}={}){
 const completed=[];for(const step of steps){const shot=await captureObservation(page);const before=step.beforeState;
  if(before&&before.screen!==shot.observation.state.screen)return {status:'blocked',reason:'state_mismatch',steps:completed};
  const candidates=shot.observation.controls.filter(c=>c.label===step.target&&!c.disabled);
  if(candidates.length!==1)return {status:'blocked',reason:'target_not_unique',steps:completed};
  const c=candidates[0];const result=await executeInput(page,{...step,action:{...step.action,x:c.x,y:c.y}},shot.observation,journal,{sourceImage:shot.imageBytes});await onObservation(result);
  completed.push({commandId:step.commandId,status:result.status});if(result.status!=='observed'||!(await verify(step,result)))return {status:result.status==='uncertain'?'uncertain':'awaiting_review',steps:completed};
 }return {status:'completed',steps:completed};
}
