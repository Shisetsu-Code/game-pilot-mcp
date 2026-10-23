import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {Store} from './store.js';import {Pilot} from './pilot.js';import {createMcpServer} from './mcp.js';import {validBearer} from './auth.js';import {requireValue,id} from './contracts.js';
import catalog from '../config/providers.json' with {type:'json'};
import {sharedImage} from './image-share.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
async function readJson(request,max=100000){const reader=request.body?.getReader();requireValue(reader,'body_required');let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('body_too_large');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export function makePilot(env){return new Pilot(new Store(env.DB),{games:env.CATALOG?.games||catalog.games,allowFixture:env.ALLOW_FIXTURE===true});}
export default {
 async fetch(request,env){try{
  const url=new URL(request.url);if(url.pathname==='/health'){if(!env.DB||!env.IMAGES)return json({ok:false,reason:'bindings_missing'},503);await env.DB.prepare('SELECT key FROM documents LIMIT 1').first();return json({ok:true,version:'0.1.0',schemaVersion:1,workers:4,gamesPerWorker:2});}
  if(url.pathname==='/v1/shared-image')return sharedImage(request,env);
  const runner=url.pathname.startsWith('/runner/');if(!env.MCP_TOKEN||!env.RUNNER_TOKEN)return json({error:'authentication_not_configured'},503);
  if(!(env.OAUTH_AUTHENTICATED===true&&!runner)&&!(await validBearer(request,runner?env.RUNNER_TOKEN:env.MCP_TOKEN)))return json({error:'unauthorized'},401);
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin&&!(env.ALLOWED_ORIGINS||'').split(',').includes(origin))return json({error:'origin_rejected'},403);
  const pilot=makePilot(env);
  if(url.pathname==='/v1/launch'&&request.method==='POST')return json(await pilot.startLinkRun(await readJson(request,600000)));
  if(url.pathname==='/v1/probe'&&request.method==='GET'){const runId=id(url.searchParams.get('runId')),object=await env.IMAGES.get('reports/'+runId+'/load-probe.json');return object?new Response(object.body||await object.arrayBuffer(),{headers:{'content-type':'application/json','cache-control':'no-store'}}):json({error:'not_found'},404);}
  if(url.pathname==='/mcp'){
   const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:100000});
   const server=createMcpServer({pilot,images:env.IMAGES});await server.connect(transport);try{return await transport.handleRequest(request);}finally{await server.close();}
  }
  if(url.pathname==='/v1/export'&&request.method==='GET'){const runId=id(url.searchParams.get('runId'));return json(await pilot.exportReplay(runId));}
  if(url.pathname==='/v1/image'&&request.method==='GET'){const key=url.searchParams.get('key');requireValue(/^[a-f0-9]{64}\.jpg$/.test(key),'invalid_image_key');const object=await env.IMAGES.get(key);return object?new Response(object.body||await object.arrayBuffer(),{headers:{'content-type':'image/jpeg','cache-control':'no-store'}}):json({error:'not_found'},404);}
  if(runner&&request.method==='POST'){
   const a=await readJson(request);const routes={
    '/runner/report':async()=>{id(a.runId);await pilot.run(a.runId);requireValue(a.report?.runId===a.runId&&Array.isArray(a.report.games)&&a.report.games.length<=64,'invalid_report');await env.IMAGES.put('reports/'+a.runId+'/load-probe.json',JSON.stringify(a.report));return {ok:true};},
    '/runner/poll':()=>pilot.poll(a.sessionId,a.leaseId),'/runner/runs':()=>pilot.availableRuns(),'/runner/failure':()=>pilot.failSession(a.sessionId,a.leaseId,a.reason),'/runner/claim':()=>pilot.claimSession(a.runId,a.owner),'/runner/renew':()=>pilot.renew(a.sessionId,a.leaseId),'/runner/state':()=>pilot.runnerState(a.sessionId,a.leaseId),
    '/runner/observe':()=>pilot.captured(a.sessionId,a.leaseId,a.observation,{automatic:a.automatic===true}),'/runner/command':()=>pilot.command(a.sessionId,a.leaseId),'/runner/issued':()=>pilot.issued(a.sessionId,a.leaseId,a.commandId),
    '/runner/defer':()=>pilot.deferCommand(a.sessionId,a.leaseId,a.commandId,a.reason),
    '/runner/routine':()=>pilot.queueRoutine(a.sessionId,a.leaseId,a.observation),
    '/runner/finish':()=>pilot.finish(a.sessionId,a.leaseId,a.commandId,a.result),'/runner/event':()=>pilot.runnerEvent(a.sessionId,a.leaseId,a.event),'/runner/ack':()=>pilot.acknowledge(a.sessionId,a.leaseId,a.ack,a.generation)
   };if(routes[url.pathname])return json(await routes[url.pathname]());
  }
  if(runner&&request.method==='PUT'&&url.pathname==='/runner/image'){
   const key=url.searchParams.get('key');requireValue(/^[a-f0-9]{64}\.jpg$/.test(key),'invalid_image_key');const bytes=new Uint8Array(await request.arrayBuffer());requireValue(bytes.length<=1500000,'image_too_large');
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');requireValue(key===hash+'.jpg','image_hash_mismatch');await env.IMAGES.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});return json({ok:true});
  }
  return json({error:'not_found'},404);
 }catch(error){return json({error:error.message},400);}}
};
