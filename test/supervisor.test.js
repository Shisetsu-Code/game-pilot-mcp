import test from 'node:test';import assert from 'node:assert/strict';
const {validateSupervisorConfig}=await import('../runner/supervisor.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('supervisor enforces four workers with two independent slots',()=>{assert.equal(typeof validateSupervisorConfig,'function');assert.deepEqual(validateSupervisorConfig({workers:4,gamesPerWorker:2}),{workers:4,gamesPerWorker:2});assert.throws(()=>validateSupervisorConfig({workers:5,gamesPerWorker:2}));assert.throws(()=>validateSupervisorConfig({workers:4,gamesPerWorker:3}));});
