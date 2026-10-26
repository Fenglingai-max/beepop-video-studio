'use strict';
// Runs on a clean Windows CI machine, never on a user's profile.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve('complete-build/environment'),helper=path.resolve('companion-verified.zip');
async function download(url,file,hash){await fs.mkdir(path.dirname(file),{recursive:true});const r=await fetch(url,{signal:AbortSignal.timeout(300000)});if(!r.ok)throw Error('HTTP '+r.status+' '+url);const b=Buffer.from(await r.arrayBuffer());const actual=crypto.createHash('sha256').update(b).digest('hex');if(hash&&actual!==hash)throw Error('Checksum mismatch '+file);await fs.writeFile(file,b);return {bytes:b.length,sha256:actual};}
function run(cmd,args,cwd=root){const r=spawnSync(cmd,args,{cwd,stdio:'inherit',shell:false});if(r.status!==0)throw Error('Build command failed: '+cmd);}
(async()=>{
 await fs.mkdir(root,{recursive:true});
 run('powershell.exe',['-NoProfile','-Command','Expand-Archive -LiteralPath "'+helper+'" -DestinationPath "'+path.dirname(root)+'" -Force'],process.cwd());
 const source=path.join(path.dirname(root),'beepoptvc-local');
 for(const file of ['package.json','pnpm-lock.yaml','voice-model.json'])await fs.copyFile(path.join(source,file),path.join(root,file));
 const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
 run(process.execPath,[npm,'exec','--yes','--package=pnpm@11.25.0','--','pnpm','install','--frozen-lockfile','--ignore-scripts','--node-linker=hoisted']);
 const spec=JSON.parse(await fs.readFile(path.join(root,'voice-model.json'),'utf8'));
 for(const x of spec.files)await download('https://huggingface.co/'+spec.repository+'/resolve/'+spec.revision+'/'+x.path,path.join(root,'data/models/kokoro-v1',x.path),x.sha256);
 await download('https://huggingface.co/'+spec.repository+'/resolve/'+spec.revision+'/README.md',path.join(root,'node_modules/.beepoptvc-licenses/Kokoro-model-card.md'));
 await fs.mkdir(path.join(root,'node_modules/.beepoptvc-licenses'),{recursive:true});
 await fs.copyFile(path.join(root,'node_modules/kokoro-js/LICENSE'),path.join(root,'node_modules/.beepoptvc-licenses/Kokoro-Apache-2.0.txt'));
 const browserZip=path.resolve('complete-build/chrome.zip');
 const browser=await download('https://storage.googleapis.com/chrome-for-testing-public/149.0.7790.0/win64/chrome-headless-shell-win64.zip',browserZip);
 const browserRoot=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64');
 run('powershell.exe',['-NoProfile','-Command','Expand-Archive -LiteralPath "'+browserZip+'" -DestinationPath "'+browserRoot+'" -Force']);
 await fs.writeFile(path.join(root,'node_modules/.remotion/chrome-headless-shell/VERSION'),'149.0.7790.0');
 const lock=crypto.createHash('sha256').update(await fs.readFile(path.join(root,'pnpm-lock.yaml'))).digest('hex');await fs.writeFile(path.join(root,'data/dependencies.sha256'),lock);
 // Produce a reproducible file manifest; reject links escaping the packaged tree.
 const files=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name),relative=path.relative(root,p).replaceAll('\\','/');if(e.isSymbolicLink())throw Error('Unexpected package link: '+relative);if(e.isDirectory())await walk(p);else{const b=await fs.readFile(p);files.push({path:relative,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}}}
 await walk(path.join(root,'node_modules'));await walk(path.join(root,'data'));
 await fs.writeFile(path.resolve('complete-build/environment-files.json'),JSON.stringify({browser,lock,files},null,2));
 console.log('Complete Windows environment: '+files.length+' files, '+files.reduce((n,x)=>n+x.bytes,0)+' bytes');
})().catch(e=>{console.error(e);process.exitCode=1});
