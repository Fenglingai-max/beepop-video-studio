'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{createReadStream,createWriteStream}=require('node:fs'),{Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const spec=require('./voice-model.json'),{modelDir}=require('./neural-voice.cjs');
async function sha(file){const h=crypto.createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex')}
async function valid(file,entry){try{return (await fs.stat(file)).size===entry.bytes&&await sha(file)===entry.sha256}catch{return false}}
async function ensureVoice({onProgress=console.log,fetcher=fetch,directory=modelDir()}={}){
 for(const entry of spec.files){const file=path.join(directory,entry.path);if(await valid(file,entry))continue;
  await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.partial';let success=false;
  for(let attempt=0;attempt<2&&!success;attempt++){
   try{let offset=0;try{offset=(await fs.stat(temp)).size}catch{}if(offset>=entry.bytes){await fs.rm(temp,{force:true});offset=0}
    onProgress('准备神经配音模型：'+entry.path+'（'+Math.round(entry.bytes/1024/1024)+' MB）');
    const r=await fetcher('https://huggingface.co/'+spec.repository+'/resolve/'+spec.revision+'/'+entry.path,{headers:offset?{Range:'bytes='+offset+'-'}:{},signal:AbortSignal.timeout(600000)});
    if(!r.ok||!r.body)throw Error('模型下载返回 HTTP '+r.status);
    if(r.status===206){if(!offset||!r.headers.get('content-range')?.startsWith('bytes '+offset+'-'))throw Error('模型续传范围不正确。')}else offset=0;
    let bytes=offset,last=Math.floor(bytes/entry.bytes*10);const stream=Readable.fromWeb(r.body);stream.on('data',b=>{bytes+=b.length;const step=Math.floor(bytes/entry.bytes*10);if(step>last){last=step;onProgress(entry.path+' '+Math.min(100,step*10)+'%')}});
    await pipeline(stream,createWriteStream(temp,{flags:offset?'a':'w'}));
    if(!await valid(temp,entry)){await fs.rm(temp,{force:true});throw Error('模型校验失败。')}
    await fs.rename(temp,file);success=true;
   }catch(e){if(attempt)throw Error('神经配音模型未准备完成：'+e.message+'。重新运行启动文件会继续准备，不会切换成系统机器人配音。')}
  }
 }
 return directory;
}
module.exports={ensureVoice,valid};
if(require.main===module)ensureVoice().then(()=>console.log('神经配音模型已就绪。')).catch(e=>{console.error(e.message);process.exitCode=1});
