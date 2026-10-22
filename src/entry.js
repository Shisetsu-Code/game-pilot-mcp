import {OAuthProvider} from '@cloudflare/workers-oauth-provider';import worker from './worker.js';import {authorize} from './oauth.js';import {validBearer} from './auth.js';
export default {async fetch(request,env,ctx){const path=new URL(request.url).pathname;
 if(path!=='/authorize'&&!path.startsWith('/.well-known/')&&!path.startsWith('/oauth/')&&path!=='/mcp')return worker.fetch(request,env,ctx);
 if(path==='/mcp'&&await validBearer(request,env.MCP_TOKEN))return worker.fetch(request,env,ctx);
 if(!env.OAUTH_KV||!env.OAUTH_ISSUER)return Response.json({error:'oauth_not_configured'},{status:503});
 const provider=new OAuthProvider({apiRoute:'/mcp',apiHandler:{async fetch(req,bindings,context){if(context.props?.userId!=='owner'||!context.auth?.scope.includes('mcp'))return new Response(null,{status:403});return worker.fetch(req,{...bindings,OAUTH_AUTHENTICATED:true},context);}},
 defaultHandler:{fetch:(req,bindings,context)=>new URL(req.url).pathname==='/authorize'?authorize(req,bindings):worker.fetch(req,bindings,context)},
 authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',clientRegistrationEndpoint:'/oauth/register',scopesSupported:['mcp','offline_access'],requiredScopes:['mcp'],resourceMetadata:{resource:env.OAUTH_ISSUER+'/mcp',authorization_servers:[env.OAUTH_ISSUER]},clientIdMetadataDocumentEnabled:true,accessTokenTTL:3600,refreshTokenTTL:2592000});
 return provider.fetch(request,env,ctx);
}};
