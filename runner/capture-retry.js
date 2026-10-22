import {setTimeout as delay} from 'node:timers/promises';
export const isTerminalDocumentStatus=status=>status>=400&&status<=599&&![408,425,429,500,502,503,504].includes(status);
export const isTransientCaptureError=error=>error?.name==='TimeoutError'||/timeout|timed out|execution context was destroyed|frame was detached|navigation.*progress|unable to capture screenshot/i.test(error?.message||'');
export async function captureContinuously(capture,{signal,terminal=()=>null,onRetry=async()=>{},wait=ms=>delay(ms,undefined,{signal})}={}){
 let attempt=0;for(;;){if(signal?.aborted)throw Error('capture_stopped');
  try{return await capture();}catch(error){const status=terminal();if(status)throw Error('terminal_http_'+status);if(!isTransientCaptureError(error))throw error;
   await onRetry({attempt:++attempt,error:error.message.split('\n')[0]});await wait(Math.min(5000,1000*attempt));
  }
 }
}
