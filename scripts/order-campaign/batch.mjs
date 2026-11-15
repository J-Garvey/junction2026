import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultArtifacts } from './generate.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const[k,...v]=a.replace(/^--/,'').split('=');return[k,v.join('=')||true]}));
const dir=resolve(args.dir||defaultArtifacts),git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
const run=(file,a=[])=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[file,...a],{stdio:'inherit',windowsHide:true});p.on('exit',code=>code===0?resolve():reject(Error(`${file}: ${code}`)))});
const first=Number(args.start||0),last=Number(args.end||readFileSync(resolve(dir,'corpus.jsonl'),'utf8').trim().split('\n').length),size=100;
for(let start=first;start<last;start+=size){
 git('fetch','origin');const main=git('rev-parse','origin/main');
 let meta;
 for(let retry=0;retry<4;retry++){
   try{meta=await(await fetch('http://127.0.0.1:8891/campaign/status')).json();break;}
   catch(error){if(retry===3)throw error;await new Promise(r=>setTimeout(r,250*(retry+1)));}
 }
 let behind=false;try{git('merge-base','--is-ancestor',main,'HEAD')}catch{behind=true;}
 appendFileSync(resolve(dir,'generator-refresh.jsonl'),JSON.stringify({at:new Date().toISOString(),action:'batch-fetch',start,main,hostSha:meta.sha,behind,fixManifestBytes:['fixes-main.jsonl','fixes-whatsapp.jsonl'].map(p=>({path:p,length:existsSync(resolve(dir,p))?readFileSync(resolve(dir,p)).length:0}))})+'\n');
 if(behind){
   console.log(JSON.stringify({state:'refreshing-own-clean-checkout',start,main}));
   await run(resolve('scripts/order-campaign/refresh.mjs'),['refresh']);
   const corpus=readFileSync(resolve(dir,'corpus.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
   const ids=corpus.filter(c=>c.tags?.includes('published_finding_replay')||['nl-00009','nl-00012','nl-00013','nl-00022','nl-00034','nl-00035','nl-00051'].includes(c.caseId)).map(c=>c.caseId);
   await run(resolve('scripts/order-campaign/run.mjs'),[`--dir=${dir}`,'--phase=automatic-merged-replay',`--ids=${ids.join(',')}`,'--limit=100']);
 }
 await run(resolve('scripts/order-campaign/run.mjs'),[`--dir=${dir}`,`--phase=${args.phase||'baseline'}`,`--start=${start}`,`--limit=${Math.min(size,last-start)}`]);
}
