'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=__dirname,platform=require('./platform.cjs').createPlatform();
function run(command,args,options={}){return new Promise((resolve,reject)=>{const c=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});c.on('error',reject);c.on('exit',code=>code===0?resolve():reject(Error('启动准备未完成，退出码 '+code+'。请查看上方错误后重试。')))})}
function npmCli(){const candidates=[path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),process.env.APPDATA&&path.join(process.env.APPDATA,'npm','node_modules','npm','bin','npm-cli.js')].filter(Boolean);for(const p of candidates)if(fs.existsSync(p))return p;throw Error('未找到 npm。请从 nodejs.org 安装包含 npm 的 Node.js 22+ 后重新打开启动文件。')}
async function prepareAssets(update){
 update('dependencies','正在安装制作组件。首次需要联网，请等待；详细进度保存在本机运行日志。');
 const lock=crypto.createHash('sha256').update(await fsp.readFile(path.join(root,'pnpm-lock.yaml'))).digest('hex'),stamp=path.join(root,'data','dependencies.sha256');let installed=false;
 try{installed=(await fsp.readFile(stamp,'utf8'))===lock;require.resolve('kokoro-js');require.resolve('sharp');require.resolve('@remotion/cli');platform.mediaTools();platform.codexCommand()}catch{installed=false}
 if(!installed){console.log('首次准备：安装锁定的渲染、官方 Codex 与神经配音组件，请保持联网。');const bundled=path.resolve(path.dirname(process.execPath),'../../bin/fallback/pnpm');if(process.platform==='darwin'&&fs.existsSync(bundled))await run(bundled,['install','--frozen-lockfile','--ignore-scripts','--fetch-timeout=600000']);else await run(process.execPath,[npmCli(),'exec','--yes','--package=pnpm@11.25.0','--','pnpm','install','--frozen-lockfile','--ignore-scripts','--fetch-timeout=600000']);await fsp.mkdir(path.dirname(stamp),{recursive:true});await fsp.writeFile(stamp,lock)}
 update('voice','正在准备神经配音模型，约 310 MB；中断后可续传。');
 await require('./setup-voice.cjs').ensureVoice({onProgress:message=>{console.log(message);update('voice',message)}});
 update('browser','正在准备视频渲染组件。');
 const cli=path.resolve(path.dirname(require.resolve('@remotion/cli')),'../remotion-cli.js');
 if(!process.env.REMOTION_BROWSER_EXECUTABLE)await run(process.execPath,[cli,'browser','ensure']);
 update('check','正在检查本机配音。此步骤不消耗 Codex 额度。');
 const request=path.join(root,'data','voice-startup.json');await fsp.mkdir(path.dirname(request),{recursive:true});await fsp.writeFile(request,JSON.stringify({voice:'af_bella',lines:[{text:'A clear voice, ready to create.',output:path.join(root,'data','voice-startup.wav')}],record:path.join(root,'data','voice-startup-record.json')}));
 await run(process.execPath,[path.join(root,'voice-worker.cjs'),request]);
}
async function prepare({port=Number(process.env.BEEPOP_PORT||47831),preparer=prepareAssets,serverFactory=require('./server.cjs').createServer}={}){
 platform.supported();if(+process.versions.node.split('.')[0]<22)throw Error('需要 Node.js 22 或更新版本。');
 try{const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1000)});const d=await r.json();if(d.service==='beepoptvc-local')throw Object.assign(Error('已有 '+d.version+' 版助手运行，请使用已有助手，或先关闭旧版再升级。'),{busy:true})}catch(e){if(e.busy)throw e}
 const readiness={ready:false,failed:false,stage:'starting',message:'正在启动，请稍候。'};let running=false;
 const server=serverFactory({port,readiness,onServiceStop:()=>process.exit(0)});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 console.log('本机状态页已打开：http://127.0.0.1:'+port+'/startup');
 const attempt=async()=>{if(running||readiness.ready)return;running=true;readiness.failed=false;
  const update=(stage,message)=>Object.assign(readiness,{stage,message});
  try{await preparer(update);Object.assign(readiness,{ready:true,failed:false,stage:'ready',message:'助手已就绪。请返回官网重新点击“连接并授权”。'});server.startBridge();console.log('beepoptvc 助手已就绪：http://127.0.0.1:'+port+'\n只有点击生成才会提交 Codex 任务。')}
  catch(e){console.error(e.message);Object.assign(readiness,{failed:true,stage:'failed',message:'准备未完成：'+e.message.slice(0,450)+' 请在状态页重试，或运行诊断文件。'})}
  finally{running=false}
 };
 readiness.retry=()=>{void attempt()};void attempt();return server;
}
module.exports={prepare,prepareAssets,npmCli,run};
if(require.main===module)prepare().catch(e=>{console.error(e.message);console.error('需要排查时，运行 diagnose-beepoptvc.cmd（Windows）或 运行环境检查.command（Mac），不消耗 Codex 额度。');process.exitCode=1});
