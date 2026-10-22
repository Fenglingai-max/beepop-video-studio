// Public input is transferred to a top-level local workspace; generation uses same-origin requests.
(function(){
 'use strict';
 const q=s=>document.querySelector(s),BASE='http://127.0.0.1:47831',demo=q('#generate').onclick,originalVoices=q('#voice').innerHTML;
 const parts=new Map();let pending=null;
 function note(text){q('#codexMessage').textContent=text}
 function mode(){const local=q('#model').value==='tvc-2-local';
  for(const option of q('#duration').options)option.disabled=local&&option.value!=='15';
  for(const option of q('#ratio').options)option.disabled=local&&option.value!=='16:9';
  q('#duration').disabled=local;q('#ratio').disabled=local;q('#voice').disabled=local;q('#taskConsentRow').hidden=true;
  if(local){q('#duration').value='15';q('#ratio').value='16:9';if(q('#voice').options[0]?.value!=='local:pending'){const o=document.createElement('option');o.value='local:pending';o.textContent='打开本机工作台后选择';q('#voice').replaceChildren(o)}}
  else if(q('#voice').options[0]?.value==='local:pending')q('#voice').innerHTML=originalVoices;
  q('.voice-field small').textContent=local?'在本机窗口选择':'10 款预设';
  q('#generate').innerHTML=local?'在本机制作 <span>↗</span>':'预览制作流程 <span>↗</span>';
  q('.model-pill').textContent=local?'TVC 2.0 · Codex + Remotion':'See Dance 2.5 · 预设';
  q('#selectionSummary').textContent=local?'15 秒 · 横版 16:9 · 本机英文配音':q('#duration').value+' 秒 · '+q('#ratio').value+' · 配音预设';
  q('#settingHelp').textContent=local?'TVC 2.0 · 在本机窗口核对账号、选择配音并确认生成。商品资料会自动带入。':'声线与模型为待接入预设；流程演示使用已有案例视频。';
  q('.prototype-note').textContent=local?'官网负责填写与案例复刻，本机工作台负责授权和生成。打开工作台不会消耗额度，确认生成后才会使用自己的 Codex。':'流程演示不会生成新视频或消耗额度。';
  q('#codexStatus').textContent='本机工作台制作 · Safari / Chrome';q('#connectCodex').textContent='连接我的 Codex';q('#disconnectCodex').hidden=true;
 }
 window.updateGenerationMode=mode;q('#model').value='tvc-2-local';q('#model').addEventListener('change',mode);
 q('#connectCodex').onclick=()=>{note('首次使用请下载并启动最新版 macOS 助手，再打开本机工作台。账号与额度确认都在本机完成。');q('#codexDialog').showModal()};
 q('#closeCodex').onclick=()=>q('#codexDialog').close();q('#previewDemo').onclick=()=>demo();
 async function part(path){if(parts.has(path))return parts.get(path);const promise=(async()=>{for(let i=0;i<2;i++){try{const r=await fetch(path,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('助手文件下载失败。');return await r.arrayBuffer()}catch(e){if(i)throw e}}})();parts.set(path,promise);promise.catch(()=>parts.delete(path));return promise}
 q('#downloadCompanion').onclick=async()=>{const button=q('#downloadCompanion');button.disabled=true;button.textContent='正在准备下载…';
  try{const response=await fetch('local-companion.json?v=20261022-13',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('下载清单暂时不可用。');const m=await response.json();
   if(!Array.isArray(m.parts)||m.parts.length>20||m.parts.some(p=>!/^media\/local-companion-v2-\d{2}\.bin$/.test(p))||m.bytes>6000000)throw Error('助手下载清单无效。');
   const chunks=new Array(m.parts.length);let cursor=0,done=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<m.parts.length){const i=cursor++;chunks[i]=await part(m.parts[i]);done++;button.textContent='下载助手 · '+Math.round(done/m.parts.length*100)+'%';}}));
   const blob=new Blob(chunks,{type:'application/zip'});if(blob.size!==m.bytes)throw Error('下载文件不完整。');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==m.sha256)throw Error('下载校验未通过。');
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='beepoptvc-local-macos.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);note('助手已下载。解压后双击启动文件，再打开本机工作台。');
  }catch(e){note('下载未完成：'+e.message+' 请点击下载重试。')}finally{button.disabled=false;button.textContent='下载 macOS 助手 ↓'}
 };
 function launch(){const state=Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
  pending={state,description:q('#description').value,images:images.map(x=>({file:x.file,label:x.label})),voice:q('#voice').value};
  const caseId=typeof window.currentCaseId==='function'?window.currentCaseId():null;const url=BASE+'/workspace?origin='+encodeURIComponent(location.origin)+'&state='+state+(caseId?'&case='+encodeURIComponent(caseId):'');
  q('#manualLocalLink').href=url;q('#manualLocalLink').textContent='手动打开本机制作窗口 ↗';q('#manualLocalLink').hidden=false;q('#workspaceLink').href=url;q('#workspaceNotice').hidden=false;
  const popup=window.open(url,'beepoptvc-local-workspace','width=1100,height=860');note(popup?'已打开本机制作窗口，请在那里核对账号与资料，再确认生成。':'请点击手动打开本机制作窗口；如果仍无法打开，请启动最新版助手。');
 }
 q('#openLocalAuth').onclick=launch;
 window.addEventListener('message',e=>{if(e.origin!==BASE||!pending||e.data?.state!==pending.state)return;
  if(e.data.type==='beepoptvc-workspace-ready')e.source?.postMessage({type:'beepoptvc-workspace-input',...pending},BASE);
  if(e.data.type==='beepoptvc-workspace-received'){q('#codexStatus').textContent='本机工作台已接收商品资料';note('商品资料已带入本机工作台，请在那里确认生成。');}
 });
 q('#generate').onclick=()=>{if(q('#model').value!=='tvc-2-local')return demo();if(!q('#description').value.trim()||!images.length){error('请填写商品信息，并添加至少一张商品图。');q('#description').focus();return}error('');launch()};
 mode();
})();
