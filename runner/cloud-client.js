export class CloudClient{
 constructor({url,token}){this.url=url.replace(/\/$/,'');this.token=token;}
 async call(path,args){const r=await fetch(this.url+'/runner/'+path,{method:'POST',headers:{authorization:'Bearer '+this.token,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok)throw Error(result.error||'coordinator_unavailable');return result;}
 async upload(imageRef,bytes){const r=await fetch(this.url+'/runner/image?key='+encodeURIComponent(imageRef),{method:'PUT',headers:{authorization:'Bearer '+this.token,'content-type':'image/jpeg'},body:bytes,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('image_upload_failed');}
}
