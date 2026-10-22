import {validBearer} from './auth.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const headers={'cache-control':'no-store','content-type':'text/html; charset=utf-8','x-frame-options':'DENY','x-content-type-options':'nosniff','referrer-policy':'same-origin','content-security-policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
export async function authorize(request,env){
 if(!env.OAUTH_LOGIN_SECRET||env.OAUTH_LOGIN_SECRET.length<32)return new Response('OAuth no configurado',{status:503});
 const oauth=env.OAUTH_PROVIDER;
 try{
  if(request.method==='GET'){
   const auth=await oauth.parseAuthRequest(request);if(!auth.scope.length)auth.scope=['mcp'];if(!auth.scope.includes('mcp')||auth.scope.some(x=>!['mcp','offline_access'].includes(x)))return new Response('Permisos no admitidos',{status:400});
   const details=await oauth.describeConsent(auth),consent=await oauth.beginConsent(auth);for(const [k,v]of Object.entries(headers))consent.headers.set(k,v);
   consent.headers.set('content-security-policy',headers['content-security-policy'].replace("form-action 'self'","form-action 'self' "+new URL(auth.redirectUri).origin));
   return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Conectar Game Pilot MCP</title><h1>Conectar Game Pilot MCP</h1><p>Cliente: ${escape(details.clientName)}. Destino: ${escape(new URL(auth.redirectUri).origin)}.</p><p>Permite ver capturas, controlar ocho demos, hacer compras ficticias y exportar recorridos. Autorizá sólo la conexión que acabás de iniciar.</p><form method="post" action="/authorize"><input type="hidden" name="handle" value="${escape(consent.handle)}"><label>Clave privada de conexión <input type="password" name="password" maxlength="1024" autocomplete="current-password"></label><button name="decision" value="approve">Autorizar</button><button name="decision" value="deny">Cancelar</button></form></html>`,{headers:consent.headers});
  }
  if(request.method!=='POST')return new Response(null,{status:405});
  if(request.headers.get('origin')!==env.OAUTH_ISSUER)return new Response('Origen rechazado',{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return new Response(null,{status:415});
  const length=Number(request.headers.get('content-length'));if(!Number.isFinite(length)||length>8192)return new Response(null,{status:413});
  const body=await request.text();if(body.length>8192)return new Response(null,{status:413});const form=new URLSearchParams(body),handle=form.get('handle');
  if(form.get('decision')==='deny'){const denied=await oauth.denyConsent(request,handle);return new Response(null,{status:302,headers:denied.headers});}
  if(form.get('decision')!=='approve')return new Response(null,{status:400});
  const check=new Request(request.url,{headers:{authorization:'Bearer '+form.get('password')}});if(!(await validBearer(check,env.OAUTH_LOGIN_SECRET)))return new Response('Clave incorrecta; reiniciá la conexión.',{status:401,headers:{'cache-control':'no-store'}});
  const approved=await oauth.approveConsent(request,handle);const {redirectTo}=await oauth.completeAuthorization({request:approved.request,userId:'owner',metadata:{label:'Game Pilot owner'},scope:approved.request.scope,props:{userId:'owner'}});
  approved.headers.set('location',redirectTo);approved.headers.set('cache-control','no-store');return new Response(null,{status:302,headers:approved.headers});
 }catch{return new Response('Autorización inválida o expirada. Reiniciá la conexión.',{status:400,headers:{'cache-control':'no-store'}});}
}
