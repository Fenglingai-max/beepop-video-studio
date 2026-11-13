(function(){
'use strict';
const q=s=>document.querySelector(s),C=TVCStudio;
let job=null,exporting=false;
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function render(){
 const s=settings(),v=C.versions[s.version];
 const requested=q('#resolution').value,model=C.models[s.model];q('#resolution').replaceChildren(...model.resolutions.map(n=>new Option(n,n)));q('#resolution').value=model.resolutions.includes(requested)?requested:model.resolution;
 const remotion=v.mode==='remotion';q('#model').disabled=remotion;q('#resolution').disabled=remotion;
 q('.model-pill').textContent=remotion?'纯 Remotion · 无视频模型':C.models[s.model].label+' · LibTV';
 q('#selectionSummary').textContent=s.duration+' 秒 · '+s.ratio;
 q('#ratioIcon').classList.toggle('vertical',s.ratio==='9:16');
 q('#settingHelp').textContent=remotion?'本版用图片与场景素材编排纯 Remotion，不调用视频模型。声线为风格偏好，制作时匹配并试听。':'通过已登录 LibTV 页面使用所选模型；分辨率为请求值，制作前核对界面支持。声线为风格偏好。';
 q('.prototype-note').textContent='当前通过制作任务包交给 Codex 执行，正式 API 尚未接入。点击准备任务不会提交生成或消耗额度。';
 q('#generate').innerHTML='准备制作任务 <span>↗</span>';

}
window.updateGenerationMode=render;
q('#model').addEventListener('change',()=>{q('#resolution').value=C.models[q('#model').value].resolution;render();});
q('#version').addEventListener('change',()=>{const current=settings(),v=C.versions[current.version];restoreSettings({...current,duration:Number(current.duration)>=15&&Number(current.duration)<=30?current.duration:v.defaultDuration});});
function durationPopup(open){q('#durationPopover').hidden=!open;q('#duration').setAttribute('aria-expanded',String(open));}
q('#duration').addEventListener('focus',()=>durationPopup(true));q('#duration').addEventListener('click',()=>durationPopup(true));document.addEventListener('pointerdown',e=>{if(!e.target.closest('.duration-field'))durationPopup(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape')durationPopup(false);});
q('#durationSlider').addEventListener('input',()=>{q('#duration').value=q('#durationSlider').value;render();});
q('#duration').addEventListener('input',()=>{const n=Number(q('#duration').value);if(n>=15&&n<=30){q('#durationSlider').value=n;error('');render();}});
q('#closeTask').onclick=()=>q('#taskDialog').close();
q('#previewDemo').onclick=()=>{const v=C.versions[settings().version];q('#taskTitle').textContent='制作流程';q('#taskSummary').textContent=v.steps.join(' → ');q('#taskPrompt').value=v.rule;q('#taskStatus').textContent='流程说明 · 尚未创建任务';job=null;q('#downloadTask').disabled=true;q('#copyTask').disabled=false;q('#taskDialog').showModal();};
q('#generate').onclick=()=>{try{
 if(!images.length)throw Error('请上传商品图，或载入一个案例。');
 if(images.reduce((n,x)=>n+x.file.size,0)>50*1024*1024)throw Error('商品图片合计不能超过50 MB。');
 const assets=images.map((x,i)=>({path:'assets/'+String(i+1).padStart(2,'0')+'-'+x.file.name.replace(/[^\p{L}\p{N}._-]/gu,'_'),name:x.file.name,bytes:x.file.size,type:x.file.type,role:x.label||'商品图片',review:'pending'}));
 job=C.build({...settings(),description:q('#description').value,sourceCaseId:window.currentCaseId?.(),caseContext:window.currentCaseContext?.(),assets});
 // Snapshot the exact files: edits after this dialog opens must not alter this task.
 job.files=images.map(x=>x.file);
 q('#taskTitle').textContent='制作任务';
 q('#taskSummary').textContent=job.settings.duration+'秒 / '+job.settings.ratio+' / '+(job.settings.model?C.models[job.settings.model].label+' · '+job.settings.resolution:'纯 Remotion')+' / '+assets.length+'张素材';
 q('#taskPrompt').value=C.prompt(job);q('#taskStatus').textContent='任务已准备 · 尚未提交 LibTV · 待制作与审片';q('#downloadTask').disabled=false;q('#copyTask').disabled=false;error('');q('#taskDialog').showModal();
 }catch(e){error(e.message);}
};
q('#copyTask').onclick=async()=>{try{await navigator.clipboard.writeText(q('#taskPrompt').value);q('#taskStatus').textContent='已复制执行说明。请同时把下载的任务包交给 Codex。';}catch{q('#taskPrompt').focus();q('#taskPrompt').select();q('#taskStatus').textContent='请手动复制已选中的执行说明。';}};
q('#downloadTask').onclick=async()=>{if(!job||exporting)return;exporting=true;const snapshot=job;q('#downloadTask').disabled=true;q('#taskStatus').textContent='正在整理素材与文件指纹…';try{
 const files=[];const clean={...snapshot};delete clean.files;
 for(let i=0;i<snapshot.files.length;i++){const bytes=new Uint8Array(await snapshot.files[i].arrayBuffer());clean.assets[i]={...clean.assets[i],sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')};files.push({name:clean.assets[i].path,bytes});}
 const enc=new TextEncoder();files.push({name:'task.json',bytes:enc.encode(JSON.stringify(clean,null,2))},{name:'交给Codex的执行说明.txt',bytes:enc.encode(C.prompt(clean))},{name:'README.txt',bytes:enc.encode('将本文件夹交给Codex，按执行说明和task.json制作。先安装对应测试版插件。assets中的素材角色与review仍需实际核对。此包为待执行任务，不是已生成视频。LibTV通过用户已登录的官方页面操作；生成前核实模型能力和次数。\n')});
 download(new Blob([TVCZip.create(files)],{type:'application/zip'}),snapshot.versionName+'-'+snapshot.id+'.zip');q('#taskStatus').textContent='任务包已下载。交给 Codex 执行；当前网页没有提交生成。';
 }catch(e){q('#taskStatus').textContent='导出失败：'+e.message;}finally{exporting=false;q('#downloadTask').disabled=!job;}
};
render();
})();
