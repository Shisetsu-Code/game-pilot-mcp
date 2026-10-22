import test from 'node:test';
import assert from 'node:assert/strict';
import {validateQueue} from '../src/queue.js';
import {Pilot} from '../src/pilot.js';
test('source catalog HTTPS demos may use an explicit public service port',()=>{
 const q=validateQueue({id:'demo-port',demoConfirmed:true,urls:['https://gs.1spin4win.com:10443/gmh5/games.html?freeplay=true']});
 assert.match(q.urls[0],/:10443\//);
});
test('queue validates and deduplicates public demo links before publishing',()=>{
 const q=validateQueue({id:'queue-one',demoConfirmed:true,urls:['https://example.com/demo','https://example.com/demo','https://example.org/game']});
 assert.equal(q.urls.length,2);
 for(const bad of [{...q,demoConfirmed:false},{...q,urls:['http://localhost/game']},{...q,urls:[]},{...q,id:'../bad'},{...q,urls:['https://user:password@example.com/game']}])assert.throws(()=>validateQueue(bad));
});
test('published queue creates a discoverable run once, with immutable game snapshots',async()=>{
 const documents=new Map();const store={async read(k){return structuredClone(documents.get(k)||null);},async create(k,v){if(documents.has(k))return false;documents.set(k,structuredClone(v));return true;},async change(k,fn){return fn(documents.get(k));},async list(prefix){return [...documents].filter(([k])=>k.startsWith(prefix)).map(([,v])=>structuredClone(v));}};
 const pilot=new Pilot(store);const q={id:'queue-one',demoConfirmed:true,urls:['https://example.com/demo','https://example.org/game']};
 const run=await pilot.startLinkRun(q);assert.equal(run.sessions.length,2);
 const s=await pilot.claimSession(run.id,'worker-0');assert.equal(s.game.url,q.urls[0]);assert.equal(s.game.demo,true);
 assert.equal((await pilot.startLinkRun(q)).id,run.id);
 await assert.rejects(pilot.startLinkRun({...q,urls:['https://different.example/game']}),/queue_conflict/);
 assert.equal((await pilot.availableRuns())[0].id,run.id);
});
