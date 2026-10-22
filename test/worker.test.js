import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const {default:worker}=await import('../src/worker.js').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('HTTP worker fails closed without secrets and isolates runner/client tokens',async()=>{
 assert.equal(typeof worker?.fetch,'function');const empty=await worker.fetch(new Request('https://pilot.test/mcp',{method:'POST'}),{});assert.equal(empty.status,503);
 const env={MCP_TOKEN:'a'.repeat(40),RUNNER_TOKEN:'b'.repeat(40)};const r=await worker.fetch(new Request('https://pilot.test/runner/claim',{method:'POST',headers:{Authorization:'Bearer '+env.MCP_TOKEN,'content-type':'application/json'},body:'{}'}),env);assert.equal(r.status,401);
 const cross=await worker.fetch(new Request('https://pilot.test/mcp',{method:'POST',headers:{Authorization:'Bearer '+env.RUNNER_TOKEN}}),env);assert.equal(cross.status,401);
});
test('remote launch API requires client credentials and persists one run across retries',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE documents(key TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)');
 const DB={prepare(query){const stmt=sql.prepare(query);let args=[];return {bind(...values){args=values;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}};}};}};
 const env={DB,MCP_TOKEN:'a'.repeat(40),RUNNER_TOKEN:'b'.repeat(40)};
 const body=JSON.stringify({id:'api-queue',demoConfirmed:true,urls:['https://example.com/demo']});
 const request=token=>new Request('https://pilot.test/v1/launch',{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body});
 try{assert.equal((await worker.fetch(request(env.RUNNER_TOKEN),env)).status,401);
 const first=await worker.fetch(request(env.MCP_TOKEN),env);assert.equal(first.status,200);const run=await first.json();
 const again=await (await worker.fetch(request(env.MCP_TOKEN),env)).json();assert.equal(again.id,run.id);assert.equal(run.sessions.length,1);
 }finally{sql.close();}
});
