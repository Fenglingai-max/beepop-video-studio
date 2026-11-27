(function(){'use strict';
const q=s=>document.querySelector(s),buttons=[['#downloadCompanion','macos','下载 Mac 一键启动版'],['#downloadCompanionWindows','windows','下载 Windows 版']];
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
async function get(url){for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('下载返回 HTTP '+r.status);return await r.arrayBuffer();}catch(e){if(attempt===2)throw e;}}}
for(const [selector,platform,label] of buttons){const button=q(selector);if(!button)continue;button.onclick=async()=>{for(const [s]of buttons)q(s).disabled=true;try{
 q('#codexMessage').textContent='正在准备'+(platform==='macos'?' Mac 应用':' Windows 启动包')+'…';
 const manifest=JSON.parse(new TextDecoder().decode(await get('companion-oneclick.json?v=20261127-winfix2'))),m=manifest.platforms?.[platform];
 if(manifest.schema!==1||manifest.executionVersion!=='0.9.12'||!m||!Array.isArray(m.parts)||!m.parts.length||m.parts.length>100||m.parts.some((p,i)=>p!=='companion-oneclick-'+platform+'-'+String(i+1).padStart(2,'0')+'.bin')||m.filename!==(platform==='macos'?'BeePOP-macOS.zip':'BeePOP-Windows.zip')||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>60000000||!/^[a-f0-9]{64}$/.test(m.sha256||''))throw Error('下载清单无效，请刷新页面。');
 const parts=new Array(m.parts.length);let cursor=0,done=0;
 await Promise.all(Array.from({length:3},async()=>{while(cursor<m.parts.length){const i=cursor++;parts[i]=await get(m.parts[i]+'?sha='+m.sha256);button.textContent='正在下载 '+Math.round(++done/m.parts.length*100)+'%';}}));
 const blob=new Blob(parts,{type:'application/zip'});if(blob.size!==m.bytes||await digest(await blob.arrayBuffer())!==m.sha256)throw Error('下载校验失败，请重试。');
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=m.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 q('#codexMessage').textContent=platform==='macos'?'下载完成后解压，双击 BeePOP 应用。首次会显示组件准备进度，就绪后自动打开工作台。若 macOS 提示无法验证开发者，请在系统设置“隐私与安全性”中确认打开。':'下载完成后完整解压，双击“启动BeePOP.cmd”；其余文件已收进“internal”内部目录。保留启动窗口，助手就绪后再连接验证。';
 }catch(e){q('#codexMessage').textContent='下载未完成：'+e.message+' 请点击下载按钮重试。';}finally{for(const [s,,text]of buttons){q(s).disabled=false;q(s).textContent=text;}}};}
})();
