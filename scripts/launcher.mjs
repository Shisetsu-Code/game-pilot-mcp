import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateQueue} from '../src/queue.js';
import {normalizeWireGuard} from './wireguard-config.mjs';
const repo='Shisetsu-Code/game-pilot-mcp';
function github(args,input){return new Promise((resolve,reject)=>{const child=spawn('gh',args,{windowsHide:true,stdio:['pipe','pipe','pipe']}),out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.on('error',()=>reject(Error('GitHub CLI no está disponible. Instalar gh e iniciar sesión.')));child.on('exit',code=>code===0?resolve(Buffer.concat(out).toString()):reject(Error(Buffer.concat(err).toString().slice(0,600)||'GitHub no respondió.')));child.stdin.on('error',()=>{});child.stdin.end(input);});}
export async function publishQueue(raw,{gh=github}={}){
 const queue=validateQueue(raw),minutes=Number(raw.minutes);
 if(!Number.isInteger(minutes)||minutes<1||minutes>300)throw Error('La duración debe ser entre 1 y 300 minutos.');
 if(!/^[a-f0-9-]{36}$/.test(queue.id))throw Error('invalid_queue_id');
 let wireguardSecret='';
 if(raw.wireguardEnabled===true){
  const {config}=normalizeWireGuard(raw.wireguardConfig);
  wireguardSecret='WG_CONFIG_'+createHash('sha256').update(config).digest('hex').toUpperCase();
  await gh(['secret','set',wireguardSecret,'--repo',repo],config);
  queue.wireguardSecret=wireguardSecret;
 }
 const queuePath='queues/'+queue.id+'.json';
 await gh(['api','--method','PUT','repos/'+repo+'/contents/'+queuePath,'--input','-'],JSON.stringify({message:'queue: submit '+queue.urls.length+' demo games [skip ci]',content:Buffer.from(JSON.stringify(queue,null,2)+'\n').toString('base64'),branch:'main'}));
 const workflow=wireguardSecret?'browsers.yml':'distributed-browsers.yml';
 let dispatchOutput='';
 try{dispatchOutput=await gh(['workflow','run',workflow,'--repo',repo,'--ref','main','-f','minutes='+minutes,'-f','queue_path='+queuePath,...(wireguardSecret?['-f','wireguard_secret='+wireguardSecret]:['-f','games_per_worker=8'])]);}
 catch(error){return {published:true,started:false,queueId:queue.id,queuePath,message:'Lista guardada como '+queuePath+'. No se pudo iniciar la ejecución: '+error.message,url:'https://github.com/'+repo+'/actions/workflows/'+workflow};}
 const execution=dispatchOutput.match(/https:\/\/github\.com\/Shisetsu-Code\/game-pilot-mcp\/actions\/runs\/\d+/)?.[0];
 return {published:true,started:true,queueId:queue.id,games:queue.urls.length,wireguard:!!wireguardSecret,url:execution||'https://github.com/'+repo+'/actions/workflows/'+workflow};
}
export function launcherServer({publish=publishQueue}={}){
 const token=randomUUID();return createServer(async(req,res)=>{const origin='http://127.0.0.1:'+res.socket.localPort;
 const send=(status,body,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"});res.end(type==='application/json'?JSON.stringify(body):body);};
 try{
  if(req.headers.host!==new URL(origin).host)return send(403,{error:'host_rejected'});
  if(req.method==='GET'&&req.url==='/health')return send(200,{app:'game-pilot-launcher'});
  if(req.method==='GET'&&req.url==='/'){const html=await readFile(new URL('../launcher/index.html',import.meta.url),'utf8');return send(200,html.replace('__CSRF_TOKEN__',token),'text/html; charset=utf-8');}
  if(req.method!=='POST'||req.url!=='/api/publish')return send(404,{error:'not_found'});
  if(req.headers.origin!==origin||req.headers['x-launcher-token']!==token||req.headers['content-type']!=='application/json')return send(403,{error:'request_rejected'});
  const parts=[];let length=0;for await(const part of req){length+=part.length;if(length>600000)return send(413,{error:'too_large'});parts.push(part);}
  const raw=JSON.parse(Buffer.concat(parts));raw.id??=randomUUID();return send(200,await publish(raw));
 }catch(error){return send(400,{error:error.message});}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const server=launcherServer();server.listen(4188,'127.0.0.1',()=>console.log('Lanzador listo: http://127.0.0.1:4188'));server.on('error',e=>{console.error(e.message);process.exitCode=1;});}
