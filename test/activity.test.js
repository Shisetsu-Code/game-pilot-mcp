import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {keepPageActive} from '../runner/activity.js';
test('child protocol targets receive focus emulation without top-level-only lifecycle commands',async()=>{
 const main={},child={},calls=[],page=new EventEmitter();
 page.mainFrame=()=>main;page.frames=()=>[main,child];page.isClosed=()=>false;child.isDetached=()=>false;
 page.context=()=>({newCDPSession:async target=>({send:async method=>{
  calls.push({target,method});if(target===child&&method==='Page.setWebLifecycleState')throw Error('Command can only be executed on top-level targets');
 },detach:async()=>{}})});
 const activity=await keepPageActive(page);await activity.ensureFrames();
 assert.equal(calls.filter(c=>c.method==='Page.setWebLifecycleState').length,1);
 assert.ok(calls.some(c=>c.target===child&&c.method==='Emulation.setFocusEmulationEnabled'));
 page.emit('close');
});
