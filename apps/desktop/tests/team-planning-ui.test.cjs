const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
test('Team planning renderer controller and plan presentation',async t=>{
 const root=path.resolve(__dirname,'../../..'),parent=path.join(root,'.cache/planning-renderer-tests');await fs.mkdir(parent,{recursive:true});const base=await fs.mkdtemp(path.join(parent,'run-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 async function compile(dir){await fs.mkdir(path.join(base,dir),{recursive:true});for(const entry of await fs.readdir(path.join(root,'apps/desktop/src/renderer',dir),{withFileTypes:true})){if(entry.isDirectory()){await compile(path.join(dir,entry.name));continue}if(!/\.tsx?$/.test(entry.name)||entry.name.endsWith('.d.ts'))continue;await fs.writeFile(path.join(base,dir,entry.name.replace(/\.tsx?$/,'.js')),ts.transpileModule(await fs.readFile(path.join(root,'apps/desktop/src/renderer',dir,entry.name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)}}
 await compile('hooks');await compile('components/tasks');await compile('components/shared');await compile('components/avatars');await compile('components/chat');
 const load=file=>require(path.join(base,file));const {savedChatMessages}=load('hooks/useSingleAgentChat');
 const source=await fs.readFile(path.join(base,'hooks/useTeamPlanning.js'),'utf8');
 const detail=id=>({id,mode:'team',projectId:'project',teamId:'team',branchName:'main',leadAgentId:'lead',title:'Task',agentSnapshot:{id:'lead',name:'Lead',avatar:{type:'builtin',value:'robot'}},messages:[]});
 const view=(id,status='waiting_input')=>({conversation:detail(id),run:{id:'run-'+id,status,organizerAgentId:'lead',organizerName:'Lead'},plan:null,tasks:[]});
 const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
 function harness(api){const slots=[],effects=[];let index=0,off=0,listener;const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
  const hooks={useRef:value=>{const i=index++;slots[i]??={current:value};return slots[i]},useState:value=>{const i=index++;slots[i]??={value:typeof value==='function'?value():value};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next}]},useCallback:(value,deps)=>{const i=index++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={value,deps};return slots[i].value},useEffect:(effect,deps)=>{const i=index++;if(!slots[i]||!equal(slots[i].deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=effect()})}}};
  const exports={};vm.runInNewContext('(function(require,exports){'+source+'\n})',{window:{flux:{...api,subscribeToOrchestrationChanges:fn=>{listener=fn;return()=>off++}}},AbortController})(id=>id==='react'?hooks:load('hooks/useSingleAgentChat'),exports);
  return{render:()=>{index=0;const result=exports.useTeamPlanning();effects.splice(0).forEach(e=>e());return result},emit:data=>listener(data),unmount:()=>slots.forEach(slot=>slot?.cleanup?.()),off:()=>off};
 }
 await t.test('stale open and cross-project subscription results cannot overwrite current conversation; cleanup',async()=>{
  const a=deferred(),b=deferred(),h=harness({getConversationOrchestration:id=>id==='a'?a.promise:b.promise});let state=h.render();const first=state.open(detail('a'));const second=state.open(detail('b'));b.resolve({ok:true,value:view('b')});await second;a.resolve({ok:true,value:view('a')});await first;
  state=h.render();assert.equal(state.conversation.id,'b');assert.equal(state.view.run.id,'run-b');h.emit({conversationId:'a',view:view('a')});h.emit({conversationId:'b',view:{...view('b'),conversation:{...detail('b'),projectId:'another'}}});assert.equal(h.render().view.run.id,'run-b');h.unmount();assert.equal(h.off(),1);
 });
 await t.test('waiting input goes through continuation; persistent messages replace notifications without duplicates',async()=>{
  let continued=0,started=0;const result=view('a','completed');result.conversation.messages=[{id:'u',role:'user',content:'Answer',status:'completed'},{id:'a',role:'agent',content:'Done',status:'completed'}];
  const h=harness({getConversationOrchestration:async()=>({ok:true,value:view('a')}),continueTeamPrompt:async input=>{continued++;assert.equal(input.runId,'run-a');return{ok:true,value:{view:result}}},startTeamPrompt:async()=>{started++;throw Error('Wrong route')}});let state=h.render();await state.open(detail('a'));state=h.render();assert.equal(state.send({prompt:'Answer'}),true);await new Promise(r=>setImmediate(r));state=h.render();assert.equal(continued,1);assert.equal(started,0);assert.equal(state.messages.length,2);h.emit({conversationId:'a',view:result});h.emit({conversationId:'a',view:result});assert.equal(h.render().messages.length,2);assert.equal(h.render().running,false);h.unmount();
 });
 await t.test('planning state drives Organizer only, and Stop sends only run ID',async()=>{
  let stopped;const h=harness({getConversationOrchestration:async()=>({ok:true,value:view('a','planning')}),cancelTeamPrompt:async input=>{stopped=input;return{ok:true}}});let state=h.render();await state.open(detail('a'));state=h.render();assert.equal(state.workingAgentId,'lead');assert.equal(state.running,true);state.stop();assert.deepEqual(JSON.parse(JSON.stringify(stopped)),{runId:'run-a'});h.emit({conversationId:'a',view:view('a','cancelled')});assert.equal(h.render().workingAgentId,null);h.unmount();
 });
 await t.test('plan card uses actual ordered read model tasks, owner names, statuses and dependencies',()=>{
  const {ExecutionPlanCard}=load('components/chat/ExecutionPlanCard');const data={...view('a','running'),plan:{id:'p',summary:'Build signup',version:1},tasks:[{id:'b',title:'Implementation',status:'ready',assignee:{id:'dev',name:'Developer'}},{id:'r',title:'Review',status:'planned',assignee:{id:'review',name:'Reviewer'},dependsOn:['b'],dependencySummary:'Waiting for 1 task'}]};
  const html=renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:data}));for(const text of ['Execution plan','Build signup','Lead','2 tasks','Implementation','Developer','Review','Reviewer','Ready','Planned','Waiting for 1 task'])assert.ok(html.includes(text),text);assert.ok(html.indexOf('Implementation')<html.indexOf('Reviewer'));assert.equal(renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:view('a')})),'');
 });
 await t.test('saved decisions retain plan association, safe errors and ordinary response/question text',()=>{
  const d=detail('a');d.messages=[{id:'r',role:'agent',content:'Answer',status:'completed'},{id:'q',role:'agent',content:'Clarify\n\n- Which framework?',status:'completed'},{id:'p',role:'agent',content:'Plan ready',planRunId:'run-a',status:'completed'},{id:'e',role:'system',content:'Planning was interrupted. Send the request again.',status:'failed'}];const messages=savedChatMessages(d);assert.equal(messages.length,4);assert.equal(messages[2].planRunId,'run-a');assert.equal(messages[3].role,'error');assert.equal(messages[1].text,d.messages[1].content);
 });
 await t.test('execution controls expose start/stop/next without selecting an owner in renderer',()=>{
  const {ExecutionPlanCard}=load('components/chat/ExecutionPlanCard');
  for(const [execution,label] of [[{canStart:true,activeTaskId:null,hasExecuted:false},'Start execution'],[{canStart:false,activeTaskId:'build',hasExecuted:true},'Stop'],[{canStart:true,activeTaskId:null,hasExecuted:true},'Run next task']]){
   const data={...view('a','running'),plan:{id:'p',summary:'Build',version:1},execution};const html=renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:data}));assert.ok(html.includes('>'+label+'</button>'));
  }
 });
 await t.test('execution subscription marks only owner Working; navigation restoration and Stop use run ID',async()=>{
  let stopped;const data={...view('a','running'),execution:{canStart:false,activeTaskId:'build',hasExecuted:true},tasks:[{id:'build',title:'Build',status:'working',assignee:{id:'developer',name:'Developer'}}]};
  const h=harness({getConversationOrchestration:async()=>({ok:true,value:data}),cancelTaskExecution:async input=>{stopped=input;return{ok:true}}});await h.render().open(detail('a'));let state=h.render();assert.equal(state.workingAgentId,'developer');assert.equal(state.running,true);state.stop();assert.deepEqual(JSON.parse(JSON.stringify(stopped)),{runId:'run-a'});
  h.emit({conversationId:'a',view:{...data,execution:{...data.execution,activeTaskId:null},tasks:[{...data.tasks[0],status:'completed'}]}});state=h.render();assert.equal(state.running,false);assert.equal(state.workingAgentId,null);h.unmount();assert.equal(h.off(),1);
 });

 await t.test('Retry appears only for an eligible failure, carries attempt info and sends only run ID',async()=>{
  const {ExecutionPlanCard}=load('components/chat/ExecutionPlanCard'),data={...view('a','running'),plan:{id:'p',summary:'Plan',version:1},execution:{canStart:false,activeTaskId:null,hasExecuted:true,retry:{attempt:1,message:'The isolated workspace could not be prepared.'}}};
  const html=renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:data}));assert.ok(html.includes('Retry execution'));assert.ok(html.includes('Previous attempt: 1'));assert.ok(!renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:{...data,execution:{...data.execution,retry:null}}})).includes('Retry execution'));assert.ok(!renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:{...data,execution:{...data.execution,activeTaskId:'task'}}})).includes('Retry execution'));
  let payload,calls=0;const done=deferred();const h=harness({getConversationOrchestration:async()=>({ok:true,value:data}),retryTaskExecution:input=>{payload=input;calls++;return done.promise}});await h.render().open(detail('a'));h.render().retry();h.render().retry();assert.equal(calls,1);assert.deepEqual(JSON.parse(JSON.stringify(payload)),{runId:'run-a'});done.resolve({ok:true,value:{...data,execution:{...data.execution,retry:null}}});await new Promise(r=>setImmediate(r));h.unmount();assert.equal(h.off(),1);
 });


 await t.test('preflight renders Stop without Retry, preserves failed task, then marks Developer Working',async()=>{
  const {ExecutionPlanCard}=load('components/chat/ExecutionPlanCard');let stopped;
  const data={...view('a','running'),plan:{id:'p',summary:'Plan',version:1},execution:{checking:true,canStart:false,activeTaskId:null,hasExecuted:true,retry:{attempt:2,message:'Failed'}},tasks:[{id:'build',title:'Build',status:'failed',assignee:{id:'developer',name:'Developer'}}]};
  const html=renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:data}));assert.ok(html.includes('>Stop</button>'));assert.ok(!html.includes('Retry execution'));
  const h=harness({getConversationOrchestration:async()=>({ok:true,value:data}),cancelTaskExecution:async input=>{stopped=input;return{ok:true}}});await h.render().open(detail('a'));
  assert.equal(h.render().running,true);assert.equal(h.render().workingAgentId,null);h.render().stop();assert.deepEqual(JSON.parse(JSON.stringify(stopped)),{runId:'run-a'});
  h.emit({conversationId:'a',view:{...data,execution:{...data.execution,checking:false,activeTaskId:'build'},tasks:[{...data.tasks[0],status:'working'}]}});assert.equal(h.render().workingAgentId,'developer');
  h.emit({conversationId:'a',view:{...data,execution:{...data.execution,checking:false,retry:null},tasks:[{...data.tasks[0],status:'failed'}]}});assert.equal(h.render().running,false);assert.equal(h.render().workingAgentId,null);h.unmount();
 });
 await t.test('attention controls reserve one call, Organizer Working/Idle and Stop use narrow routes', async () => {
  const {ExecutionPlanCard}=load('components/chat/ExecutionPlanCard');
  const data={...view('a','running'),plan:{id:'p',summary:'Plan',version:1},followUp:{canAsk:true,evaluating:false,canContinueTask:false},tasks:[{id:'build',title:'Build',status:'needs_attention',assignee:{id:'dev',name:'Developer'}}]};
  assert.ok(renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:data})).includes('Ask Organizer'));
  let calls=0,stopped;const done=deferred();
  const h=harness({getConversationOrchestration:async()=>({ok:true,value:data}),requestOrganizerFollowUp:input=>{calls++;assert.deepEqual(JSON.parse(JSON.stringify(input)),{runId:'run-a'});return done.promise},cancelTeamPrompt:async input=>{stopped=input;return {ok:true}}});
  await h.render().open(detail('a'));h.render().askOrganizer();h.render().askOrganizer();assert.equal(calls,1);
  const evaluating={...data,followUp:{...data.followUp,canAsk:false,evaluating:true}};h.emit({conversationId:'a',view:evaluating});assert.equal(h.render().workingAgentId,'lead');assert.equal(h.render().running,true);
  h.render().stop();assert.deepEqual(JSON.parse(JSON.stringify(stopped)),{runId:'run-a'});
  const finished={...data,followUp:{...data.followUp,canAsk:false,canContinueTask:true}};done.resolve({ok:true,value:finished});await new Promise(r=>setImmediate(r));assert.equal(h.render().workingAgentId,null);assert.equal(h.render().running,false);
  assert.ok(renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:finished})).includes('Continue task'));h.unmount();
 });
 await t.test('conversation heading reflects canonical attention, evaluating and waiting input',async()=>{
  const compiled=await fs.readFile(path.join(base,'components/chat/ChatWorkspace.js'),'utf8');
  for(const [status,runStatus,evaluating,label] of [['needs_attention','running',false,'Needs attention'],['blocked','running',false,'Blocked'],['needs_attention','running',true,'Organizer is evaluating'],['needs_attention','waiting_input',false,'Waiting for input']]){
   const exports={};const state={conversation:{title:'Task'},orchestration:{run:{status:runStatus},followUp:{evaluating},tasks:[{id:'build',status,assignee:{name:'Developer'}}]},messages:[],selections:{project:'Flux'},runtimeReady:true};
   vm.runInNewContext('(function(require,exports){'+compiled+'\n})')((id)=>id==='react/jsx-runtime'?require(id):id.includes('WorkspaceContext')?{useWorkspace:()=>state}:id.includes('NavigationContext')?{useNavigation:()=>({navigate(){}})}:new Proxy({},{get:()=>()=>null}),exports);
   const html=renderToStaticMarkup(React.createElement(exports.ChatWorkspace));assert.ok(html.includes(label));assert.ok(!html.includes('Plan ready'));
  }
 });

 await t.test('Continue sends run ID once, then Developer works with Stop while Organizer is idle',async()=>{
  const {ExecutionPlanCard}=load('components/chat/ExecutionPlanCard');const data={...view('a','running'),plan:{id:'p',summary:'Plan',version:1},followUp:{canContinueTask:true},execution:{activeTaskId:null,canStart:false},tasks:[{id:'build',title:'Build',status:'needs_attention',assignee:{id:'dev',name:'Developer'}}]};
  let calls=0,stopped;const done=deferred(),h=harness({getConversationOrchestration:async()=>({ok:true,value:data}),continueAttentionTask:input=>{calls++;assert.deepEqual(JSON.parse(JSON.stringify(input)),{runId:'run-a'});return done.promise},cancelTaskExecution:async input=>{stopped=input;return{ok:true}}});await h.render().open(detail('a'));h.render().continueAttention();h.render().continueAttention();assert.equal(calls,1);
  const working={...data,followUp:{canContinueTask:false},execution:{activeTaskId:'build',canStart:false},tasks:[{...data.tasks[0],status:'working'}]};h.emit({conversationId:'a',view:working});assert.equal(h.render().workingAgentId,'dev');assert.equal(h.render().running,true);const html=renderToStaticMarkup(React.createElement(ExecutionPlanCard,{view:working}));assert.ok(html.includes('Working'));assert.ok(html.includes('>Stop</button>'));assert.ok(!html.includes('Continue task'));h.render().stop();assert.deepEqual(JSON.parse(JSON.stringify(stopped)),{runId:'run-a'});
  const terminal={...data,followUp:{canContinueTask:false},tasks:[{...data.tasks[0],status:'completed'}]};done.resolve({ok:true,value:terminal});await new Promise(r=>setImmediate(r));assert.equal(h.render().workingAgentId,null);assert.equal(h.render().running,false);h.unmount();
 });

 await t.test('environment panel uses narrow explicit action, duplicate guard, spinner/cancel and safe terminal result',async()=>{
  const compiled=await fs.readFile(path.join(base,'components/chat/WorkspaceEnvironmentPanel.js'),'utf8'),slots=[],effects=[];let index=0,prepares=0,cancels=0,finish;
  const status={provider:'pnpm offline',state:'not_prepared',code:null,offline:true,lifecycleScripts:false,fingerprint:'a'.repeat(64),preparationRequired:true};
  const api={getWorkspaceEnvironmentStatus:async input=>{assert.deepEqual(JSON.parse(JSON.stringify(input)),{runId:'fixture'});return {ok:true,value:status}},prepareWorkspaceEnvironment:input=>{prepares++;assert.deepEqual(JSON.parse(JSON.stringify(input)),{runId:'fixture'});return new Promise(r=>finish=r)},cancelWorkspaceEnvironment:async input=>{cancels++;assert.deepEqual(JSON.parse(JSON.stringify(input)),{runId:'fixture'});return{ok:true}}};
  const hooks={useState:v=>{const i=index++;slots[i]??={value:v};return[slots[i].value,v=>{slots[i].value=v}]},useRef:v=>{const i=index++;slots[i]??={current:v};return slots[i]},useEffect:(fn,deps)=>{const i=index++;if(!slots[i]||deps.some((x,j)=>x!==slots[i].deps[j])){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn()})}}};
  const exports={};vm.runInNewContext('(function(require,exports){'+compiled+'\n})',{window:{flux:api,setInterval,clearInterval}})(id=>id==='react'?hooks:id==='./WorkspaceDownloadConfirmation'?load('components/chat/WorkspaceDownloadConfirmation'):require(id),exports);
  const changed=[],onPreparing=v=>changed.push(v),render=()=>{index=0;const node=exports.WorkspaceEnvironmentPanel({runId:'fixture',onPreparing});effects.splice(0).forEach(fn=>fn());return node};
  const find=(node,text)=>{if(!node)return; if(node.type==='button'&&node.props.children===text)return node;for(const child of [node.props?.children].flat(Infinity)){if(child&&typeof child==='object'){const found=find(child,text);if(found)return found}}};
  render();await new Promise(r=>setImmediate(r));let node=render();assert.equal(prepares,0);const button=find(node,'Prepare workspace');assert.ok(button);button.props.onClick();button.props.onClick();assert.equal(prepares,1);node=render();assert.ok(renderToStaticMarkup(node).includes('Preparing workspace'));assert.ok(!find(node,'Prepare workspace'));find(node,'Cancel').props.onClick();assert.equal(cancels,1);
  finish({ok:true,value:{...status,state:'failed',code:'offline_dependencies_unavailable'}});await new Promise(r=>setImmediate(r));node=render();assert.ok(renderToStaticMarkup(node).includes('Network access remains disabled'));assert.equal(changed.at(-1),false);slots.forEach(slot=>slot?.cleanup?.());
 });

 await t.test('online confirmation lists scope and requires explicit confirm; Cancel is the safe focus',()=>{
  const {WorkspaceDownloadConfirmation}=load('components/chat/WorkspaceDownloadConfirmation');
  const html=renderToStaticMarkup(React.createElement(WorkspaceDownloadConfirmation,{plan:{registryHost:'registry.npmjs.org'},onCancel(){},onConfirm(){}}));
  for(const text of ['Download workspace dependencies?','pnpm','registry.npmjs.org','lockfile will stay frozen','Install scripts will not run','isolated worktree','Codex agents will not receive internet access','Download dependencies','Cancel'])assert.ok(html.includes(text));
  assert.ok(html.includes('autofocus'));assert.ok(html.includes('aria-labelledby'));
 });

});
