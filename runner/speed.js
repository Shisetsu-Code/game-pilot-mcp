export class SpeedController{
 constructor({compatible=false,maxFactor=4}={}){this.compatible=compatible;this.maxFactor=maxFactor;this.factor=1;this.verified=0;this.disabled=false;this.method='none';this.reason=null;}
 recordTransition({verified,roundComplete,error,uncertain}={}){if(error||uncertain||verified===false){this.disabled=true;this.reason=error||'unverified_transition';this.factor=1;this.verified=0;}else if(verified&&roundComplete)this.verified++;}
 nextFactor(idle){if(this.disabled||!this.compatible)return 1;return idle&&this.verified>=3?Math.min(this.factor*2,this.maxFactor):this.factor;}
 requestFactor(factor,idle){if(![1,2,4].includes(factor))throw Error('unsupported_factor');if(factor>1&&(!this.compatible||this.disabled||!idle||factor>this.maxFactor))throw Error('speed_not_validated');return factor;}
 applied(factor,method){if(factor!==this.factor)this.verified=0;this.factor=factor;this.method=method;}
 status(){return {effectiveFactor:this.factor,compatible:this.compatible,verifiedTransitions:this.verified,disabled:this.disabled,method:this.method,disabledReason:this.reason};}
}
// No global timer/performance monkey-patching. Only accessible animation playback.
export async function applyAnimationSpeed(frame,factor){return frame.evaluate(value=>{
 const animations=document.getAnimations();for(const animation of animations)animation.updatePlaybackRate(value);
 return {method:'web-animation',effectiveFactor:value,animations:animations.length};
},factor);}
