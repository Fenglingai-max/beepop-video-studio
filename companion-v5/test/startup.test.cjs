'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createServer}=require('../server.cjs');
test('preparation page is available before dependencies, gates account work, and retries only with local CSRF',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'beepop-startup-'));let accounts=0,retries=0;
 const readiness={ready:false,failed:false,stage:'voice',message:'模型下载 40%'};readiness.retry=()=>{retries++;readiness.failed=false};
 const engine={voices:()=>[]},codex={account:async()=>{accounts++;return{}},close(){}},secret='a'.repeat(64),port=47833,base='http://127.0.0.1:'+port;
 const server=createServer({port,dataDir:dir,readiness,codex,engine,serviceToken:secret});await new Promise(r=>server.listen(port,'127.0.0.1',r));
 try{
  const status=await(await fetch(base+'/health')).json();assert.equal(status.ready,false);assert.equal(status.stage,'voice');
  const response=await fetch(base+'/relay-connect?origin=https%3A%2F%2Fbeepoptvc-background.lnajqk.chatgpt.site&state='+'a'.repeat(48));const html=await response.text();assert.match(html,/startup.js/);assert.ok(!html.includes(secret));
  assert.equal((await fetch(base+'/local/account',{method:'POST'})).status,503);assert.equal(accounts,0);
  assert.equal((await fetch(base+'/jobs',{method:'POST'})).status,503);
  const hostStatus=await new Promise((resolve,reject)=>{const req=require('node:http').get(base+'/health',{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject)});assert.equal(hostStatus,403);
  assert.equal((await fetch(base+'/service/stop',{method:'POST',headers:{'X-BeePOP-Service':secret}})).status,409);
  readiness.failed=true;const csrf=JSON.parse(html.match(/id="startup-boot" type="application\/json">([^<]+)/)[1]).csrf;
  assert.equal((await fetch(base+'/local/startup/retry',{method:'POST',headers:{Origin:base}})).status,403);
  assert.equal((await fetch(base+'/local/startup/retry',{method:'POST',headers:{Origin:'https://evil.invalid','X-BeePOP-CSRF':csrf}})).status,403);
  assert.equal((await fetch(base+'/local/startup/retry',{method:'POST',headers:{Origin:base,'X-BeePOP-CSRF':csrf}})).status,202);assert.equal(retries,1);
  readiness.ready=true;assert.match(await(await fetch(base+'/relay-connect?origin=https%3A%2F%2Fbeepoptvc-background.lnajqk.chatgpt.site&state='+'a'.repeat(48))).text(),/relay-connect.js/);
 }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true})}
});
test('background stop requires a local management secret and rejects browser origins',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'beepop-stop-')),secret='b'.repeat(64),port=47834,base='http://127.0.0.1:'+port;let stopped;
 const done=new Promise(r=>stopped=r),server=createServer({port,dataDir:dir,codex:{close(){}},engine:{voices:()=>[]},serviceToken:secret,onServiceStop:stopped});await new Promise(r=>server.listen(port,'127.0.0.1',r));
 try{assert.equal((await fetch(base+'/service/stop',{method:'POST'})).status,403);assert.equal((await fetch(base+'/service/stop',{method:'POST',headers:{Origin:base,'X-BeePOP-Service':secret}})).status,403);assert.equal((await fetch(base+'/service/stop',{method:'POST',headers:{'X-BeePOP-Service':secret}})).status,200);await done;assert.equal(server.listening,false)}finally{if(server.listening)await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true})}
});
