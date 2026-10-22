export function requireValue(ok,code='invalid_input'){if(!ok)throw new Error(code);}
export function id(value){requireValue(typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(value),'invalid_id');return value;}
export function point(x){requireValue(Number.isFinite(x)&&x>=0&&x<=1,'invalid_coordinate');return x;}
export function validateDecision(d){
 requireValue(d&&typeof d==='object');for(const k of ['commandId','sessionId','observationId','leaseId'])id(d[k]);
 requireValue(Number.isSafeInteger(d.revision)&&d.revision>0,'invalid_revision');
 if(d.roundCommandId!==undefined)id(d.roundCommandId);
 requireValue(['move','click','drag','scroll','key'].includes(d.action?.type),'invalid_action');
 if(['move','click','drag'].includes(d.action.type)){point(d.action.x);point(d.action.y);}
 if(d.action.type==='drag'){point(d.action.toX);point(d.action.toY);}
 if(d.action.type==='scroll')for(const k of ['deltaX','deltaY'])requireValue(Number.isFinite(d.action[k])&&Math.abs(d.action[k])<=2000,'invalid_scroll');
 if(d.action.type==='key')requireValue(['Enter','Escape','Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(d.action.key),'invalid_key');
 requireValue(!d.action.button||['left','right','middle'].includes(d.action.button),'invalid_button');
 requireValue(['buy','spin','navigate','continue','pick','inspect'].includes(d.goal),'invalid_goal');
 for(const k of ['target','reason'])requireValue(typeof d[k]==='string'&&d[k].length>0&&d[k].length<=500,'invalid_'+k);
 return structuredClone(d);
}
export function validateObservation(o){
 id(o.observationId);requireValue(o.geometry?.clip?.width>0&&o.geometry?.clip?.height>0,'invalid_geometry');
 for(const v of Object.values(o.geometry.clip))requireValue(Number.isFinite(v),'invalid_geometry');
 requireValue(o.geometry.imageWidth>0&&o.geometry.imageHeight>0,'invalid_image_size');
 requireValue(typeof o.imageRef==='string'&&o.imageRef.length<300,'invalid_image_ref');
 requireValue(/^[a-f0-9]{64}$/.test(o.imageSha256),'invalid_image_hash');
 requireValue(o.state&&typeof o.state.screen==='string','missing_state');return o;
}
export function publicDemoUrl(raw,{allowFixture=false}={}){
 const u=new URL(raw);requireValue(!u.username&&!u.password&&!u.hash,'invalid_demo_url');
 if(allowFixture&&u.hostname==='127.0.0.1'&&u.protocol==='http:')return u.href;
 requireValue(u.protocol==='https:'&&/^[a-z0-9.-]+$/i.test(u.hostname)&&u.hostname.includes('.')&&!/^\d+(\.\d+){3}$/.test(u.hostname)&&!/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname),'invalid_demo_url');return u.href;
}
