export async function validBearer(request,secret){
 if(typeof secret!=='string'||secret.length<32)return false;
 const supplied=request.headers.get('authorization')||'';if(!supplied.startsWith('Bearer ')||supplied.length>1024)return false;
 const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const message=encoder.encode('game-pilot-auth');const signature=await crypto.subtle.sign('HMAC',key,message);
 const other=await crypto.subtle.importKey('raw',encoder.encode(supplied.slice(7)),{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',other,signature,message);
}
