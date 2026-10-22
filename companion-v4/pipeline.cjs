'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const ROOT=__dirname,platform=require('./platform.cjs').createPlatform();
const str={type:'string'},strings={type:'array',items:str};
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const schema=obj({productName:str,brandName:str,headline:str,endingHeadline:str,primaryUse:str,audience:str,scenario:str,unknowns:strings,
  features:{type:'array',items:obj({caption:str,fact:str,benefit:str,basis:{type:'string',enum:['provided_description','visible_structure','inference']},source:str,visualPlan:str,translationZh:str,focusX:{type:'number'},focusY:{type:'number'}})},narration:strings});
function checkPlan(p){
  for(const k of ['productName','headline','endingHeadline','primaryUse','audience','scenario'])if(typeof p[k]!=='string'||!p[k].trim()||p[k].length>(k==='scenario'?2000:200))throw Error('镜头数据缺少 '+k);
  if(!Array.isArray(p.features)||p.features.length!==2||!Array.isArray(p.narration)||p.narration.length!==5||!Array.isArray(p.unknowns))throw Error('镜头数据必须包含两个卖点和五句旁白。');
  for(const f of p.features){for(const k of ['caption','fact','benefit','source','visualPlan','translationZh'])if(typeof f[k]!=='string'||!f[k].trim()||f[k].length>500)throw Error('卖点资料不完整。');if(!['provided_description','visible_structure','inference'].includes(f.basis))throw Error('卖点依据无效。');if(![f.focusX,f.focusY].every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw Error('镜头焦点无效。');}
  for(const n of p.narration)if(typeof n!=='string'||!n.trim()||n.length>160)throw Error('旁白过长或为空。');return p;
}
function run(bin,args,{cwd=ROOT,signal,onData,input,timeout=900000,env=process.env}={}){return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Error('任务已取消。'));
  const child=spawn(bin,args,{cwd,env,stdio:[input===undefined?'ignore':'pipe','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'});let tail='';if(input!==undefined){child.stdin.on('error',()=>{});child.stdin.end(input)}
  const stop=()=>{try{process.platform!=='win32'?process.kill(-child.pid,'SIGTERM'):child.kill()}catch{}};
  const abort=()=>stop(),timer=setTimeout(stop,timeout);signal?.addEventListener('abort',abort,{once:true});
  const collect=b=>{tail=(tail+b.toString()).slice(-6000);onData?.(b.toString())};child.stdout.on('data',collect);child.stderr.on('data',collect);
  function clean(){clearTimeout(timer);signal?.removeEventListener('abort',abort)}
  child.on('error',e=>{clean();reject(e)});child.on('exit',code=>{clean();if(signal?.aborted)reject(Error('任务已取消。'));else if(code!==0)reject(Error(tail||'本机命令失败或超时。'));else resolve(tail)});
});}
function mediaTools(){return platform.mediaTools()}
function voices(){return require('./neural-voice.cjs').voices()}
function split(text){const words=text.trim().split(/\s+/),lines=[];let line='';for(const w of words){if((line+' '+w).trim().length>28&&line){lines.push(line);line=w}else line=(line+' '+w).trim()}if(line)lines.push(line);return lines.slice(0,3).map(x=>x.slice(0,32));}
async function prepare(job,uploads){
  const sharp=require('sharp');await fs.cp(path.join(ROOT,'engine'),job.dir,{recursive:true});
  await fs.symlink(path.join(ROOT,'node_modules'),path.join(job.dir,'node_modules'),process.platform==='win32'?'junction':'dir');
  const target=path.join(job.dir,'public','uploads');await fs.mkdir(target,{recursive:true});const paths=[];
  for(let i=0;i<uploads.length;i++){
    const data=Buffer.from(uploads[i].data,'base64');const image=sharp(data,{limitInputPixels:40000000});const meta=await image.metadata();
    if(!['png','jpeg','webp'].includes(meta.format)||meta.width<200||meta.height<200||meta.pages>1)throw Error('请使用至少 200 × 200 的静态商品图。');
    if(i===0&&Math.min(meta.width,meta.height)<700)throw Error('主图过小，请提供短边至少 700 像素的图片。');
    const dest=path.join(target,i+'.png');await image.rotate().png().toFile(dest);paths.push(dest);
  }
  return paths;
}
async function createScenes(job,plan,paths,codex,{signal,update}){
  checkPlan(plan);const sharp=require('sharp'),records=[];job.scenePaths=[];
  for(let i=0;i<2;i++){
    update('scenes','Codex 正在生成第 '+(i+1)+' / 2 张产品场景',26+i*7);
    const prompt='Generate exactly one finished landscape 16:9 photorealistic product lifestyle image, at least 1536 pixels wide. Product: '+plan.productName+'. Use the uploaded main product as the exact visual reference. Preserve its true geometry, number of components, proportions, colors, material and distinguishing details. '+(i===0?'Scene 1: a natural everyday use environment matching the supplied product information.':'Scene 2: a distinct but consistent everyday use arrangement or camera angle; do not repeat scene 1.')+' Scene direction from product analysis: '+plan.scenario+'. The complete product belongs naturally inside the environment. Full-bleed real environment, no extra product cutout or panel, no text, logo or watermark, no invented functional demonstrations or unsupported claims. Use the built-in image generation tool, not a shell/API fallback.';
    const image=await codex.scene({cwd:job.dir,description:job.description,files:[paths[0]],prompt,signal,onProgress:message=>update('scenes',message,26+i*7)});
    let bytes;
    if(image.savedPath)bytes=await fs.readFile(image.savedPath);
    else{const encoded=image.result.replace(/^data:image\/[a-z0-9.+-]+;base64,/i,'');if(!/^[A-Za-z0-9+/=\s]+$/.test(encoded))throw Error('Codex 未返回可保存的场景图片。');bytes=Buffer.from(encoded,'base64')}
    const meta=await sharp(bytes,{limitInputPixels:40000000}).metadata();if(meta.width<1300||meta.height<730||meta.width/meta.height<1.5||meta.width/meta.height>2.1)throw Error('Codex 场景图尺寸不符合全幅场景要求，未回退为商品动效。');
    const dest=path.join(job.dir,'public','uploads','scene-'+(i+1)+'.png');await sharp(bytes).rotate().png().toFile(dest);job.scenePaths.push(dest);
    records.push({asset:'uploads/scene-'+(i+1)+'.png',source:'Codex built-in image generation',toolType:image.type,status:image.status,prompt,revisedPrompt:image.revisedPrompt||null,width:meta.width,height:meta.height,review:'not_checked'});
    await fs.writeFile(path.join(job.dir,'scene-manifest.json'),JSON.stringify({generation:'Codex native, user account',illustrative:true,records},null,2));
  }
  return job.scenePaths;
}
async function produce(job,plan,paths,{signal,update,voice,codex}){
  checkPlan(plan);const sharp=require('sharp'),d=JSON.parse(await fs.readFile(path.join(job.dir,'product.json'),'utf8'));
  const main=await sharp(paths[0]).metadata();
  // Keep the true input pixels; do not upscale thumbnails to bypass template checks.
  Object.assign(d,{productName:plan.productName,brandName:plan.brandName||'',headline:plan.headline,endingHeadline:plan.endingHeadline,heroAsset:'uploads/0.png',referenceStatus:'新商品自动渲染；画面和声音待人工复核'});
  Object.assign(d.visual,{heroWidth:main.width,heroHeight:main.height});
  d.productUnderstanding={providedDescription:job.description,descriptionStatus:'provided',primaryUse:plan.primaryUse,audience:plan.audience,scenario:plan.scenario,unknowns:plan.unknowns};
  d.features=plan.features.map((f,i)=>({caption:f.caption,description:f.benefit,focus:{x:f.focusX,y:f.focusY,scale:Math.max(1,Math.min(1.18,Math.min(main.width,main.height)*1.45/1000))},sellingPoint:{...f,narrationIndex:i+1}}));
  const m=d.motionDesign,sceneTitle=plan.scenario.length>80?plan.primaryUse:plan.scenario;
  Object.assign(m,{introLines:split(plan.headline),featureLines:plan.features.map(f=>split(f.caption)),featureLabels:['PRODUCT DETAIL','PRODUCT DESIGN'],sceneLines:split(sceneTitle),sceneNote:'Provided imagery · illustrative presentation',endLines:split(plan.endingHeadline),brandFallback:plan.brandName||plan.productName,eyebrow:'PRODUCT STORY',sceneEyebrow:'PRODUCT IMAGERY',endEyebrow:'DISCOVER MORE'});
  m.editorial={intro:split(plan.headline),introSub:'',features:m.featureLines,featureSub:['',''],scene:m.sceneLines,ending:m.endLines};
  m.aplus={introKicker:'PRODUCT STORY',introBody:[],featureKickers:m.featureLabels,featureBodies:[[],[]],endKicker:'DISCOVER MORE',endBody:[]};
  if(!Array.isArray(job.scenePaths)||job.scenePaths.length!==2)throw Error('两张产品场景图尚未完成，不能用商品动效代替场景段落。');
  m.sceneNote='AI-generated illustrative product scenes';
  d.shots=[];for(let i=0;i<2;i++){const meta=await sharp(job.scenePaths[i]).metadata();const w=Math.min(meta.width,meta.height*16/9),h=w*9/16;
    d.shots.push({start:i?9.55:8.15,end:i?11:9.55,asset:path.relative(path.join(job.dir,'public'),job.scenePaths[i]).split(path.sep).join('/'),imageWidth:meta.width,imageHeight:meta.height,rect:[(meta.width-w)/2,(meta.height-h)/2,w,h],label:'Generated illustrative use scene '+(i+1),kind:'push'});
  }
  update('voice','制作 Kokoro 神经配音与字幕',40);const t=mediaTools(),env={...process.env,FFMPEG_PATH:t.ffmpeg,FFPROBE_PATH:t.ffprobe};if(process.platform==='darwin')env.DYLD_LIBRARY_PATH=path.dirname(t.ffprobe)+path.delimiter+(env.DYLD_LIBRARY_PATH||'');
  const starts=[0.2,3.05,5.35,8.2,11.1],ends=[2.8,5.1,8.0,10.85,14.65];d.narration=[];
  async function generate(lines,name){const request=path.join(job.dir,name+'.request.json'),record=path.join(job.dir,name+'.record.json');await fs.writeFile(request,JSON.stringify({voice:voice.name,lines,record}));await run(process.execPath,[path.join(ROOT,'voice-worker.cjs'),request],{cwd:job.dir,signal,env,timeout:600000});return JSON.parse(await fs.readFile(record,'utf8'))}
  const production=await generate(plan.narration.map((text,i)=>({text,output:path.join(job.dir,'public','uploads','voice-'+i+'-source.wav')})),'voice-initial');
  for(let i=0;i<5;i++){
    const file=path.join(job.dir,'public','uploads','voice-'+i),available=ends[i]-starts[i];let line=production.lines[i];
    for(let attempt=0;line.seconds>available&&attempt<2;attempt++){
      if(!codex?.shorten)throw Error('第 '+(i+1)+' 句旁白过长，需要缩短文案；不会强制加速。');
      update('voice','缩短第 '+(i+1)+' 句文案，保留自然语速',42+i);
      plan.narration[i]=await codex.shorten({cwd:job.dir,text:plan.narration[i],maxDurationSec:available-0.12,signal});
      line=(await generate([{text:plan.narration[i],output:file+'-source.wav'}],'voice-retry-'+i+'-'+attempt)).lines[0];
    }
    if(!Number.isFinite(line.seconds)||line.seconds>available)throw Error('第 '+(i+1)+' 句旁白仍超过可用时长，已停止；不会强制加速。');production.lines[i]=line;
    await run(t.ffmpeg,['-v','error','-i',file+'-source.wav','-ar','48000','-ac','1','-c:a','pcm_s16le','-y',file+'.wav'],{signal,env});
    const wav=await fs.readFile(file+'.wav');let bytes=0,rate=0;for(let pos=12;pos+8<=wav.length;){const len=wav.readUInt32LE(pos+4),tag=wav.toString('ascii',pos,pos+4);if(tag==='fmt ')rate=wav.readUInt32LE(pos+16);if(tag==='data')bytes=len;pos+=8+len+(len%2)}const duration=bytes/rate;
    if(!duration||starts[i]+duration>ends[i]+0.01)throw Error('配音时长校验失败。');d.narration.push({start:starts[i],end:starts[i]+duration,text:plan.narration[i],asset:'uploads/voice-'+i+'.wav'});
  }
  await fs.writeFile(path.join(job.dir,'voice-production.json'),JSON.stringify(production,null,2));await fs.writeFile(path.join(job.dir,'plan.json'),JSON.stringify(plan,null,2));
  d.music={asset:'shared/playful-120.wav',baseVolume:0.16,duckVolume:0.07,attack:0.18,release:0.3};m.musicBrief={productCharacter:plan.primaryUse,bpm:120,palette:['template instrumental'],source:'TVC 2.0 自带程序轻音乐，未调用音乐 API'};
  await fs.writeFile(path.join(job.dir,'product.json'),JSON.stringify(d,null,2));await fs.writeFile(path.join(job.dir,'asset-manifest.json'),JSON.stringify({source:'user uploads + Codex native generated scenes',files:job.files,sceneGeneration:true,sceneManifest:'scene-manifest.json',voice:'Kokoro neural / '+voice.name,review:'not_checked'},null,2));
  update('validate','校验素材、镜头与配音',55);
  await run(process.execPath,[require.resolve('typescript/bin/tsc'),'--noEmit'],{cwd:job.dir,signal});
  await run(process.execPath,['scripts/check-motion.cjs','product.json'],{cwd:job.dir,signal});await run(process.execPath,['scripts/validate-inputs.cjs','product.json'],{cwd:job.dir,signal});
  update('render','Remotion 正在渲染',65);
  await run(process.execPath,['scripts/render-kinetic.cjs','product.json'],{cwd:job.dir,signal,env,timeout:1800000,onData:chunk=>{const matches=[...chunk.matchAll(/Rendered\s+(\d+)\/450/g)];if(matches.length)update('render','Remotion 正在渲染',65+Math.floor(Number(matches.at(-1)[1])*29/450));}});
  const file=path.join(job.dir,'out','product.mp4'),stat=await fs.stat(file);if(stat.size<1000)throw Error('渲染未产生有效视频。');
  await fs.writeFile(path.join(job.dir,'review.json'),JSON.stringify({render:'passed',frames:450,fps:30,width:1920,height:1080,playback:'not_checked',listening:'not_checked'},null,2));return file;
}
module.exports={schema,checkPlan,prepare,createScenes,produce,voices,run};
