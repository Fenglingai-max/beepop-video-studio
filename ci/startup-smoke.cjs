'use strict';
// Windows integration only: no OpenAI inference or user credentials.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
async function main(){const root=path.resolve(process.argv[2]);assert.match(root,/Windows 中文 test/);
 const env={...process.env,BEEPOP_PORT:'47839',BEEPOP_NO_OPEN:'1'},base='http://127.0.0.1:47839';let started=false;
 let executable=process.execPath;const run=action=>{const r=cp.spawnSync(executable,[root+'/windows-service.cjs',action],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:30000});console.log(r.stdout);if(r.status!==0)throw Error(r.stderr||'launcher failed');return r};
 try{const prep=cp.spawnSync(process.env.ComSpec||'cmd.exe',['/d','/c','call prepare-runtime.cmd'],{cwd:root,env:{...env,BEEPOP_FORCE_PORTABLE:'1'},encoding:'utf8',windowsHide:true,timeout:360000});console.log(prep.stdout);assert.equal(prep.status,0,prep.stderr);executable=path.join(root,'data','runtime','node-v24.19.0-win-x64','node.exe');const runtime=cp.spawnSync(executable,['-p','process.versions.node+":"+process.arch'],{encoding:'utf8',windowsHide:true});assert.equal(runtime.status,0);assert.equal(runtime.stdout.trim(),'24.19.0:x64');await fs.mkdir(root+'/data',{recursive:true});await fs.writeFile(root+'/data/dependencies.sha256',crypto.createHash('sha256').update(await fs.readFile(root+'/pnpm-lock.yaml')).digest('hex'));
  run('start');started=true;let state,warming=false;
  for(let i=0;i<180;i++){const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1500)});state=await r.json();assert.equal(state.version,'0.4.1');if(!state.ready){warming=true;assert.match(await(await fetch(base+'/relay-connect')).text(),/startup.js/)}if(state.failed)throw Error(state.message);if(state.ready)break;await new Promise(r=>setTimeout(r,500))}
  assert.equal(state.ready,true,'actual startup reaches ready');await new Promise(r=>setTimeout(r,1500));assert.equal((await(await fetch(base+'/health')).json()).ready,true,'background survives launcher exit');run('start');
  run('stop');for(let i=0;i<20;i++){try{await fetch(base+'/health',{signal:AbortSignal.timeout(500)});await new Promise(r=>setTimeout(r,200))}catch{started=false;break}}assert.equal(started,false,'owned background server stops cleanly');
  await fs.writeFile(root+'/data/startup-summary.json',JSON.stringify({platform:process.platform,version:'0.4.1',unicodeAndSpacePath:true,officialPortableRuntime:true,warmingObserved:warming,ready:true,survivedLauncherExit:true,duplicateStart:true,ownedStop:true,inferenceSubmitted:false},null,2));console.log('PASS: actual Windows background startup, Unicode/spaces, ready state, repeat launch, survives launcher exit, authenticated stop; no inference');
 }finally{if(started)try{run('stop')}catch{}}
}
main().catch(e=>{console.error('::error::'+String(e.message).replace(/\r?\n/g,' '));console.error(e);process.exitCode=1});
