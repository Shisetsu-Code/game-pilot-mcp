import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {captureObservation} from '../runner/capture.js';
test('a navigating game document cannot hold its visible screenshot indefinitely',async()=>{
 const bytes=await sharp({create:{width:1280,height:720,channels:3,background:'#333'}}).jpeg().toBuffer();
 const frame={url:()=> 'https://fixture.invalid/game',evaluate:()=>new Promise(()=>{})};
 const page={viewportSize:()=>({width:1280,height:720}),mainFrame:()=>frame,frames:()=>[frame],screenshot:async()=>bytes};
 const shot=await captureObservation(page);
 assert.ok(shot.imageBytes.length>100);assert.deepEqual(shot.observation.controls,[]);
 assert.deepEqual(shot.observation.activity,{visibility:'unknown',hidden:null,focused:null});
 assert.equal(shot.observation.state.screen,'unclassified');
});
