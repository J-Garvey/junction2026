import { readFileSync, appendFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultArtifacts } from './generate.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return [k,v.join('=')||true]}));
const dir=resolve(args.dir||defaultArtifacts),base='http://127.0.0.1:8891';
mkdirSync(dir,{recursive:true});
const phase=String(args.phase||'baseline'),start=Number(args.start||0),limit=Number(args.limit||100),runId=`${phase}-${Date.now()}`;
const corpus=readFileSync(resolve(dir,'corpus.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const previous=existsSync(resolve(dir,'requests.jsonl'))?readFileSync(resolve(dir,'requests.jsonl'),'utf8').split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean):[];
let cases=corpus;
if(args.ids){const ids=new Set(String(args.ids).split(','));cases=cases.filter(c=>ids.has(c.caseId));}
if(args['model-only'])cases=cases.filter(c=>c.modelSample);
if(args['whatsapp-only'])cases=cases.filter(c=>c.channel==='whatsapp');
cases=cases.slice(start,start+limit);
if(args['cross-channel'])cases=cases.filter(c=>c.channel==='main').map(c=>({...c,caseId:`${c.caseId}-wa`,channel:'whatsapp',crossChannelOf:c.caseId,scenario:{drafts:['Darragh','Pavit','Conference'],selectActive:'Darragh'}}));
let token='',executed=0,setupCalls=0,errors=0,plans=0;
let meta=await (await fetch(base+'/campaign/status')).json();
const http=async(path,body,attempt='support',auth=token)=>{
 const begin=performance.now();let result;
 try{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{}) ,'X-Campaign-Attempt':attempt},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(meta.mode==='real-model-enabled'?180000:45000)});const txt=await response.text();let json;try{json=JSON.parse(txt)}catch{json={raw:txt}}result={status:response.status,response:json,elapsedMs:Math.round(performance.now()-begin)};}catch(e){result={status:null,response:null,error:{name:e.name,message:e.message},elapsedMs:Math.round(performance.now()-begin)}}
 return {method:body===undefined?'GET':'POST',path,body:body===undefined?null:body,...result};
};
const support=async(path,body)=>{setupCalls++;const r=await http(path,body);if(r.status<200||r.status>=300||r.status===null)throw Error(`support ${path} HTTP ${r.status}`);return r.response};
async function reset(person='p-aino',names=[],fixture={}){
 await support('/api/reset',{});token=(await support('/api/session',{personId:person})).token;
 await support('/api/clock',{time:'2026-11-14T10:00:00Z'});
 if(fixture.noSeedEvent)await support('/campaign/fixture-remove-default-event',{});
 const drafts=[];
 for(const name of names){const basket=(await support('/api/baskets',{name,deliveryDate:'2026-11-16',guests:100})).basket;drafts.push(basket);}
 if(names.length){
   // Seed a real saved draft line via production HTTP, with the known fixture SKU.
   const parsed=await support('/api/messages',{text:'2 kg salmon 469672'});
   for(const draft of drafts){const r=await support('/api/requests',{request:{...parsed.request,neededBy:'2026-11-16'},eventId:draft.id,reviewing:true});if(r.plan?.proposal)await support(`/api/plans/${r.plan.id}/basket`,{continueWithWarnings:true});}
 }
 if(fixture.chat)await support('/api/whatsapp/connect',{displayName:'Synthetic campaign'});
 if(fixture.actorAfterSeed)token=(await support('/api/session',{personId:fixture.actorAfterSeed})).token;
 return {clock:'2026-11-14T10:00:00Z',person,effectivePerson:fixture.actorAfterSeed||person,removedDefaultEvent:!!fixture.noSeedEvent,drafts,seededLines:names.length?[{productId:'469672',quantityKg:2,via:'production parse/plan/basket endpoints'}]:[]};
}
function status(extra={}){
 const all=[...previous,...currentRows];
 const s={role:'generator',state:'running',updatedAt:new Date().toISOString(),runId,phase,sha:meta.sha,modelMode:meta.mode,generated:corpus.length,uniqueExecuted:new Set(all.map(r=>r.caseId)).size,executedRows:all.length,runExecuted:executed,runPlanned:plans,runErrors:errors,runSetupCalls:setupCalls,port:8891,supplierGuard:'intercepts all missing-fixture supplier calls with HTTP 503; no upstream supplier traffic',...extra};
 const tmp=resolve(dir,`generator-status.${process.pid}.tmp.json`);
 writeFileSync(tmp,JSON.stringify(s,null,2));
 // Windows readers can transiently prevent replacement. Status publication
 // must never turn one completed HTTP observation into a second execution row.
 try{renameSync(tmp,resolve(dir,'generator-status.json'));}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code))throw e;}
}
const currentRows=[];
function record(row){
 let text=JSON.stringify(row);
 for(const [name,value]of Object.entries(process.env))if(/(?:KEY|PASSWORD|SECRET|TOKEN)$/.test(name)&&value&&value.length>8)text=text.replaceAll(value,'[credential omitted]');
 text=text.replace(/sk-[A-Za-z0-9_*.-]{6,}/g,'[key omitted]');
 appendFileSync(resolve(dir,'requests.jsonl'),text+'\n');currentRows.push(row);executed++;if(row.status===null||row.status>=500)errors++;if(executed%10===0)status();
}
status({selected:cases.length});
let initial=await reset();
for(const c of cases){
 const attemptId=`${c.caseId}:${runId}:${randomUUID().slice(0,8)}`;
 let scenario=initial,related=[],snapshots={},body,path;
 try{
   if(c.channel==='whatsapp')scenario=await reset(c.scenario?.person||'p-aino',c.scenario?.drafts||['Darragh','Pavit','Conference'],{...c.scenario,chat:true});
   const before=await support('/campaign/telemetry');const cursor=before.count;
   if(c.channel==='whatsapp'){
     snapshots.before=await support('/api/baskets');snapshots.draftDetailsBefore=[];
     for(const d of scenario.drafts)snapshots.draftDetailsBefore.push(await support(`/api/baskets/${d.id}`));
     if(c.scenario?.selectActive)related.push({...await http('/api/whatsapp/messages',{id:`${attemptId}:select`,text:c.scenario.selectActive,groupId:'demo-hotel-orders'},attemptId),purpose:'select-active-order'});
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
     snapshots.after=await support('/api/baskets');snapshots.orders=await support('/api/orders');snapshots.draftDetailsAfter=[];
     for(const d of scenario.drafts)snapshots.draftDetailsAfter.push(await support(`/api/baskets/${d.id}`));
     const t=await support('/campaign/telemetry');record({...c,input:main.body.text,seedInput:c.input,attemptId,timestamp:new Date().toISOString(),phase,runId,scenario,sha:meta.sha,parserMode:meta.mode,modelMode:meta.mode,model:meta.model,supplierInterception:true,http:{method:main.method,path:main.path,body:main.body},status:main.status,response:main.response,elapsedMs:related.reduce((n,r)=>n+r.elapsedMs,0),related,snapshots,telemetry:t.events.slice(cursor)});
   }else{
     const r=await http('/api/messages',{text:c.input},attemptId);
     if(c.plan&&r.response?.request){
       // Keep original parsing intact. In a documented planning scenario, the
       // user's selected order supplies its date when free text omitted it.
       const request=r.response.request,planBody={request:{...request,neededBy:request.neededBy||'2026-11-16'},reviewing:true};
       related.push({...await http('/api/requests',planBody,attemptId),purpose:'parse-to-plan',dateSource:request.neededBy?'input':'explicit campaign selected-order fixture date'});plans++;
       const pl=related.at(-1).response?.plan;
       if(pl?.id)snapshots.plan=await support(`/api/plans/${pl.id}`);
       snapshots.orders=await support('/api/orders');
     }
     const t=await support('/campaign/telemetry');record({...c,attemptId,timestamp:new Date().toISOString(),phase,runId,scenario,sha:meta.sha,parserMode:r.response?.request?.parsedBy||meta.mode,modelMode:meta.mode,model:meta.model,supplierInterception:true,http:{method:r.method,path:r.path,body:r.body},status:r.status,response:r.response,elapsedMs:r.elapsedMs,related,snapshots,telemetry:t.events.slice(cursor),...(r.error?{error:r.error}:{})});
   }
 }catch(e){record({...c,attemptId,timestamp:new Date().toISOString(),phase,runId,scenario,sha:meta.sha,parserMode:meta.mode,modelMode:meta.mode,http:{method:'POST',path:c.channel==='whatsapp'?'/api/whatsapp/messages':'/api/messages',body:{text:c.input}},status:null,response:null,elapsedMs:0,related,snapshots,error:{name:e.name,message:e.message}});}
 if(executed%25===0)console.log(JSON.stringify({runId,executed,selected:cases.length,plans,errors,caseId:c.caseId}));
 // Serialize expensive plans and chat state. Real 429s trigger bounded backoff.
 const last=currentRows.at(-1);if(last.telemetry?.some(t=>t.status===429))await new Promise(r=>setTimeout(r,10000));
}
status({state:'batch-complete',selected:cases.length});
writeFileSync(resolve(dir,`generator-${runId}.json`),JSON.stringify({runId,phase,sha:meta.sha,mode:meta.mode,executed,plans,errors,setupCalls,caseIds:cases.map(c=>c.caseId)},null,2));
console.log(JSON.stringify({runId,sha:meta.sha,executed,plans,errors,setupCalls}));
