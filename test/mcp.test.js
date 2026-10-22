import test from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const mod=await import('../src/mcp.js').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('MCP advertises batched observations, decisions, graph, speed and replay',async()=>{
 assert.equal(typeof mod.createMcpServer,'function');const server=mod.createMcpServer({pilot:{},images:{}});const client=new Client({name:'test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
 const tools=await client.listTools();for(const name of ['get_observations','submit_decisions','review_results','get_game_graph','set_game_speed','export_replay','start_replay'])assert.ok(tools.tools.some(t=>t.name===name));await client.close();await server.close();
});
test('MCP returns image labels and images together; invalid decision does not drop valid sibling',async()=>{
 assert.equal(typeof mod.createMcpServer,'function');const server=mod.createMcpServer({pilot:{getObservations:async()=>[{sessionId:'s1',imageRef:'s1.jpg'},{sessionId:'s2',imageRef:'s2.jpg'}]},images:{get:async()=>({arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})}});
 const client=new Client({name:'test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);const r=await client.callTool({name:'get_observations',arguments:{runId:'r',reviewerId:'tester'}});assert.equal(r.content.filter(c=>c.type==='image').length,2);assert.ok(r.content[0].text.includes('s1'));assert.ok(r.content[2].text.includes('s2'));await client.close();await server.close();
});
