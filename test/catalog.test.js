import test from 'node:test';import assert from 'node:assert/strict';
const {normalizeCatalog}=await import('../scripts/import-catalog.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('catalog import preserves immutable provenance and never enables entries just because they exist',()=>{
 assert.equal(typeof normalizeCatalog,'function');const c=normalizeCatalog({providers:[{id:'p',games:[{id:'game',url:'https://provider.com/demo'}]}]},'a'.repeat(40));assert.equal(c.games[0].id,'p:game');assert.equal(c.games[0].demo,false);assert.equal(c.source.commit,'a'.repeat(40));assert.throws(()=>normalizeCatalog({providers:[]},'main'));
});
