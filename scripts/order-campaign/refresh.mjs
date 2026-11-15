/** Fetch/replay entrypoint. Mutates only this checkout and our recorded host PID. */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, openSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultArtifacts } from './generate.mjs';
const dir=resolve(process.env.CAMPAIGN_DIR||defaultArtifacts),root=process.cwd();
const command=process.argv[2]||'refresh',mode=process.argv.includes('--real')?'real':'fallback';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
async function stop(){
 const path=resolve(dir,'generator-runtime/server.json');if(!existsSync(path))return;
 const state=JSON.parse(readFileSync(path,'utf8'));
 if(state.port!==8891||!state.worktree||!resolve(state.worktree).toLowerCase().startsWith(root.toLowerCase()))throw Error('Recorded process is not owned by this worktree');
 try{process.kill(state.pid)}catch(e){if(e.code!=='ESRCH')throw e;}
 for(let i=0;i<20;i++){try{await fetch('http://127.0.0.1:8891/healthz',{signal:AbortSignal.timeout(100)});await new Promise(r=>setTimeout(r,100));}catch{return;}}
 throw Error('Own server did not stop');
}
if(command==='stop'){await stop();process.exit(0);}
const before=git('rev-parse','HEAD');let after=before;
if(command==='refresh'){
 if(git('status','--porcelain'))throw Error('Commit the task checkout before refresh');
 git('fetch','origin');const main=git('rev-parse','origin/main');
 try{git('merge-base','--is-ancestor',main,'HEAD');}catch{await stop();git('merge','--no-edit','origin/main');}
 after=git('rev-parse','HEAD');
}
await stop();
const out=openSync(resolve(dir,'generator-runtime/host.log'),'a');
const child=spawn(process.execPath,[resolve(root,'apps/api/node_modules/tsx/dist/cli.mjs'),resolve(root,'apps/api/src/scripts/order-campaign/host.ts')],{cwd:root,env:{...process.env,CAMPAIGN_DIR:dir,CAMPAIGN_MODEL:mode},windowsHide:true,detached:true,stdio:['ignore',out,out]});
child.unref();
let ready;
for(let i=0;i<100;i++){try{ready=await(await fetch('http://127.0.0.1:8891/campaign/status',{signal:AbortSignal.timeout(200)})).json();break;}catch{await new Promise(r=>setTimeout(r,100));}}
if(!ready)throw Error('Campaign host did not become ready');
const row={at:new Date().toISOString(),action:command,before,after,originMain:git('rev-parse','origin/main'),...ready};
appendFileSync(resolve(dir,'generator-refresh.jsonl'),JSON.stringify(row)+'\n');
console.log(JSON.stringify(row));
// Keep the host in this foreground tool job when requested. Some Windows job
// hosts terminate detached descendants after their launching command exits.
if(process.argv.includes('--hold')){child.ref();await new Promise(r=>child.once('exit',r));}
