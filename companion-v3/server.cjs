'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Codex}=require('./codex.cjs'),pipeline=require('./pipeline.cjs');
const {Relay,BASE:RELAY}=require('./relay.cjs');
const PUBLIC='https://fenglingai-max.github.io';
function token(){return crypto.randomBytes(32).toString('hex')}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
async function body(req,max=1024*1024){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(Error('提交资料超过大小限制。'),{status:413});chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString())}catch{throw Error('请求格式无效。')}}
function validateInput(input,available){
  if(input.consent!==true)throw Error('请先确认使用自己的 Codex 额度。');
  if(input.duration!=='15'||input.ratio!=='16:9'||input.model!=='tvc-2-local')throw Error('TVC 2.0 首版仅支持 15 秒横版。');
  if(typeof input.description!=='string'||!input.description.trim()||input.description.length>10000)throw Error('请填写 1–10000 字商品信息。');
  if(!Array.isArray(input.images)||input.images.length<1||input.images.length>6)throw Error('请提供 1–6 张商品图片。');
  let total=0;for(const image of input.images){if(typeof image.name!=='string'||image.name.length>250||typeof image.data!=='string'||!image.data.length||image.data.length>28*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))throw Error('图片资料无效或过大。');total+=Buffer.byteLength(image.data,'base64')}
  if(total>80*1024*1024)throw Error('图片合计不能超过 80 MB。');
  const voice=available.find(v=>v.id===input.voice);if(!voice)throw Error('所选本机声线不可用，请重新连接助手。');return voice;
}
function createServer({port=47831,codex=new Codex(),dataDir=path.join(__dirname,'data'),allowedOrigins=[PUBLIC],engine=pipeline}={}){
  const local='http://127.0.0.1:'+port,csrf=token(),sessions=new Map(),jobs=new Map(),caseCache=new Map();let active=null;
  const allowed=new Set([local,RELAY,...allowedOrigins]),capabilities={engine:'tvc-2-local',duration:'15',ratio:'16:9',platform:process.platform,voices:engine.voices()};
  const relay=new Relay({dataDir,account:()=>codex.account(),voices:()=>capabilities.voices,canRun:()=>!active,run:async(input,{signal,update})=>{
    if(active)throw Error('本机已有制作任务。');const voice=validateInput(input,capabilities.voices),controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)controller.abort();
    const job={id:input.id,dir:path.join(dataDir,input.id),description:input.description,files:input.images.map(x=>x.name),status:'running',stage:'prepare',message:'核对商品资料',percent:5};active={job,controller};
    const report=(stage,message,percent)=>{Object.assign(job,{stage,message,percent});update(stage,message,percent)};
    try{await fs.mkdir(dataDir,{recursive:true});const files=await engine.prepare(job,input.images);report('plan','Codex 正在理解商品与编排镜头',15);const plan=await codex.plan({cwd:job.dir,description:job.description,files,schema:engine.schema,signal:controller.signal});await fs.writeFile(path.join(job.dir,'plan.json'),JSON.stringify(plan,null,2));await engine.createScenes(job,plan,files,codex,{signal:controller.signal,update:report});job.output=await engine.produce(job,plan,files,{signal:controller.signal,update:report,voice});job.status='completed';return job.output}
    catch(e){job.status=controller.signal.aborted?'cancelled':'failed';job.message=e.message;throw e}finally{signal.removeEventListener('abort',abort);active=null;await fs.mkdir(job.dir,{recursive:true});await fs.writeFile(path.join(job.dir,'job-status.json'),JSON.stringify({id:job.id,status:job.status,stage:job.stage,message:job.message},null,2))}
  }});
  const allowedHost=new Set(['127.0.0.1:'+port,'localhost:'+port]);
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; frame-ancestors 'none'; connect-src 'self'; base-uri 'none'; form-action 'none'");
    if(!allowedHost.has(req.headers.host))return json(res,403,{error:'本机地址不匹配。'});
    const origin=req.headers.origin;
    if(origin&&!allowed.has(origin))return json(res,403,{error:'此网站未获准连接本机助手。'});
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
    if(req.method==='OPTIONS'){if(!origin)return json(res,403,{error:'Missing origin'});res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-BeePOP-CSRF');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');res.writeHead(204);return res.end()}
    const url=new URL(req.url,local);
    try{
      if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{service:'beepoptvc-local',version:'0.3.0',workspace:'/workspace'});
      if(req.method==='GET'&&url.pathname==='/relay-connect'){
        const origin=url.searchParams.get('origin'),state=url.searchParams.get('state');if(origin!==RELAY||!/^[a-f0-9]{48}$/.test(state||''))throw Error('请从官网发起连接。');
        const html=(await fs.readFile(path.join(__dirname,'relay-connect.html'),'utf8')).replace('__BOOT__',JSON.stringify({csrf,origin,state}));res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
      }
      if(req.method==='GET'&&url.pathname==='/relay-connect.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(await fs.readFile(path.join(__dirname,'relay-connect.js')))}
      const caseMatch=url.pathname.match(/^\/cases\/(coffee|perfume|flags|saturn|camping|grill|ghost)$/);
      if(req.method==='GET'&&caseMatch){const id=caseMatch[1];if(!caseCache.has(id)){const response=await fetch(PUBLIC+'/beepop-video-studio/case-'+id+'.json?v=20261022-13',{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('案例原始资料暂时不可用。');const data=await response.json();if(data.id!==id||typeof data.description!=='string'||!Array.isArray(data.images)||data.images.length>6)throw Error('案例资料格式无效。');caseCache.set(id,data)}return json(res,200,caseCache.get(id));}
      if(req.method==='GET'&&url.pathname==='/workspace'){
        const source=url.searchParams.get('origin')||PUBLIC,state=url.searchParams.get('state')||token();
        if(source!==PUBLIC||!/^[a-f0-9]{32,128}$/.test(state))throw Error('工作台来源无效。');
        const html=(await fs.readFile(path.join(__dirname,'workspace.html'),'utf8')).replace('__BOOT__',JSON.stringify({csrf,local,origin:source,state}));
        res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
      }
      if(req.method==='GET'&&['/workspace.js','/workspace.css'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');return res.end(await fs.readFile(path.join(__dirname,url.pathname.slice(1))))}
      if(req.method==='GET'&&url.pathname==='/connect'){
        const target=url.searchParams.get('origin'),state=url.searchParams.get('state');
        if(!allowed.has(target)||target===local||!/^[a-f0-9]{32,128}$/.test(state||''))return json(res,400,{error:'请从 beepoptvc 网页点击连接。'});
        const html=(await fs.readFile(path.join(__dirname,'connect.html'),'utf8')).replace('__BOOT__',JSON.stringify({csrf,origin:target,state,local}));
        res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
      }
      if(req.method==='GET'&&url.pathname==='/connect.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(await fs.readFile(path.join(__dirname,'connect.js')))}
      if(req.method==='GET'&&url.pathname==='/'){res.writeHead(302,{Location:'/workspace'});return res.end()}
      const admin=url.pathname.startsWith('/local/');
      if(admin){if(origin!==local||req.headers['x-beepop-csrf']!==csrf)return json(res,403,{error:'请在本机连接窗口操作。'});
        if(req.method==='POST'&&url.pathname==='/local/account'){const account=await codex.account();return json(res,200,{account,capabilities})}
        if(req.method==='POST'&&url.pathname==='/local/login'){if(active)throw Error('请等待当前任务结束后切换账号。');await codex.start();const login=await codex.rpc('account/login/start',{type:'chatgpt'});const auth=new URL(login.authUrl);if(auth.protocol!=='https:'||!['auth.openai.com','chatgpt.com'].includes(auth.hostname))throw Error('登录地址无效。');return json(res,200,{authUrl:login.authUrl})}
        if(req.method==='POST'&&url.pathname==='/local/relay/pair'){const data=await body(req);return json(res,200,await relay.approve(data))}
        if(req.method==='POST'&&url.pathname==='/local/pair'){
          const data=await body(req);if(!allowed.has(data.origin)||!/^[a-f0-9]{32,128}$/.test(data.state||'')||data.consent!==true)throw Error('连接请求无效。');
          const account=await codex.account();if(!account.signedIn)throw Error('请先使用 ChatGPT 登录。');
          const key=token();sessions.set(key,{origin:data.origin,email:account.email,expires:Date.now()+12*3600000});return json(res,200,{token:key,account,capabilities});
        }return json(res,404,{error:'不存在的本机操作。'});
      }
      const key=req.headers.authorization?.replace(/^Bearer /,''),session=sessions.get(key);
      const sessionOrigin=origin||(!origin&&req.headers['x-beepop-csrf']===csrf?local:null);
      if(!session||session.expires<Date.now()||sessionOrigin!==session.origin){if(session?.expires<Date.now())sessions.delete(key);return json(res,401,{error:'请重新连接并授权本机助手。'})}
      if(req.method==='DELETE'&&url.pathname==='/session'){sessions.delete(key);return json(res,200,{disconnected:true})}
      if(req.method==='GET'&&url.pathname==='/status'){const account=await codex.account();if(account.email!==session.email){sessions.delete(key);return json(res,401,{error:'Codex 账号已变更，请重新授权。'})}return json(res,200,{account,capabilities})}
      if(req.method==='POST'&&url.pathname==='/jobs'){
        const input=await body(req,115*1024*1024),voice=validateInput(input,capabilities.voices);
        if(input.requestId!==undefined&&!/^[a-f0-9-]{36}$/.test(input.requestId))throw Error('任务编号无效。');
        const existing=input.requestId&&jobs.get(input.requestId);if(existing){if(existing.owner!==key)throw Error('任务编号已被使用。');return json(res,202,{id:existing.id,status:existing.status})}
        const account=await codex.account();if(!account.signedIn||account.email!==session.email)throw Error('登录账号已变更，请重新授权。');
        if(active||relay.active)throw Error('本机已有制作任务。');
        const id=input.requestId||crypto.randomUUID(),controller=new AbortController(),job={id,owner:key,dir:path.join(dataDir,id),description:input.description,files:input.images.map(x=>x.name),status:'running',stage:'prepare',message:'核对上传素材',percent:5,createdAt:new Date().toISOString()};jobs.set(id,job);active={job,controller};
        json(res,202,{id,status:job.status});
        const update=(stage,message,percent)=>Object.assign(job,{stage,message,percent});
        (async()=>{try{await fs.mkdir(dataDir,{recursive:true});const files=await engine.prepare(job,input.images);if(controller.signal.aborted)throw Error('任务已取消。');update('plan','Codex 正在编排文案与镜头',20);
          const plan=await codex.plan({cwd:job.dir,description:job.description,files,schema:engine.schema,signal:controller.signal});
          await fs.writeFile(path.join(job.dir,'plan.json'),JSON.stringify(plan,null,2));if(engine.createScenes)await engine.createScenes(job,plan,files,codex,{signal:controller.signal,update});job.output=await engine.produce(job,plan,files,{signal:controller.signal,update,voice});if(controller.signal.aborted)throw Error('任务已取消。');job.status='completed';update('completed','渲染完成，等待视频加载',98);
        }catch(e){job.status=controller.signal.aborted?'cancelled':'failed';job.message=controller.signal.aborted?'任务已取消。':e.message.slice(0,600);job.percent=0;}finally{await fs.mkdir(job.dir,{recursive:true});await fs.writeFile(path.join(job.dir,'job-status.json'),JSON.stringify({id:job.id,status:job.status,stage:job.stage,message:job.message},null,2));active=null;}})().catch(()=>{active=null});return;
      }
      const match=url.pathname.match(/^\/jobs\/([a-f0-9-]{36})(\/video)?$/);if(match){const job=jobs.get(match[1]);if(!job||job.owner!==key)return json(res,404,{error:'找不到当前连接的任务。'});
        if(req.method==='DELETE'&&!match[2]){if(active?.job===job)active.controller.abort();return json(res,200,{cancelled:true})}
        if(req.method==='GET'&&match[2]){if(job.status!=='completed')throw Error('视频尚未完成。');const file=await fs.readFile(job.output);res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':file.length,'Content-Disposition':'attachment; filename="beepoptvc.mp4"'});return res.end(file)}
        if(req.method==='GET')return json(res,200,{id:job.id,status:job.status,stage:job.stage,message:job.message,percent:job.percent});
      }
      return json(res,404,{error:'接口不存在。'});
    }catch(e){return json(res,e.status||400,{error:e.message||'本机助手请求失败。'})}
  });
  server.on('listening',()=>{if(engine===pipeline)relay.start().catch(()=>{})});
  server.on('close',()=>{relay.stop();active?.controller.abort();codex.close()});return server;
}
if(require.main===module){const port=Number(process.env.BEEPOP_PORT||47831);if(process.platform!=='darwin'){console.error('首版本机配音与媒体工具仅验证 macOS。');process.exit(1)}const server=createServer({port});server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'助手已在运行，或端口 47831 被占用。':e.message);process.exit(1)});server.listen(port,'127.0.0.1',()=>console.log('beepoptvc 本机助手已启动：http://127.0.0.1:'+port+'\n保持助手运行；首次连接后，回官网点击“生成视频”即可后台制作。\n只有点击生成才会提交 Codex 任务。'));process.on('SIGINT',()=>server.close(()=>process.exit(0)));}
module.exports={createServer,validateInput};
