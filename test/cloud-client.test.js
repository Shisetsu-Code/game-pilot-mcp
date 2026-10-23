import test from 'node:test';import assert from 'node:assert/strict';import {CloudClient} from '../runner/cloud-client.js';
test('transient read and content-addressed upload failures retry, but input mutations do not',async()=>{
 let calls=0;const fetchFn=async()=>{calls++;if(calls===1)throw TypeError('fetch failed');return new Response(JSON.stringify({ok:true}));};const client=new CloudClient({url:'https://fixture.test',token:'test',fetchFn,sleepFn:async()=>{}});
 assert.deepEqual(await client.call('poll',{}),{ok:true});assert.equal(calls,2);
 calls=0;await client.upload('hash.jpg',new Uint8Array([1]));assert.equal(calls,2);
 for(const path of ['claim','issued','finish']){calls=0;await assert.rejects(()=>client.call(path,{}),/fetch failed/);assert.equal(calls,1);}
});
test('authorization errors never retry and transient HTTP failures are bounded',async()=>{
 let calls=0;const client=new CloudClient({url:'https://fixture.test',token:'test',fetchFn:async()=>{calls++;return new Response(JSON.stringify({error:'unauthorized'}),{status:401});},sleepFn:async()=>{}});await assert.rejects(()=>client.call('state',{}),/unauthorized/);assert.equal(calls,1);
 client.fetchFn=async()=>{calls++;return new Response(JSON.stringify({error:'busy'}),{status:503});};calls=0;await assert.rejects(()=>client.call('state',{}),/busy/);assert.equal(calls,3);
});
