import test from 'node:test';
import assert from 'node:assert/strict';
import {launcherServer,publishQueue} from '../scripts/launcher.mjs';
test('launcher publishes a repo manifest then dispatches the matching queue without shell interpolation',async()=>{
 const calls=[],raw={id:'12345678-1234-1234-1234-123456789abc',demoConfirmed:true,minutes:30,urls:['https://example.com/demo?text=$(no)']};
 const result=await publishQueue(raw,{gh:async(args,input)=>{calls.push({args,input});return '';}});
 assert.equal(result.started,true);assert.equal(calls.length,2);
 const document=JSON.parse(Buffer.from(JSON.parse(calls[0].input).content,'base64'));
 assert.equal(document.urls[0],raw.urls[0]);assert.ok(calls[1].args.includes('queue_path=queues/'+raw.id+'.json'));
 await assert.rejects(publishQueue({...raw,minutes:'30; bad'}),/duración/);
});
test('launcher blocks cross-origin submission and accepts a same-origin CSRF protected request',async()=>{
 let submissions=0;const server=launcherServer({publish:async q=>{submissions++;return {started:true,urls:q.urls};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
 const html=await (await fetch(origin)).text();const token=html.match(/const token='([^']+)'/)[1];
 const options={method:'POST',headers:{'content-type':'application/json',origin,'x-launcher-token':token},body:JSON.stringify({urls:['https://example.com/demo']})};
 assert.equal((await fetch(origin+'/api/publish',{...options,headers:{...options.headers,origin:'https://elsewhere.example'}})).status,403);
 assert.equal(submissions,0);assert.equal((await fetch(origin+'/api/publish',options)).status,200);assert.equal(submissions,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
