import {id,publicDemoUrl,requireValue} from './contracts.js';
export function validateQueue(raw){
 requireValue(raw&&typeof raw==='object','invalid_queue');id(raw.id);
 requireValue(raw.demoConfirmed===true,'confirm_fictitious_demo');
 requireValue(Array.isArray(raw.urls)&&raw.urls.length>=1&&raw.urls.length<=64,'select_1_to_64_links');
 const urls=[...new Set(raw.urls.map(url=>{requireValue(typeof url==='string'&&url.length<=8000,'invalid_url');return publicDemoUrl(url.trim());}))];
 return {version:1,id:raw.id,demoConfirmed:true,urls};
}
