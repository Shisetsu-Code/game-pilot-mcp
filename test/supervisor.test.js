import test from 'node:test';import assert from 'node:assert/strict';
import {validateSupervisorConfig} from '../runner/supervisor.mjs';
test('four workers accept one to eight independent games each',()=>{
 for(const gamesPerWorker of [1,2,4,6,8])assert.deepEqual(validateSupervisorConfig({workers:4,gamesPerWorker}),{workers:4,gamesPerWorker});
 for(const gamesPerWorker of [0,9,2.5,NaN])assert.throws(()=>validateSupervisorConfig({gamesPerWorker}));
 assert.throws(()=>validateSupervisorConfig({workers:5}));
});
