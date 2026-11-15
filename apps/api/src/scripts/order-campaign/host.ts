/** Isolated campaign host. Never connects a real WhatsApp transport. */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
process.env.PORT = '8891';
const artifacts = resolve(process.env.CAMPAIGN_DIR || 'C:/Users/benfh/junction-trials/order-inputs-20261115');
mkdirSync(resolve(artifacts,'generator-runtime'),{recursive:true});
process.env.AIMO_DB = resolve(artifacts,'generator-runtime/aimo.db');
process.env.WHATSAPP_AUTH_DIR = resolve(artifacts,'generator-runtime/whatsapp-unused');
process.env.AIMO_MODE='fixture';process.env.AIMO_SEARCH_LOG='off';process.env.PREVIEW_PASSWORD='';
// Environment override prevents config's .env loader from restoring a key.
const realModel=process.env.CAMPAIGN_MODEL==='real';
if(!realModel)process.env.OPENAI_API_KEY='';
const { config }=await import('../../config.js');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const nativeFetch=globalThis.fetch;
const context=new AsyncLocalStorage<{attempt:string}>();
const telemetry:any[]=[];
globalThis.fetch=async(input:any,init?:any)=>{
  const url=String(input?.url??input),attempt=context.getStore()?.attempt??null;
  const supplier=url.startsWith(config.aimoBase),model=url.startsWith(config.openai.baseUrl);
  if(supplier){
    let body;try{body=JSON.parse(init?.body??'{}');}catch{body={};}
    const row={kind:'supplier_blocked',at:new Date().toISOString(),attempt,path:new URL(url).pathname,products:body.products??[],reason:'campaign prevents missing-fixture live supplier traffic'};
    telemetry.push(row);appendFileSync(resolve(artifacts,'generator-supplier-guard.jsonl'),JSON.stringify(row)+'\n');
    return new Response(JSON.stringify({error:'campaign_fixture_miss',products:row.products}),{status:503,headers:{'Content-Type':'application/json'}});
  }
  const start=performance.now();
  try{
    const response=await nativeFetch(input,init);
    if(model){let body;try{body=JSON.parse(init?.body??'{}');}catch{body={};}const row={kind:'model',at:new Date().toISOString(),attempt,status:response.status,elapsedMs:Math.round(performance.now()-start),model:body.model,schema:body.text?.format?.name??body.response_format?.json_schema?.name??null};telemetry.push(row);appendFileSync(resolve(artifacts,'generator-model-telemetry.jsonl'),JSON.stringify(row)+'\n');}
    return response;
  }catch(error){if(model){const row={kind:'model',at:new Date().toISOString(),attempt,status:null,error:(error as Error).name,elapsedMs:Math.round(performance.now()-start)};telemetry.push(row);appendFileSync(resolve(artifacts,'generator-model-telemetry.jsonl'),JSON.stringify(row)+'\n');}throw error;}
};
const express=(await import('express')).default;
const {createApp}=await import('../../server.js');
const app=express();app.use((req,res,next)=>context.run({attempt:String(req.headers['x-campaign-attempt']??'support')},next));
app.get('/campaign/status',(_req,res)=>res.json({sha,mode:realModel?'real-model-enabled':'model-disabled',modelConfigured:!!config.openai.apiKey,model:config.openai.model,supplierGuard:true,telemetryCount:telemetry.length}));
app.get('/campaign/telemetry',(req,res)=>res.json({events:telemetry.slice(Number(req.query.since??0)),count:telemetry.length}));
app.use(createApp());
const server=app.listen(8891,'127.0.0.1',()=>{
  writeFileSync(resolve(artifacts,'generator-runtime/server.json'),JSON.stringify({pid:process.pid,sha,worktree:process.cwd(),mode:realModel?'real-model-enabled':'model-disabled',modelConfigured:!!config.openai.apiKey,model:config.openai.model,port:8891},null,2));
  console.log(JSON.stringify({port:8891,sha,mode:realModel?'real-model-enabled':'model-disabled',modelConfigured:!!config.openai.apiKey,model:config.openai.model,supplierGuard:true}));
});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
