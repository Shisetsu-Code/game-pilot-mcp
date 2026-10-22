// Canvas screenshots remain usable while an embedded document is navigating.
// Optional DOM reads must never hold the input queue behind an age/cookie gate.
export async function optionalFrameRead(frame,fn,fallback,timeout=500){
 let timer;try{return await Promise.race([
  frame.evaluate(fn).catch(()=>fallback),
  new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),timeout);}),
 ]);}finally{clearTimeout(timer);}
}
