import test from 'node:test';import assert from 'node:assert/strict';
import {imageShareSignature,sharedImage} from '../src/image-share.js';
test('shared screenshots allow only the signed image until expiry',async()=>{
 const secret='s'.repeat(40),key='a'.repeat(64)+'.jpg',now=Date.now(),expires=now+60000;
 let reads=0;const env={MCP_TOKEN:secret,IMAGES:{async get(k){reads++;assert.equal(k,key);return {body:new Uint8Array([1,2,3])};}}};
 const signature=await imageShareSignature(secret,key,expires);
 const url=new URL('https://pilot.test/v1/shared-image');for(const [k,v]of Object.entries({key,expires,signature}))url.searchParams.set(k,v);
 assert.equal((await sharedImage(new Request(url),env,now)).status,200);
 assert.equal((await sharedImage(new Request(url),env,expires)).status,403);
 const changed=new URL(url);changed.searchParams.set('key','b'.repeat(64)+'.jpg');assert.equal((await sharedImage(new Request(changed),env,now)).status,403);
 changed.searchParams.set('key',key);changed.searchParams.set('expires',now+900001);assert.equal((await sharedImage(new Request(changed),env,now)).status,403);
 assert.equal((await sharedImage(new Request(url,{method:'POST'}),env,now)).status,403);
 assert.equal(reads,1);
});
