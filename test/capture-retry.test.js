import test from 'node:test';import assert from 'node:assert/strict';
import {captureContinuously,isTerminalDocumentStatus} from '../runner/capture-retry.js';
test('capture timeouts keep the same session alive until an image is available',async()=>{
 let captures=0,retries=0;const result=await captureContinuously(async()=>{if(++captures<=5)throw Object.assign(Error('screenshot timeout'),{name:'TimeoutError'});return 'image';},{wait:async()=>{},onRetry:async()=>retries++});
 assert.equal(result,'image');assert.equal(captures,6);assert.equal(retries,5);
});
test('terminal HTTP errors and user cancellation stop capture retries',async()=>{
 let calls=0;await assert.rejects(captureContinuously(async()=>{calls++;throw Error('screenshot timeout');},{terminal:()=>404,wait:async()=>{}}),/terminal_http_404/);assert.equal(calls,1);
 const controller=new AbortController();controller.abort();await assert.rejects(captureContinuously(async()=>{throw Error('should not capture');},{signal:controller.signal}),/capture_stopped/);
 assert.equal(isTerminalDocumentStatus(404),true);assert.equal(isTerminalDocumentStatus(403),true);assert.equal(isTerminalDocumentStatus(429),false);assert.equal(isTerminalDocumentStatus(200),false);
});
