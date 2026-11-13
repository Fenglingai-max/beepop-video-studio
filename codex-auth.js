(function(){
'use strict';
const q=s=>document.querySelector(s),RELAY='https://beepoptvc-background.lnajqk.chatgpt.site',KEY='beepoptvc-connection-v3';
let connection=null,device=null,pending=null;
try{const d=JSON.parse(localStorage.getItem(KEY));if(d?.expiresAt>Date.now()&&/^[a-f0-9]{64}$/.test(d.token)&&/^[a-f0-9-]{36}$/.test(d.id))connection=d;}catch{}
function paint(){q('#connectCodex').textContent=device?.online?'我的 Codex ✓':'连接我的 Codex';q('#disconnectCodex').hidden=!connection;q('#codexStatus').textContent=device?.online?'Codex 已验证 · LibTV 登录页面制作':connection?'Codex 连接已保存 · 等待助手上线':'连接 Codex 账号 · LibTV 登录页面制作';}
function note(text){q('#codexMessage').textContent=text;}
async function deviceRequest(method='GET'){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{const r=await fetch(RELAY+'/api/bridge/device',{method,headers:{Authorization:'Bearer '+connection.token},cache:'no-store',signal:controller.signal});if(!r.ok){if(r.status===401){connection=null;device=null;localStorage.removeItem(KEY);paint();}throw Error(r.status===401?'连接已过期，请重新授权。':'暂时无法验证连接，请确认助手已启动。');}return r.status===204?null:r.json();}finally{clearTimeout(timeout);}
}
async function verify(){if(!connection)return;note('正在验证 Codex 连接…');try{device=await deviceRequest();note(device.online?'Codex 账号连接已验证。准备任务包后，交给 Codex 执行。':'已保存授权，但助手暂未上线。请启动助手后重新验证。');}catch(e){note(e.name==='AbortError'?'验证超时，请稍后重试。':e.message);}paint();}
q('#connectCodex').onclick=()=>{q('#codexDialog').showModal();if(connection)verify();};q('#closeCodex').onclick=()=>q('#codexDialog').close();
q('#openLocalAuth').onclick=()=>{
 const state=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
 const url=RELAY+'/connect?origin='+encodeURIComponent(location.origin)+'&state='+state;
 pending={state,createdAt:Date.now(),popup:window.open(url,'beepoptvc-account-connect','width=650,height=820')};q('#manualLocalLink').href=url;q('#manualLocalLink').hidden=false;note('请在账号连接页面核对并授权，完成后返回工作台。');
};
window.addEventListener('message',e=>{const d=e.data;if(e.origin!==RELAY||!pending||d?.type!=='beepoptvc-relay-connected'||d.state!==pending.state||Date.now()-pending.createdAt>600000||(pending.popup&&e.source!==pending.popup)||!d.connection||d.device?.id!==d.connection.id||!/^[a-f0-9-]{36}$/.test(d.connection.id||'')||!/^[a-f0-9]{64}$/.test(d.connection.token||'')||!Number.isFinite(d.device.expiresAt)||d.device.expiresAt<=Date.now())return;
 connection={id:d.connection.id,token:d.connection.token,expiresAt:d.device.expiresAt};device=d.device;pending=null;localStorage.setItem(KEY,JSON.stringify(connection));paint();verify();});
q('#disconnectCodex').onclick=async()=>{if(!connection)return;try{await deviceRequest('DELETE');connection=null;device=null;localStorage.removeItem(KEY);paint();note('已断开当前网页的 Codex 连接。');}catch(e){note(e.message+' 请重试断开。');}};
paint();if(connection)verify();
})();
