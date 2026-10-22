import {requireValue} from './contracts.js';
// One CAS document per session: a pure mutation can be retried without emitting input.
export class Store {
 constructor(db){this.db=db.withSession?db.withSession('first-primary'):db;}
 async create(key,value){const data=JSON.stringify(value);requireValue(new TextEncoder().encode(data).length<850000,'session_capacity_reached');const r=await this.db.prepare('INSERT OR IGNORE INTO documents(key,data) VALUES(?,?)').bind(key,data).run();return r.meta.changes===1;}
 async read(key){const r=await this.db.prepare('SELECT data FROM documents WHERE key=?').bind(key).first();return r?JSON.parse(r.data):null;}
 async list(prefix){const r=await this.db.prepare('SELECT key,data FROM documents WHERE key LIKE ? ORDER BY key').bind(prefix+'%').all();return r.results.map(x=>JSON.parse(x.data));}
 async change(key,fn){for(let attempt=0;attempt<32;attempt++){
  const row=await this.db.prepare('SELECT revision,data FROM documents WHERE key=?').bind(key).first();requireValue(row,'not_found');
  const state=JSON.parse(row.data),value=fn(state);requireValue(!(value instanceof Promise),'mutation_must_be_synchronous');
  const data=JSON.stringify(state);requireValue(new TextEncoder().encode(data).length<850000,'session_capacity_reached');
  const r=await this.db.prepare('UPDATE documents SET data=?,revision=revision+1 WHERE key=? AND revision=?').bind(data,key,row.revision).run();if(r.meta.changes===1)return value;
 }throw Error('write_contention');}
}
