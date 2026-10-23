const readRetry=new Set(['runs','state','poll','command','renew']);
export class CloudClient{
 constructor({url,token,fetchFn=fetch,sleepFn=ms=>new Promise(r=>setTimeout(r,ms))}){this.url=url.replace(/\/$/,'');this.token=token;this.fetchFn=fetchFn;this.sleepFn=sleepFn;}
 async request(url,options,retry){
  for(let attempt=0;;attempt++){
   try{const response=await this.fetchFn(url,{...options,signal:AbortSignal.timeout(15000)});if(retry&&[429,500,502,503,504].includes(response.status)&&attempt<2){await response.body?.cancel();await this.sleepFn(250*2**attempt);continue;}return response;}
   catch(error){if(!retry||attempt>=2)throw error;await this.sleepFn(250*2**attempt);}
  }
 }
 async call(path,args){const r=await this.request(this.url+'/runner/'+path,{method:'POST',headers:{authorization:'Bearer '+this.token,'content-type':'application/json'},body:JSON.stringify(args)},readRetry.has(path));const result=await r.json();if(!r.ok)throw Error(result.error||'coordinator_unavailable');return result;}
 async upload(imageRef,bytes){const r=await this.request(this.url+'/runner/image?key='+encodeURIComponent(imageRef),{method:'PUT',headers:{authorization:'Bearer '+this.token,'content-type':'image/jpeg'},body:bytes},true);if(!r.ok)throw Error('image_upload_failed');}
}
