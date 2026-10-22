import {isIP} from 'node:net';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const fail=message=>{throw Error('WireGuard: '+message);};
const keyValid=value=>/^[A-Za-z0-9+/]{43}=$/.test(value)&&Buffer.from(value,'base64').length===32&&Buffer.from(value,'base64').toString('base64')===value;
const cidr=value=>{const parts=value.split('/'),family=isIP(parts[0]);return parts.length===2&&family&&/^\d+$/.test(parts[1])&&Number(parts[1])<=(family===4?32:128);};
const list=value=>value.split(',').map(v=>v.trim());
export function normalizeWireGuard(raw){
 if(typeof raw!=='string'||!raw.trim()||Buffer.byteLength(raw)>32000)fail('seleccioná un archivo .conf de hasta 32 KB.');
 const sections={Interface:new Map(),Peer:new Map()};let section=null;const seen=new Set();
 for(const rawLine of raw.replace(/^\uFEFF/,'').split(/\r?\n/)){
  const line=rawLine.split('#')[0].trim();if(!line||line.startsWith(';'))continue;
  if(line.startsWith('[')){const match=line.match(/^\[(Interface|Peer)\]$/);if(!match||seen.has(match[1]))fail('se admite una interfaz y un único peer.');section=match[1];seen.add(section);continue;}
  const match=line.match(/^([A-Za-z]+)\s*=\s*(.+)$/);if(!section||!match)fail('formato .conf inválido.');
  const [,name,value]=match,allowed=section==='Interface'?['PrivateKey','Address','DNS','MTU','ListenPort']:['PublicKey','PresharedKey','AllowedIPs','Endpoint','PersistentKeepalive'];
  if(!allowed.includes(name))fail('el perfil contiene una opción no admitida; no se permiten scripts, Table ni SaveConfig.');
  if(sections[section].has(name)){
   if(!['Address','DNS','AllowedIPs'].includes(name))fail('opción duplicada.');
   sections[section].set(name,sections[section].get(name)+', '+value.trim());
  }else sections[section].set(name,value.trim());
 }
 const i=sections.Interface,p=sections.Peer;
 if(!keyValid(i.get('PrivateKey')||'')||!keyValid(p.get('PublicKey')||'')||(p.has('PresharedKey')&&!keyValid(p.get('PresharedKey'))))fail('faltan claves válidas en el perfil.');
 if(!i.has('Address')||!list(i.get('Address')).every(cidr)||!list(i.get('Address')).some(v=>isIP(v.split('/')[0])===4))fail('Address debe incluir una dirección IPv4 con prefijo.');
 if(!i.has('DNS')||!list(i.get('DNS')).every(v=>isIP(v)))fail('DNS debe contener direcciones IP.');
 if(!p.has('AllowedIPs')||!list(p.get('AllowedIPs')).every(cidr)||!list(p.get('AllowedIPs')).includes('0.0.0.0/0'))fail('AllowedIPs debe incluir 0.0.0.0/0 para enrutar los juegos por la VPN.');
 const endpoint=p.get('Endpoint')?.match(/^(\[[a-fA-F0-9:]+\]|[A-Za-z0-9.-]+):(\d+)$/);
 if(!endpoint||Number(endpoint[2])<1||Number(endpoint[2])>65535)fail('Endpoint debe indicar servidor y puerto válidos.');
 if(endpoint[1].startsWith('[')&&isIP(endpoint[1].slice(1,-1))!==6)fail('Endpoint IPv6 inválido.');
 for(const [map,name,min,max] of [[i,'MTU',576,9000],[i,'ListenPort',1,65535],[p,'PersistentKeepalive',0,65535]])if(map.has(name)&&(!/^\d+$/.test(map.get(name))||Number(map.get(name))<min||Number(map.get(name))>max))fail('valor numérico fuera de rango.');
 if(!p.has('PersistentKeepalive'))p.set('PersistentKeepalive','25');
 const config=['Interface','Peer'].map(name=>'['+name+']\n'+[...sections[name]].map(([k,v])=>k+' = '+v).join('\n')).join('\n')+'\n';
 return {config};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.env.RUNNER_TEMP)fail('falta el directorio privado del runner.');
 const {config}=normalizeWireGuard(process.env.WG_CONFIG);
 await writeFile(join(process.env.RUNNER_TEMP,'gpwg.conf'),config,{mode:0o600});
 console.log('Perfil WireGuard validado.');
}
