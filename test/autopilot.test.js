import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../runner/autopilot.js').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
const control=(label,x=.5)=>({label,x,y:.5,disabled:false});
import {SpeedController} from '../runner/speed.js';
test('explicit 4x request works for an idle compatible game without requiring extra paid rounds',()=>{
 const speed=new SpeedController({compatible:true});assert.equal(speed.requestFactor(4,true),4);
 assert.throws(()=>speed.requestFactor(4,false));speed.recordTransition({error:'provider_error'});assert.throws(()=>speed.requestFactor(4,true));
});
test('routine recognition closes a prize, but never purchases or makes a bonus choice',()=>{
 assert.equal(typeof mod.routineAction,'function');
 assert.equal(mod.routineAction({controls:[control('Click to continue')],text:'TOTAL WIN 75.00'}).kind,'prize');
 assert.equal(mod.routineAction({controls:[control('Continue')],text:'Buy free spins for 100?'}),null);
 assert.equal(mod.routineAction({controls:[control('Pick a chest')],text:'Choose your bonus'}),null);
 assert.equal(mod.routineAction({controls:[control('Continue'),control('Continue',.8)],text:'TOTAL WIN 75'}),null);
 assert.equal(mod.routineAction({controls:[control('Spin')],text:'TOTAL WIN 75'}),null);
});
test('screen gate suppresses unchanged pixels but surfaces changed decisions and periodic fallback',()=>{
 assert.equal(typeof mod.ScreenGate,'function');const gate=new mod.ScreenGate({maxSilenceMs:30000});
 const frame=(v,signature='base')=>({pixels:new Uint8Array(256).fill(v),signature});
 assert.equal(gate.shouldPublish(frame(20),0),true);
 assert.equal(gate.shouldPublish(frame(21),10000),false);
 assert.equal(gate.shouldPublish(frame(80),11000),true);
 assert.equal(gate.shouldPublish(frame(80,'choice'),12000),true);
 assert.equal(gate.shouldPublish(frame(80,'choice'),42001),true);
});
