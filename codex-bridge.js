// This capability connects only to the user's loopback companion. OpenAI tokens never enter this page.
(function(){
  'use strict';
  const q=s=>document.querySelector(s),BASE='http://127.0.0.1:47831',originalDemo=q('#generate').onclick;
  let connection=null,popup=null,pairState=null,active=null,resultURL=null,runVersion=0;
  const originalVoices=q('#voice').innerHTML;
  const isLocal=()=>q('#model').value==='tvc-2-local';
  function note(text){q('#codexMessage').textContent=text}
  function mode(){
    const local=isLocal();q('#model').disabled=!!active;
    for(const option of q('#duration').options)option.disabled=local&&option.value!=='15';
    for(const option of q('#ratio').options)option.disabled=local&&option.value!=='16:9';
    q('#duration').disabled=local;q('#ratio').disabled=local;
    if(local){q('#duration').value='15';q('#ratio').value='16:9'}
    const catalog=local&&connection?.capabilities.voices;
    if(catalog){const selected=q('#voice').value;q('#voice').replaceChildren(...catalog.map(v=>{const option=document.createElement('option');option.value=v.id;option.textContent=v.label;return option}));if(catalog.some(v=>v.id===selected))q('#voice').value=selected;}
    else if(!local&&q('#voice').options[0]?.value.startsWith('local:'))q('#voice').innerHTML=originalVoices;
    q('#voice').disabled=local&&!connection;
    q('.voice-field small').textContent=local?(connection?connection.capabilities.voices.length+' 款本机声线':'连接后读取本机声线'):'10 款预设';
    q('#taskConsentRow').hidden=!local;
    q('#generate').innerHTML=local?(active?'查看当前任务 ↗':'生成视频 <span>↗</span>'):'预览制作流程 <span>↗</span>';
    q('#settingHelp').textContent=local?'TVC 2.0 · 15 秒横版 · 使用上传图片与本机英文配音。首次使用需启动并授权本机助手。':'声线与模型为待接入预设，切换只更新演示设置；示例成片为已有视频。';
    q('.model-pill').textContent=local?'TVC 2.0 · Codex + Remotion':'See Dance 2.5 · 预设';
    q('#selectionSummary').textContent=local?'15 秒 · 横版 16:9 · '+(connection?q('#voice').selectedOptions[0]?.textContent||'未找到可用声线':'连接后选择本机声线'):q('#duration').value+' 秒 · '+q('#ratio').value+' · 配音预设';
    q('.prototype-note').textContent=local?'生成任务在你自己的电脑执行，使用已授权账号的 Codex 额度。案例播放和流程演示不消耗额度。':'流程演示使用已有案例，不会生成新视频或消耗额度。';
    q('#codexStatus').textContent=connection?'已连接 · '+connection.account.email:'使用自己的 Codex 账号';
    q('#connectCodex').textContent=connection?'我的 Codex ✓':'连接我的 Codex';
    q('#disconnectCodex').hidden=!connection;
  }
  window.updateGenerationMode=mode;
  q('#model').value='tvc-2-local';q('#model').addEventListener('change',mode);
  q('#connectCodex').onclick=()=>{note(connection?'已连接 '+connection.account.email+'，可断开当前网站连接或重新授权。':'首次使用：下载并解压 macOS 助手，双击启动文件，再打开本机授权。');q('#codexDialog').showModal()};
  q('#closeCodex').onclick=()=>q('#codexDialog').close();
  q('#downloadCompanion').onclick=async()=>{
    const button=q('#downloadCompanion');button.disabled=true;button.textContent='正在准备下载…';
    try{const response=await fetch('local-companion.json?v=20261022-11',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('下载清单暂时不可用。');const manifest=await response.json();
      if(!Array.isArray(manifest.parts)||manifest.parts.length>20||manifest.parts.some(p=>!/^media\/local-companion-\d{2}\.bin$/.test(p))||manifest.bytes>6000000)throw Error('助手下载清单无效。');
      const chunks=await Promise.all(manifest.parts.map(async path=>{const r=await fetch(path,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('助手文件下载失败。');return r.arrayBuffer()}));
      const blob=new Blob(chunks,{type:'application/zip'});if(blob.size!==manifest.bytes)throw Error('下载文件不完整，请重试。');
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==manifest.sha256)throw Error('下载校验未通过，请重试。');
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='beepoptvc-local-macos.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);note('助手已下载。解压后双击启动文件，再打开本机授权。');
    }catch(e){note('下载未完成：'+e.message+' 请点击下载重试。')}finally{button.disabled=false;button.textContent='下载 macOS 助手 ↓'}
  };
  q('#openLocalAuth').onclick=()=>{
    pairState=Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
    popup=window.open(BASE+'/connect?origin='+encodeURIComponent(location.origin)+'&state='+pairState,'beepoptvc-local-auth','width=580,height=760');
    q('#manualLocalLink').href=BASE+'/connect?origin='+encodeURIComponent(location.origin)+'&state='+pairState;q('#manualLocalLink').hidden=false;
    note(popup?'在新窗口完成 OpenAI 登录并授权。如果显示无法连接，请先启动下载的本机助手。':'浏览器拦截了新窗口，请允许此网站打开弹窗后重试。');
  };
  q('#manualConnect').onclick=async()=>{const key=q('#manualPairCode').value.trim();if(!/^[a-f0-9]{64}$/.test(key))return note('请粘贴本机授权窗口提供的完整临时连接码。');try{const session={token:key};const status=await request('/status',{session});if(!status.account?.signedIn)throw Error('Codex 尚未登录。');connection={...session,...status};q('#manualPairCode').value='';pairState=null;mode();q('#codexDialog').close();toast('本机 Codex 已连接')}catch(e){note(e.message)}};
  window.addEventListener('message',e=>{
    const value=e.data;if(e.origin!==BASE||e.source!==popup||!pairState||value?.type!=='beepoptvc-connected'||value.state!==pairState)return;
    if(!/^[a-f0-9]{64}$/.test(value.token||'')||!value.account?.signedIn||!Array.isArray(value.capabilities?.voices))return;
    connection={token:value.token,account:value.account,capabilities:value.capabilities};pairState=null;mode();note('已连接自己的 Codex 账号。');q('#codexDialog').close();toast('Codex 已授权，可以开始制作');
  });
  async function request(route,{method='GET',data,signal,raw=false,timeout=15000,session=connection}={}){
    if(!session)throw Error('请先连接自己的 Codex。');
    const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(abort,timeout);
    try{const r=await fetch(BASE+route,{method,headers:{Authorization:'Bearer '+session.token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:controller.signal,cache:'no-store'});
      if(!r.ok){let value;try{value=await r.json()}catch{}if(r.status===401&&connection===session){connection=null;mode()}throw Error(value?.error||'本机助手响应失败。')}
      return raw?await r.blob():await r.json();
    }catch(e){if(e instanceof TypeError)throw Error('无法连接本机助手。请确认已启动；若浏览器询问本地网络权限，请允许。');throw e}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
  }
  q('#disconnectCodex').onclick=async()=>{if(active){note('请先完成或取消当前任务，再断开连接。');return}try{await request('/session',{method:'DELETE'})}catch{}connection=null;pairState=null;mode();note('已撤销当前网页连接，未退出本机 Codex 账号。')};
  q('#previewDemo').onclick=()=>originalDemo();
  function progress(percent,text){q('#realProgress').style.width=percent+'%';q('#realPercent').textContent=percent+'%';q('#realProgressTrack').setAttribute('aria-valuenow',String(percent));q('#realStage').textContent=text}
  function releaseResult(){if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;const video=q('#realVideo');video.pause();video.removeAttribute('src');video.load();q('#realResult').hidden=true;q('#retryRealVideo').hidden=true;}
  function showFailure(e){q('#realTitle').textContent='制作未完成';q('#realMessage').textContent=e.name==='AbortError'?'连接已中断或任务已取消；可重新检查助手。':e.message;progress(0,'未完成');q('#cancelReal').hidden=true;}
  function wait(ms,signal){return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms);signal.addEventListener('abort',abort,{once:true})})}
  async function showVideo(job){
    const version=job.version;releaseResult();progress(98,'正在完整加载成片');
    try{const blob=await request('/jobs/'+job.id+'/video',{raw:true,timeout:300000,signal:job.controller.signal,session:job.session});if(version!==runVersion)return;
      if(blob.size<1000||!blob.type.startsWith('video/'))throw Error('视频文件不完整，请重新加载。');
      resultURL=URL.createObjectURL(blob);const video=q('#realVideo');
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('视频预览超时。')),15000);function done(error){clearTimeout(timer);video.onloadeddata=null;video.onerror=null;error?reject(error):resolve()}video.onloadeddata=()=>done();video.onerror=()=>done(Error('浏览器暂时无法解码此视频。'));video.src=resultURL;video.load()});
      if(version!==runVersion)return;const link=q('#realDownload');link.href=resultURL;link.download='beepoptvc_'+new Date().toISOString().slice(0,10)+'.mp4';q('#realResult').hidden=false;progress(100,'成片已就绪');q('#realTitle').textContent='你的视频已完成';q('#realMessage').textContent='由本次商品资料生成。请完整播放、试听，并核对卖点后使用。';q('#cancelReal').hidden=true;
    }catch(e){if(version!==runVersion)return;releaseResult();q('#realTitle').textContent='视频已渲染，等待加载';q('#realMessage').textContent=e.message;progress(98,'等待重新加载');q('#retryRealVideo').hidden=false;q('#retryRealVideo').onclick=()=>showVideo(job)}
  }
  q('#closeReal').onclick=()=>q('#generationDialog').close();
  q('#cancelReal').onclick=async()=>{const job=active;if(!job)return;job.cancelled=true;q('#cancelReal').disabled=true;q('#realMessage').textContent='正在取消任务…';try{if(job.id)await request('/jobs/'+job.id,{method:'DELETE',session:job.session});job.controller.abort();if(!job.id)q('#realMessage').textContent='取消已请求，等待提交状态确认。';else q('#realMessage').textContent='已发送取消请求。'}catch(e){q('#realMessage').textContent=e.message}finally{q('#cancelReal').disabled=false}};
  q('#generate').onclick=async()=>{
    if(!isLocal())return originalDemo();if(active){q('#generationDialog').showModal();return}
    if(!connection)return q('#connectCodex').click();
    if(!q('#description').value.trim()||!images.length){error('请填写商品信息，并添加至少一张商品图。');q('#description').focus();return}
    if(!q('#taskConsent').checked){error('请勾选确认：本次生成使用你自己的 Codex 额度。');q('#taskConsent').focus();return}
    const job={controller:new AbortController(),session:connection,version:++runVersion,id:null,cancelled:false};active=job;mode();error('');releaseResult();q('#realTitle').textContent='正在制作你的视频';q('#realMessage').textContent='任务将在你自己的电脑执行。请保持本机助手运行。';q('#cancelReal').hidden=false;progress(0,'检查授权与资料');q('#generationDialog').showModal();
    try{
      const status=await request('/status',{session:job.session,signal:job.controller.signal});if(!status.account.signedIn)throw Error('Codex 尚未登录，请重新授权。');
      const sourceImages=images.map(x=>x.file),description=q('#description').value,voice=q('#voice').value;
      const upload=await Promise.all(sourceImages.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,data:String(reader.result).split(',')[1]});reader.onerror=()=>reject(Error('图片读取失败。'));reader.readAsDataURL(file)})));
      if(job.cancelled)throw Error('任务已取消，未提交生成。');
      job.id=crypto.randomUUID();
      try{await request('/jobs',{method:'POST',data:{requestId:job.id,description,images:upload,voice,model:'tvc-2-local',duration:'15',ratio:'16:9',consent:true},session:job.session,timeout:120000})}
      catch(submitError){try{await request('/jobs/'+job.id,{session:job.session})}catch{throw submitError}}
      q('#taskConsent').checked=false;
      if(job.cancelled){await request('/jobs/'+job.id,{method:'DELETE',session:job.session});throw Error('任务已取消。')}
      while(true){const state=await request('/jobs/'+job.id,{session:job.session,signal:job.controller.signal});progress(Math.min(98,state.percent),state.message);if(state.status==='completed'){await showVideo(job);break}if(state.status==='failed'||state.status==='cancelled')throw Error(state.message);await wait(1600,job.controller.signal)}
    }catch(e){showFailure(e)}finally{if(active===job)active=null;mode()}
  };
  window.addEventListener('pagehide',()=>{if(resultURL)URL.revokeObjectURL(resultURL)});
  mode();
})();
