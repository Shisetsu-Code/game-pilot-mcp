import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {prepareCatalogue} from '../runner/session.js';

test('catalogue bootstrap handles cookies, age and demo with an existing game iframe',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const timings=[];
 await Promise.all(['rubyplay.com','amusnet.com','www.playngo.com','belatragames.com'].map(async host=>{
  const page=await browser.newPage();const events=[];
  await page.route('https://'+host+'/**',route=>route.fulfill({contentType:'text/html',body:`<iframe srcdoc="<p>Loading demo</p>"></iframe><button onclick="this.remove()">Reject All</button><button onclick="document.querySelector('iframe').remove();this.outerHTML='<a href=&quot;#&quot; onclick=&quot;event.preventDefault();this.outerHTML=String(123)&quot;>Play Demo</a>'">Yes, I am 18 years or older</button>`}));
  await page.goto('https://'+host+'/fixture');const start=performance.now();
  assert.equal(await prepareCatalogue(page,async e=>events.push(e)),true);
  timings.push({host,elapsedMs:Math.round(performance.now()-start)});
  assert.equal(await page.getByRole('button').count(),0);assert.equal(await page.getByRole('link').count(),0);
  assert.equal(events.filter(e=>e.type==='setup_input').length,3);
  assert.equal(events.filter(e=>e.type==='setup_result'&&e.status==='clicked').length,3);
  await page.close();
 }));
 console.log('bootstrap_timings '+JSON.stringify(timings));
});

test('bootstrap leaves unknown age gates and game purchases untouched',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('https://unknown.example/**',route=>route.fulfill({contentType:'text/html',body:'<button onclick="this.remove()">Yes, I am 18 years or older</button><button>Play Demo</button><button>Buy Bonus</button>'}));
 await page.goto('https://unknown.example/');assert.equal(await prepareCatalogue(page),false);assert.equal(await page.getByRole('button').count(),3);
});

test('already running game keeps its iframe and never relaunches the demo',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('https://rubyplay.com/**',route=>route.fulfill({contentType:'text/html',body:'<iframe style="width:800px;height:500px" srcdoc="<p>Game ready</p>"></iframe><button onclick="this.remove()">Play Demo</button><button>Buy Bonus</button>'}));
 await page.goto('https://rubyplay.com/game');assert.equal(await prepareCatalogue(page),false);assert.equal(await page.getByRole('button').count(),2);assert.equal(page.frames().length,2);
});

test('ambiguous demo controls are left for visual review',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('https://rubyplay.com/**',route=>route.fulfill({contentType:'text/html',body:'<button>Play Demo</button><button>Play Demo</button><button>Buy Bonus</button>'}));
 await page.goto('https://rubyplay.com/game');assert.equal(await prepareCatalogue(page),false);assert.equal(await page.getByRole('button').count(),3);
});
