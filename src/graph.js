export function recordState(session,observation){
 const state=observation.state;
 const semantic=JSON.stringify({screen:state.screen,options:[...(state.visibleOptions||[])].sort(),page:state.menuPage||0,round:state.roundPhase||'unknown'});
 let node=session.graph.nodes.find(n=>n.semantic===semantic);
 if(!node){const parent=session.graph.nodes.find(n=>n.id===session.currentNode);node={id:'n'+session.graph.nodes.length,semantic,state,depth:parent?parent.depth+1:0,observations:[],expanded:false};session.graph.nodes.push(node);session.graph.frontier.push(node.id);}
 node.observations=[...node.observations.slice(-3),observation.observationId];session.currentNode=node.id;return node.id;
}
export function transition(session,command,result){
 session.graph.edges.push({commandId:command.commandId,from:command.nodeId,to:session.currentNode,action:command.action,target:command.target,goal:command.goal,status:result.status});
 if(result.status==='verified'){
  if(command.goal==='buy')session.coverage.purchases[command.target]='verified';
  if(command.goal==='spin')session.coverage.normalSpins++;
 }
}
export function graphView(s){return {...s.graph,coverage:s.coverage,complete:s.coverage.menuExhausted===true&&s.coverage.normalSpins>=3&&s.coverage.options.every(x=>x.disabled||s.coverage.purchases[x.id]==='verified')&&s.phase!=='uncertain'};}
