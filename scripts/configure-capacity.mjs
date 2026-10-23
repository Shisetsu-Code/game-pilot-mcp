import {appendFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const runId=process.env.PILOT_EXISTING_RUN_ID||process.env.PILOT_RUN_ID;
if(!/^[a-f0-9-]{36}$/.test(runId||''))throw Error('invalid_run_id');
const gamesPerWorker=Number(process.env.PILOT_GAMES_PER_WORKER||4);
if(!Number.isInteger(gamesPerWorker)||gamesPerWorker<1||gamesPerWorker>8)throw Error('invalid_worker_capacity');
const client=new Client({name:'github-capacity',version:'1'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',process.env.PILOT_URL),{requestInit:{headers:{Authorization:'Bearer '+process.env.PILOT_MCP_TOKEN}}}));
 const status=await client.callTool({name:'get_run_status',arguments:{runId}});if(status.isError)throw Error('run_status_failed');
 const run=JSON.parse(status.content.find(c=>c.type==='text').text);if(run.state!=='running')throw Error('run_not_running');
 const result=await client.callTool({name:'set_worker_capacity',arguments:{runId,gamesPerWorker}});if(result.isError)throw Error('capacity_configuration_failed');
 await appendFile(process.env.GITHUB_ENV,'PILOT_RUN_ID='+runId+'\n');
 console.log(JSON.stringify({runId,gamesPerWorker,mode:process.env.PILOT_EXISTING_RUN_ID?'additional-slots-preserving-existing-sessions':'new-run'}));
}finally{await client.close();}
