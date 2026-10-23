import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {matchVisualTarget} from '../runner/visual-match.js';
const scene=(dy=0,color='#147420')=>sharp(Buffer.from(`<svg width="960" height="540"><rect width="960" height="540" fill="#482050"/><g transform="translate(0 ${dy})"><rect x="530" y="290" width="100" height="60" fill="${color}" stroke="#dcae30" stroke-width="5"/><path d="M558 318 L575 334 L604 307" fill="none" stroke="white" stroke-width="6"/></g></svg>`)).jpeg({quality:45}).toBuffer();
test('visual identity follows small animation shifts but rejects replaced or distant controls',async()=>{
 const source=await scene();const shifted=await scene(-6);const matched=await matchVisualTarget(source,shifted,{x:580,y:320,width:960,height:540});assert.ok(matched);assert.equal(matched.dy,-6);assert.equal(matched.dx,0);
 assert.equal(await matchVisualTarget(source,await scene(0,'#a91b20'),{x:580,y:320,width:960,height:540}),null);
 assert.equal(await matchVisualTarget(source,await scene(-30),{x:580,y:320,width:960,height:540}),null);
});
