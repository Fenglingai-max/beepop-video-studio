'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=__dirname,platform=require('./platform.cjs').createPlatform();
function run(command,args,options={}){return new Promise((resolve,reject)=>{const c=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});c.on('error',reject);c.on('exit',code=>code===0?resolve():reject(Error('启动准备未完成，退出码 '+code+'。请查看上方错误后重试。')))})}
function npmCli(){const candidates=[path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),process.env.APPDATA&&path.join(process.env.APPDATA,'npm','node_modules','npm','bin','npm-cli.js')].filter(Boolean);for(const p of candidates)if(fs.existsSync(p))return p;throw Error('未找到 npm。请从 nodejs.org 安装包含 npm 的 Node.js 22+ 后重新打开启动文件。')}
async function prepare(){platform.supported();if(+process.versions.node.split('.')[0]<22)throw Error('需要 Node.js 22 或更新版本。');
 try{const r=await fetch('http://127.0.0.1:47831/health',{signal:AbortSignal.timeout(1000)});const d=await r.json();if(d.service==='beepoptvc-local')throw Object.assign(Error('已有 '+d.version+' 版助手运行。请先完成当前任务并关闭旧助手窗口，再启动新版。'),{busy:true})}catch(e){if(e.busy)throw e}
 const lock=crypto.createHash('sha256').update(await fsp.readFile(path.join(root,'pnpm-lock.yaml'))).digest('hex'),stamp=path.join(root,'data','dependencies.sha256');let installed=false;
 try{installed=(await fsp.readFile(stamp,'utf8'))===lock;require.resolve('kokoro-js');require.resolve('sharp');require.resolve('@remotion/cli');platform.mediaTools();platform.codexCommand()}catch{installed=false}
 if(!installed){console.log('首次准备：安装锁定的渲染、官方 Codex 与神经配音组件，请保持联网。');const bundled=path.resolve(path.dirname(process.execPath),'../../bin/fallback/pnpm');if(process.platform==='darwin'&&fs.existsSync(bundled))await run(bundled,['install','--frozen-lockfile','--ignore-scripts','--fetch-timeout=600000']);else await run(process.execPath,[npmCli(),'exec','--yes','--package=pnpm@11.25.0','--','pnpm','install','--frozen-lockfile','--ignore-scripts','--fetch-timeout=600000']);await fsp.mkdir(path.dirname(stamp),{recursive:true});await fsp.writeFile(stamp,lock)}
 await require('./setup-voice.cjs').ensureVoice();
 const cli=path.resolve(path.dirname(require.resolve('@remotion/cli')),'../remotion-cli.js');
 if(!process.env.REMOTION_BROWSER_EXECUTABLE)await run(process.execPath,[cli,'browser','ensure']);
 const request=path.join(root,'data','voice-startup.json');await fsp.writeFile(request,JSON.stringify({voice:'af_bella',lines:[{text:'A clear voice, ready to create.',output:path.join(root,'data','voice-startup.wav')}],record:path.join(root,'data','voice-startup-record.json')}));
 await run(process.execPath,[path.join(root,'voice-worker.cjs'),request]);
 console.log('准备完成：10 个 Kokoro 神经声线。首次连接官网后，点击生成即可。');
 return run(process.execPath,[path.join(root,'server.cjs')]);
}
module.exports={prepare,npmCli,run};
if(require.main===module)prepare().catch(e=>{console.error(e.message);console.error('需要排查时，运行 diagnose-beepoptvc.cmd（Windows）或 运行环境检查.command（Mac），不消耗 Codex 额度。');process.exitCode=1});
