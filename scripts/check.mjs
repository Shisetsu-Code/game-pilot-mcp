import {readdir} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
async function walk(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+ent.name;if(ent.isDirectory())await walk(path);else if(/\.(mjs|js)$/.test(path)){const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}}}
for(const dir of ['src','runner','scripts','test'])await walk(dir);console.log('Syntax checks passed');
