'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=__dirname,data=path.join(root,'data'),port=Number(process.env.BEEPOP_PORT||47831),base='http://127.0.0.1:'+port,control=path.join(data,'service-control.json');
async function health(){try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});if(!r.ok)throw Error('此端口被其他服务占用。');const d=await r.json();if(d.service!=='beepoptvc-local')throw Error('此端口被其他服务占用。');return d}catch(e){if(e.message==='此端口被其他服务占用。')throw e;return null}}
function openStatus(){if(process.env.BEEPOP_NO_OPEN==='1')return;const c=spawn('rundll32.exe',['url.dll,FileProtocolHandler',base+'/startup'],{windowsHide:true,detached:true,stdio:'ignore'});c.on('error',()=>console.log('请在浏览器打开：'+base+'/startup'));c.unref()}
async function start(){require('./platform.cjs').createPlatform().supported();if(process.platform!=='win32')throw Error('此入口用于 Windows；Mac 请运行“启动beepoptvc.command”。');if(+process.versions.node.split('.')[0]<22)throw Error('需要 Node.js 22+ x64。');
 const existing=await health();if(existing){console.log('检测到助手 '+existing.version+' 已在运行。');if(existing.version!=='0.4.1'){console.log('请使用原运行窗口关闭旧助手后再启动新版，避免打断正在制作的任务。');return}openStatus();return}
 await fsp.mkdir(data,{recursive:true});const secret=crypto.randomBytes(32).toString('hex');await fsp.writeFile(control,JSON.stringify({port,secret}),{mode:0o600});
 const out=fs.openSync(path.join(data,'service-output.log'),'a'),err=fs.openSync(path.join(data,'service-error.log'),'a');let child;
 try{child=spawn(process.execPath,[path.join(root,'start.cjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,err],env:{...process.env,BEEPOP_SERVICE_TOKEN:secret}});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});child.unref()}finally{fs.closeSync(out);fs.closeSync(err)}
 for(let i=0;i<20;i++){const status=await health();if(status){console.log(status.ready?'助手已就绪，可关闭本窗口。':'助手正在后台准备，可关闭本窗口，浏览器将显示进度。');console.log(base+'/startup');console.log('需要停止时双击“停止助手.cmd”。');openStatus();return}await new Promise(r=>setTimeout(r,500))}
 throw Error('助手未能启动。请查看 data/service-error.log，或运行 diagnose-beepoptvc.cmd。')
}
async function stop(){const status=await health();if(!status){console.log('助手当前未运行。');return}let c;try{c=JSON.parse(await fsp.readFile(control,'utf8'))}catch{throw Error('当前助手由其他文件夹启动，请使用原文件夹的停止入口。')}if(c.port!==port||!/^[a-f0-9]{64}$/.test(c.secret||''))throw Error('本机服务控制文件无效。');const r=await fetch(base+'/service/stop',{method:'POST',headers:{'X-BeePOP-Service':c.secret},signal:AbortSignal.timeout(5000)});if(!r.ok){const d=await r.json();throw Error(d.error||'无法停止当前助手。')}console.log('助手正在停止。')}
module.exports={start,stop,health};if(require.main===module)(process.argv[2]==='stop'?stop():start()).catch(e=>{console.error(e.message);process.exitCode=1});
