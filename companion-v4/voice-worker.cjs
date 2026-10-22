'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {voices,modelDir}=require('./neural-voice.cjs');
async function synthesize(request,{load=async()=>{const {KokoroTTS}=require('kokoro-js');return KokoroTTS.from_pretrained(modelDir(),{dtype:'fp32',device:'cpu'})},write=fs.writeFile,read=fs.readFile}={}){
 if(!voices().some(v=>v.name===request.voice)||!Array.isArray(request.lines)||!request.lines.length||request.lines.length>5)throw Error('神经配音请求无效。');
 const engine=await load(),records=[];
 for(const line of request.lines){if(typeof line.text!=='string'||!line.text.trim()||line.text.length>160)throw Error('配音文案无效。');
  const audio=await engine.generate(line.text,{voice:request.voice,speed:1});
  if(!audio.audio?.length||audio.sampling_rate!==24000||!Array.from(audio.audio).every(Number.isFinite))throw Error('神经配音未返回有效音频。');
  await audio.save(line.output);const bytes=await read(line.output);records.push({text:line.text,asset:line.output,seconds:audio.audio.length/audio.sampling_rate,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 const record={provider:'Kokoro-82M-v1.0 / kokoro-js',voice:request.voice,speed:1,dtype:'fp32',modelRevision:require('./voice-model.json').revision,listening:'not_checked',lines:records};
 if(request.record)await write(request.record,JSON.stringify(record,null,2));return record;
}
module.exports={synthesize};
if(require.main===module)fs.readFile(path.resolve(process.argv[2]),'utf8').then(JSON.parse).then(r=>synthesize(r)).then(()=>console.log('神经配音已生成。')).catch(e=>{console.error(e.message);process.exitCode=1});
