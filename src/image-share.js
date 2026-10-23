const encoder=new TextEncoder();
const validKey=key=>/^[a-f0-9]{64}\.jpg$/.test(key||'');
async function signingKey(secret,usage){
 if(typeof secret!=='string'||secret.length<32)throw Error('image_sharing_not_configured');
 return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,[usage]);
}
export async function imageShareSignature(secret,key,expires){
 if(!validKey(key)||!Number.isSafeInteger(expires))throw Error('invalid_image_share');
 const bytes=await crypto.subtle.sign('HMAC',await signingKey(secret,'sign'),encoder.encode('game-pilot-image-v1\n'+key+'\n'+expires));
 return Buffer.from(bytes).toString('hex');
}
export async function sharedImage(request,env,now=Date.now()){
 const url=new URL(request.url),key=url.searchParams.get('key'),expires=Number(url.searchParams.get('expires')),signature=url.searchParams.get('signature');
 const denied=()=>new Response('Image link invalid or expired',{status:403,headers:{'cache-control':'no-store'}});
 if(request.method!=='GET'||!validKey(key)||!Number.isSafeInteger(expires)||expires<=now||expires>now+900000||!/^[a-f0-9]{64}$/.test(signature||''))return denied();
 try{
  const ok=await crypto.subtle.verify('HMAC',await signingKey(env.MCP_TOKEN,'verify'),Buffer.from(signature,'hex'),encoder.encode('game-pilot-image-v1\n'+key+'\n'+expires));
  if(!ok)return denied();
  const object=await env.IMAGES.get(key);if(!object)return new Response('Image missing',{status:404});
  return new Response(object.body||await object.arrayBuffer(),{headers:{'content-type':'image/jpeg','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
 }catch{return denied();}
}
