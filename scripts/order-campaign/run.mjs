import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaultArtifacts } from './generate.mjs';
import { appendEvidence, sanitize } from './evidence.mjs';
import { loadManifest, expandExecutions, explicitSteps, executeSteps } from './campaign-v2-run.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return [k,v.join('=')||true]}));
const dir=resolve(args.dir||process.env.CAMPAIGN_DIR||defaultArtifacts),port=Number(args.port||process.env.CAMPAIGN_PORT||8891),base=`http://127.0.0.1:${port}`;
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('port must be 1024..65535');
mkdirSync(dir,{recursive:true});
const phase=String(args.phase||'baseline'),start=Number(args.start||0),limit=Number(args.limit||100),runId=`${phase.replace(/[^A-Za-z0-9_-]/g,'_')}-${Date.now()}-${randomUUID().slice(0,8)}`;
if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(limit)||limit<1)throw Error('start/limit must be nonnegative/positive integers');
const runStarted=Date.now(),secrets=[],rawPath=resolve(dir,'raw-observations.jsonl');
const runnerSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const runnerHash=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const manifest=loadManifest(resolve(args.manifest||resolve(dir,'corpus.jsonl'))),corpus=manifest.records;
const previous=existsSync(resolve(dir,'requests.jsonl'))?readFileSync(resolve(dir,'requests.jsonl'),'utf8').split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean):[];
let cases=corpus;
if(args.ids){const ids=new Set(String(args.ids).split(','));cases=cases.filter(c=>ids.has(c.caseId));}
if(args['model-only'])cases=cases.filter(c=>c.modelSample);
if(args['main-only']&&!args.manifest)cases=cases.filter(c=>c.channel==='main');
if(args['whatsapp-only']&&!args.manifest)cases=cases.filter(c=>c.channel==='whatsapp');
cases=cases.slice(start,start+limit);
if(args.manifest)cases=expandExecutions(cases,args.channels||(args['main-only']?'main':args['whatsapp-only']?'whatsapp':undefined));
if(!cases.length)throw Error('No executions selected');
if(args.manifest&&args['cross-channel'])throw Error('Use --channels for an external manifest; legacy --cross-channel rewrites case IDs');
if(args['cross-channel'])cases=cases.filter(c=>c.channel==='main').map(c=>({...c,caseId:`${c.caseId}-wa`,channel:'whatsapp',crossChannelOf:c.caseId,scenario:{drafts:['Darragh','Pavit','Conference'],selectActive:'Darragh'}}));
const lockPath=resolve(dir,'runner.lock'),lock=openSync(lockPath,'wx');
writeFileSync(lock,JSON.stringify({pid:process.pid,runId,port,manifestSha256:manifest.sha256}));
process.once('exit',()=>{closeSync(lock);try{unlinkSync(lockPath);}catch(e){if(e.code!=='ENOENT')throw e;}});
let token='',executed=0,setupCalls=0,errors=0,plans=0,httpCalls=0,rawEvents=0,activeAttempt='support';
const httpStatuses={};
const journal=(row)=>{appendEvidence(rawPath,{runId,phase,at:new Date().toISOString(),seq:rawEvents++,...row},secrets);};
// Copy frozen semantics before contacting the host; never modify the input file.
writeFileSync(resolve(dir,`manifest-${runId}.jsonl`),corpus.map(row=>JSON.stringify(sanitize(row,secrets))).join('\n')+'\n',{flag:'wx'});
journal({kind:'run-start',manifest:{path:manifest.path,sha256:manifest.sha256,records:corpus.length},selected:cases,config:{port,base,args,node:process.version},runnerSha,runnerHash});
async function waitForHost(){
 const deadline=Date.now()+30000;let last;
 while(Date.now()<deadline){
   try{const r=await fetch(base+'/campaign/status',{signal:AbortSignal.timeout(500)});const m=await r.json();if(m.sha===runnerSha&&m.harnessHashes?.['scripts/order-campaign/run.mjs']===runnerHash&&m.supplierGuard&&m.fixtureOnly&&m.realTransportDisabled&&m.port===port&&resolve(m.artifacts)===dir)return m;throw Error('Expected matching SHA/harness, artifact directory and port on the guarded fixture host');}
   catch(error){last=error;await new Promise(r=>setTimeout(r,200));}
 }
 throw last||Error('Campaign host did not become ready');
}
let meta=await waitForHost();
const http=async(path,body,attempt='support',auth=token,options={})=>{
 const callId=`${runId}:${++httpCalls}`,method=options.method||(body===undefined?'GET':'POST');
 journal({kind:'http-request',callId,attempt,role:attempt.startsWith('support')?'support':'execution',method,path,body:body??null,headers:options.headers||{}});
 const begin=performance.now();let result;
 try{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{}) ,'X-Campaign-Attempt':attempt,...options.headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(meta.mode==='real-model-enabled'?180000:45000),redirect:'error'});const txt=await response.text();let json;try{json=JSON.parse(txt)}catch{json={raw:txt}}if(json?.token)secrets.push(json.token);result={status:response.status,response:json,rawText:txt,responseBytes:Buffer.byteLength(txt),elapsedMs:Math.round(performance.now()-begin)};}catch(e){result={status:null,response:null,error:{name:e.name,message:e.message},elapsedMs:Math.round(performance.now()-begin)}}
 httpStatuses[result.status??'transport-error']=(httpStatuses[result.status??'transport-error']||0)+1;
 const out={callId,method,path,body:body===undefined?null:body,...result};journal({kind:'http-response',attempt,...out});return out;
};
const support=async(path,body)=>{setupCalls++;const r=await http(path,body,`support:${activeAttempt}`);if(r.status<200||r.status>=300||r.status===null)throw Error(`support ${path} HTTP ${r.status}`);return r.response};
async function reset(person='p-aino',names=[],fixture={}){
 await support('/api/reset',{});token=(await support('/api/session',{personId:person})).token;
 await support('/api/clock',{time:'2026-11-14T10:00:00Z'});
 if(fixture.noSeedEvent)await support('/campaign/fixture-remove-default-event',{});
 const drafts=[];
 for(const name of names){const basket=(await support('/api/baskets',{name,deliveryDate:'2026-11-16',guests:100})).basket;drafts.push(basket);}
 if(names.length&&fixture.seedLines!==false){
   // Seed a real saved draft line via production HTTP, with the known fixture SKU.
   const parsed=await support('/api/messages',{text:'2 kg salmon 469672'});
   for(const draft of drafts){const r=await support('/api/requests',{request:{...parsed.request,neededBy:'2026-11-16'},eventId:draft.id,reviewing:true});if(r.plan?.proposal)await support(`/api/plans/${r.plan.id}/basket`,{continueWithWarnings:true});}
 }
 if(fixture.chat)await support('/api/whatsapp/connect',{displayName:'Synthetic campaign'});
 if(fixture.actorAfterSeed)token=(await support('/api/session',{personId:fixture.actorAfterSeed})).token;
 return {clock:'2026-11-14T10:00:00Z',person,effectivePerson:fixture.actorAfterSeed||person,removedDefaultEvent:!!fixture.noSeedEvent,drafts,selectActive:fixture.selectActive||null,seededLines:names.length&&fixture.seedLines!==false?[{productId:'469672',quantityKg:2,via:'production parse/plan/basket endpoints'}]:[]};
}
function status(extra={}){
 const all=[...previous,...currentRows];
 const s={role:'generator',state:'running',updatedAt:new Date().toISOString(),runId,phase,sha:meta.sha,modelMode:meta.mode,manifestSha256:manifest.sha256,generated:corpus.length,uniqueExecuted:new Set(all.map(r=>r.caseId)).size,executedRows:all.length,runExecuted:executed,runPlanned:plans,runErrors:errors,runSetupCalls:setupCalls,httpCalls,rawEvents,elapsedMs:Date.now()-runStarted,port,supplierGuard:'fixture-only network guard; no upstream supplier traffic',...extra};
 const tmp=resolve(dir,`generator-status.${process.pid}.tmp.json`);
 writeFileSync(tmp,JSON.stringify(s,null,2));
 // Windows readers can transiently prevent replacement. Status publication
 // must never turn one completed HTTP observation into a second execution row.
 try{renameSync(tmp,resolve(dir,'generator-status.json'));}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code))throw e;}
}
const currentRows=[];
function record(row){
 appendEvidence(resolve(dir,'requests.jsonl'),{...row,manifestSha256:manifest.sha256,hostInstanceId:meta.instanceId,hostDirty:meta.dirty,verdict:'not_evaluated'},secrets);currentRows.push(row);executed++;if(!row.unsupported&&(row.status===null||row.status>=500))errors++;if(executed%10===0)status();
}
status({selected:cases.length});
journal({kind:'host-config',metadata:meta});
const runInitialState=await support('/campaign/state');journal({kind:'run-initial-state',state:runInitialState});
let initial;
for(let retry=0;retry<4;retry++){
 try{initial=await reset();break;}
 catch(error){if(retry===3)throw error;meta=await waitForHost();await new Promise(r=>setTimeout(r,250));}
}
for(const c of cases){
 const attemptId=randomUUID(),caseStarted=Date.now();activeAttempt=attemptId;
 journal({kind:'case-start',attemptId,case:c});
 let scenario=initial,related=[],snapshots={},body,path;
 try{
   if(args.manifest&&c.channel!=='whatsapp')scenario=await reset(c.scenario?.person||'p-aino',[],c.scenario||{});
   if(c.channel==='whatsapp'){
     const fixture=args.manifest?{noSeedEvent:true,seedLines:false,...(!c.scenario?{selectActive:'Campaign'}:{}),...c.scenario,chat:true}:{...c.scenario,chat:true};
     scenario=await reset(c.scenario?.person||'p-aino',c.scenario?.drafts||(args.manifest?['Campaign']:['Darragh','Pavit','Conference']),fixture);
   }
   snapshots.persistedBefore=await support('/campaign/state');
   const before=await support('/campaign/telemetry');const cursor=before.count;
   if(c.channel==='gateway'||(c.channel==='main'&&(explicitSteps(c)||(args.manifest&&c.sequence?.length>1)))||!['main','whatsapp'].includes(c.channel)){
     const output=c.channel==='main'&&!explicitSteps(c)?{unsupported:'The web API has no natural-language conversation state; use explicit structured HTTP steps or the simulator channel'}:['gateway','main'].includes(c.channel)?await executeSteps(c,async step=>{
       let auth=token;
       if(step.auth==='none')auth='';
       else if(step.auth==='agent')auth='agent_demo_hotel_aurora';
       else if(step.auth==='approver'||step.auth==='chef')auth=(await support('/api/session',{personId:step.auth==='approver'?'p-sanna':'p-aino'})).token;
       return http(step.path,step.body,attemptId,auth,{method:step.method,headers:step.headers});
     }):{unsupported:`Channel ${c.manifestChannel||c.channel} is not executed by this HTTP runner`};
     related=output.related||[];
     snapshots.persistedAfter=await support('/campaign/state');
     const telemetry=await support(`/campaign/telemetry?since=${cursor}`),main=output.main;
     journal({kind:'case-complete',attemptId,elapsedMs:Date.now()-caseStarted});
     record({...c,attemptId,timestamp:new Date().toISOString(),phase,runId,scenario,sha:meta.sha,modelMode:meta.mode,parserMode:meta.mode,status:main?.status??null,response:main?.response??null,http:main?{method:main.method,path:main.path,body:main.body}:null,elapsedMs:Date.now()-caseStarted,related,snapshots,telemetry:telemetry.events,unsupported:output.unsupported||null,executionState:output.unsupported?'unsupported':'observed'});
   }else if(c.channel==='whatsapp'){
     snapshots.before=await support('/api/baskets');snapshots.draftDetailsBefore=[];
     for(const d of scenario.drafts)snapshots.draftDetailsBefore.push(await support(`/api/baskets/${d.id}`));
     if(scenario.selectActive)related.push({...await http('/api/whatsapp/messages',{id:`${attemptId}:select`,text:scenario.selectActive,groupId:'demo-hotel-orders'},attemptId),purpose:'select-active-order'});
     if(c.scenario?.actorAfterSeed)await support('/api/whatsapp/connect',{displayName:'Synthetic restricted actor'});
     const sequence=(c.sequence||[c.input]).map(text=>text.replaceAll('{DarraghId}',scenario.drafts.find(d=>d.name==='Darragh')?.id||'missing-order'));let main;
     for(const [i,text] of sequence.entries()){
       body={id:`${attemptId}:${i}`,text,groupId:'demo-hotel-orders'};
       const r=await http('/api/whatsapp/messages',body,attemptId);related.push(r);main??=r;
     }
     if(c.special==='delivery_replay'){
       const same=related.at(-1);related.push({...await http(same.path,same.body,attemptId),purpose:'same-delivery-id-retry'});
       related.push({...await http(same.path,{...same.body,text:'remove salmon'},attemptId),purpose:'changed-content-delivery-replay'});
     }
     if(c.special==='reconnect_replay'){
       const prior=related.at(-1);await support('/api/whatsapp/disconnect',{});await support('/api/whatsapp/connect',{});
       related.push({...await http(prior.path,prior.body,attemptId),purpose:'prior-delivery-after-reconnect'});
     }
     if(c.special==='older_delivery_replay'){
       snapshots.sessionBeforeOlderRetry=await support('/api/whatsapp/session');
       const prior=related[1];related.push({...await http(prior.path,prior.body,attemptId),purpose:'older-completed-delivery-with-newer-pending'});
       snapshots.sessionAfterOlderRetry=await support('/api/whatsapp/session');
     }
     snapshots.after=await support('/api/baskets');snapshots.orders=await support('/api/orders');snapshots.draftDetailsAfter=[];
     for(const d of scenario.drafts)snapshots.draftDetailsAfter.push(await support(`/api/baskets/${d.id}`));
     snapshots.persistedAfter=await support('/campaign/state');
     const t=await support(`/campaign/telemetry?since=${cursor}`);journal({kind:'case-complete',attemptId,elapsedMs:Date.now()-caseStarted});record({...c,input:main.body.text,seedInput:c.input,attemptId,timestamp:new Date().toISOString(),phase,runId,scenario,sha:meta.sha,parserMode:meta.mode,modelMode:meta.mode,model:meta.model,supplierInterception:true,http:{method:main.method,path:main.path,body:main.body},status:main.status,response:main.response,elapsedMs:Date.now()-caseStarted,related,snapshots,telemetry:t.events});
   }else{
     const sequence=c.sequence||[c.input];let r;
     if(!sequence.length||sequence.some(text=>typeof text!=='string'))throw Error('Natural-language /api sequence must contain strings');
     for(const text of sequence){r=await http('/api/messages',{text},attemptId);if(sequence.length>1)related.push({...r,purpose:'stateless-web-message-sequence'});}
     if(c.plan&&!args['parse-only']&&r.response?.request){
       // Keep original parsing intact. In a documented planning scenario, the
       // user's selected order supplies its date when free text omitted it.
       const request=r.response.request,planBody={request:{...request,neededBy:request.neededBy||'2026-11-16'},reviewing:true};
       related.push({...await http('/api/requests',planBody,attemptId),purpose:'parse-to-plan',dateSource:request.neededBy?'input':'explicit campaign selected-order fixture date'});plans++;
       const pl=related.at(-1).response?.plan;
       if(pl?.id)snapshots.plan=await support(`/api/plans/${pl.id}`);
       snapshots.orders=await support('/api/orders');
     }
     snapshots.persistedAfter=await support('/campaign/state');
     const t=await support(`/campaign/telemetry?since=${cursor}`);journal({kind:'case-complete',attemptId,elapsedMs:Date.now()-caseStarted});record({...c,attemptId,timestamp:new Date().toISOString(),phase,runId,scenario,sha:meta.sha,parserMode:r.response?.request?.parsedBy||meta.mode,modelMode:meta.mode,model:meta.model,supplierInterception:true,http:{method:r.method,path:r.path,body:r.body},status:r.status,response:r.response,elapsedMs:Date.now()-caseStarted,related,snapshots,telemetry:t.events,...(r.error?{error:r.error}:{})});
   }
 }catch(e){try{snapshots.persistedAfter=await support('/campaign/state');}catch(stateError){snapshots.stateError={name:stateError.name,message:stateError.message};}journal({kind:'case-error',attemptId,error:{name:e.name,message:e.message},elapsedMs:Date.now()-caseStarted});record({...c,attemptId,timestamp:new Date().toISOString(),phase,runId,scenario,sha:meta.sha,parserMode:meta.mode,modelMode:meta.mode,http:{method:'POST',path:c.channel==='whatsapp'?'/api/whatsapp/messages':'/api/messages',body:{text:c.input}},status:null,response:null,elapsedMs:Date.now()-caseStarted,related,snapshots,error:{name:e.name,message:e.message}});}
 if(executed%25===0)console.log(JSON.stringify({runId,executed,selected:cases.length,plans,errors,caseId:c.caseId}));
 // Serialize expensive plans and chat state. Real 429s trigger bounded backoff.
 const last=currentRows.at(-1);if(last.telemetry?.some(t=>t.status===429))await new Promise(r=>setTimeout(r,10000));
}
activeAttempt='run-final';
const runFinalState=await support('/campaign/state');journal({kind:'run-final-state',state:runFinalState});
const manifestUnchanged=createHash('sha256').update(readFileSync(manifest.path)).digest('hex')===manifest.sha256;
const counters={caseObservations:executed,parseToPlanCalls:plans,observedServerOrTransportErrors:errors,supportCalls:setupCalls,httpCalls,executionCalls:httpCalls-setupCalls,httpStatuses,unsupported:currentRows.filter(r=>r.unsupported).length,caseErrors:currentRows.filter(r=>r.error).length,supplierBlocks:currentRows.flatMap(r=>r.telemetry||[]).filter(t=>t.kind==='supplier_blocked').length,modelHttpCalls:currentRows.flatMap(r=>r.telemetry||[]).filter(t=>t.kind==='model').length};
journal({kind:'run-complete',counters,manifestUnchanged,elapsedMs:Date.now()-runStarted});
status({state:'batch-complete',selected:cases.length});
writeFileSync(resolve(dir,`generator-${runId}.json`),JSON.stringify(sanitize({runId,phase,sha:meta.sha,host:meta,manifest:{path:manifest.path,sha256:manifest.sha256,unchanged:manifestUnchanged},mode:meta.mode,executed,plans,errors,setupCalls,counters,rawEvents,elapsedMs:Date.now()-runStarted,unsupported:counters.unsupported,perChannel:Object.fromEntries([...new Set(currentRows.map(r=>r.channel))].map(channel=>[channel,currentRows.filter(r=>r.channel===channel).length])),caseIds:cases.map(c=>c.caseId),initialState:runInitialState,finalState:runFinalState},secrets),null,2));
console.log(JSON.stringify({runId,sha:meta.sha,executed,plans,errors,setupCalls}));
if(!manifestUnchanged)throw Error('Manifest changed during execution; evidence retained, run invalid');
