import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWireGuard} from '../scripts/wireguard-config.mjs';
import {publishQueue} from '../scripts/launcher.mjs';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const key=n=>Buffer.alloc(32,n).toString('base64');
const config=`[Interface]\nPrivateKey = ${key(1)}\nAddress = 10.7.0.2/32\nDNS = 1.1.1.1\n[Peer]\nPublicKey = ${key(2)}\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = vpn.example.com:51820\nPersistentKeepalive = 25\n`;
test('WireGuard accepts a client profile and rejects hooks, partial routing and unsafe values without echoing secrets',()=>{
 assert.equal(normalizeWireGuard(config).config,config);
 for(const raw of [config+'PostUp = echo hi\n',config.replace('DNS = 1.1.1.1','PostUp = echo hi'),config.replace('0.0.0.0/0','10.0.0.0/8'),config.replace('1.1.1.1','$(echo secret)'),config.replace('vpn.example.com:51820','vpn.example.com:99999'),config.replace(key(1),'not-a-key'),config+'[Peer]\nPublicKey = '+key(3)]){
  assert.throws(()=>normalizeWireGuard(raw),error=>!error.message.includes(key(1)));
 }
});
test('VPN startup installs both firewall guards before checking egress and fails on a missing handshake',{skip:process.platform==='win32'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pilot-wg-')),bin=join(dir,'bin'),log=join(dir,'commands');await mkdir(bin);
 const mock=`#!/usr/bin/env node
const fs=require('fs'),path=require('path');const tool=path.basename(process.argv[1]),args=process.argv.slice(2);fs.appendFileSync(process.env.MOCK_LOG,tool+' '+args.join(' ')+'\\n');
if(tool==='sudo'&&args[0]==='wg'&&args[3]==='fwmark')console.log('0xca6c');
if(tool==='sudo'&&args[0]==='wg'&&args[3]==='latest-handshakes')console.log('public-key '+process.env.MOCK_HANDSHAKE);
if(tool==='ip')console.log('1.1.1.1 dev gpwg src 10.7.0.2');
`;
 try{
  for(const name of ['sudo','ip','curl','sleep'])await writeFile(join(bin,name),mock,{mode:0o755});
  for(const valid of [true,false]){
   await writeFile(join(dir,'gpwg.conf'),config);await writeFile(log,'');
   const result=spawnSync('bash',['scripts/wireguard-up.sh'],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,RUNNER_TEMP:dir,MOCK_LOG:log,MOCK_HANDSHAKE:valid?String(Math.floor(Date.now()/1000)):'0'}});
   assert.equal(result.status,valid?0:1,result.stderr);const commands=await readFile(log,'utf8');
   assert.ok(commands.indexOf('sudo iptables -I OUTPUT')<commands.indexOf('curl '));
   assert.ok(commands.indexOf('sudo ip6tables -I OUTPUT')<commands.indexOf('curl '));
   assert.ok(!result.stdout.includes(key(1)));assert.ok(!result.stderr.includes(key(1)));
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('WireGuard upload goes to an isolated reusable secret, never repository contents or command arguments',async()=>{
 const calls=[],raw={id:'12345678-1234-1234-1234-123456789abc',demoConfirmed:true,minutes:30,urls:['https://example.com/demo'],wireguardEnabled:true,wireguardConfig:config};
 const result=await publishQueue(raw,{gh:async(args,input)=>{calls.push({args,input});return '';}});
 assert.equal(result.started,true);assert.equal(calls[0].args[0],'secret');assert.match(calls[0].args[2],/^WG_CONFIG_[A-F0-9]{64}$/);
 assert.equal(calls[0].input,config);
 for(const call of calls)assert.ok(!call.args.join(' ').includes(key(1)));
 const manifest=JSON.parse(Buffer.from(JSON.parse(calls[1].input).content,'base64'));
 assert.equal(manifest.wireguardSecret,calls[0].args[2]);assert.ok(!JSON.stringify(manifest).includes(key(1)));
 assert.ok(calls[2].args.includes('wireguard_secret='+manifest.wireguardSecret));
 const again=[];await publishQueue(raw,{gh:async(args)=>{again.push(args);return '';}});assert.equal(again[0][2],manifest.wireguardSecret);
 await assert.rejects(publishQueue({...raw,wireguardConfig:''}),/WireGuard/);
});
