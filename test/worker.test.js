import test from 'node:test';import assert from 'node:assert/strict';
const {default:worker}=await import('../src/worker.js').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('HTTP worker fails closed without secrets and isolates runner/client tokens',async()=>{
 assert.equal(typeof worker?.fetch,'function');const empty=await worker.fetch(new Request('https://pilot.test/mcp',{method:'POST'}),{});assert.equal(empty.status,503);
 const env={MCP_TOKEN:'a'.repeat(40),RUNNER_TOKEN:'b'.repeat(40)};const r=await worker.fetch(new Request('https://pilot.test/runner/claim',{method:'POST',headers:{Authorization:'Bearer '+env.MCP_TOKEN,'content-type':'application/json'},body:'{}'}),env);assert.equal(r.status,401);
 const cross=await worker.fetch(new Request('https://pilot.test/mcp',{method:'POST',headers:{Authorization:'Bearer '+env.RUNNER_TOKEN}}),env);assert.equal(cross.status,401);
});
