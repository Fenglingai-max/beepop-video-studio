'use strict';
// Reuse only proxy settings already configured by this Windows user.
// Never change OS settings, certificate checks, or the loopback listener.
const http=require('node:http'),cp=require('node:child_process');
const BASE='https://beepoptvc-background.lnajqk.chatgpt.site';
function parseRegistry(text){const values={};for(const line of String(text).split(/\r?\n/)){const m=line.match(/^\s*(ProxyEnable|ProxyServer|AutoConfigURL)\s+REG_\w+\s+(.+?)\s*$/);if(m)values[m[1]]=m[2]}return values}
function proxyURL(value){if(!value)return '';let text=String(value).trim();if(!/^[a-z]+:\/\//i.test(text))text='http://'+text;const u=new URL(text);if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.pathname!=='/'||u.search||u.hash)throw Error('代理地址需要是 http(s)://主机:端口。');return u.href}
function systemProxy(value){const text=String(value||'').trim();if(!text)return {};if(!text.includes('=')){const url=proxyURL(text);return {HTTP_PROXY:url,HTTPS_PROXY:url}}const entries={};for(const part of text.split(';')){const at=part.indexOf('=');if(at>0)entries[part.slice(0,at).trim().toLowerCase()]=part.slice(at+1).trim()}const result={};if(entries.http)result.HTTP_PROXY=proxyURL(entries.http);if(entries.https)result.HTTPS_PROXY=proxyURL(entries.https);else if(entries.http)result.HTTPS_PROXY=result.HTTP_PROXY;return result}
function settings({platform=process.platform,env=process.env,readRegistry=()=>cp.execFileSync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],{encoding:'utf8',windowsHide:true,timeout:5000})}={}){
 let result={},mode='direct',pac=false;
 const explicitHTTP=env.http_proxy||env.HTTP_PROXY,explicitHTTPS=env.https_proxy||env.HTTPS_PROXY;
 if(explicitHTTP||explicitHTTPS){if(explicitHTTP)result.HTTP_PROXY=proxyURL(explicitHTTP);if(explicitHTTPS)result.HTTPS_PROXY=proxyURL(explicitHTTPS);else if(result.HTTP_PROXY)result.HTTPS_PROXY=result.HTTP_PROXY;mode='environment'}
 else if(platform==='win32'){let values={};try{values=parseRegistry(readRegistry())}catch{}pac=Boolean(values.AutoConfigURL);if(/^0x0*1$/i.test(values.ProxyEnable||'')){result=systemProxy(values.ProxyServer);if(result.HTTP_PROXY||result.HTTPS_PROXY)mode='windows-system'}}
 const bypass=[env.no_proxy||env.NO_PROXY||'','localhost','127.0.0.1','::1','[::1]'].filter(Boolean).join(',');result.NO_PROXY=bypass;result.no_proxy=bypass;
 return {proxyEnv:result,mode,pac};
}
let current;
function configure(options){if(current&&!options)return current;const config=settings(options);if(config.mode!=='direct'){if(typeof http.setGlobalProxyFromEnv!=='function')throw Error('当前 Node.js 不支持系统代理连接，请使用内置 Node.js 24 的助手 App。');http.setGlobalProxyFromEnv(config.proxyEnv)}current={mode:config.mode,pac:config.pac};return current}
function modeLabel(){const c=configure();return c.mode==='windows-system'?'Windows 系统代理':c.mode==='environment'?'已配置的环境代理':c.pac?'直连（检测到 PAC，需确认系统提供 HTTP 代理）':'直连'}
function requestId(r){const id=r.headers.get('cf-ray')||'';return /^[a-z0-9-]{1,80}$/i.test(id)?id:''}
async function responseError(r){let message='',structured=false;if((r.headers.get('content-type')||'').includes('application/json')){try{const text=await r.text();if(text.length<32768){const d=JSON.parse(text);if(typeof d.error==='string'){message=d.error.slice(0,600);structured=true}}}catch{}}
 const id=requestId(r),detail='HTTP '+r.status+(id?'，编号 '+id:'');
 if(!message){if(r.status>=300&&r.status<400)message='后台返回了登录跳转（'+detail+'）。请从官网重新发起连接。';else if(r.status===403)message='后台拒绝了助手的网络请求（'+detail+'）。浏览器与助手可能使用了不同网络。';else message='助手连接后台失败（'+detail+'），请稍后重新授权。'}
 const error=Object.assign(Error(message),{status:structured?r.status:503,httpStatus:r.status,requestId:id,networkMode:configure().mode});
 return error;
}
async function request(url,options={}){configure();try{return await fetch(url,{...options,redirect:'manual'})}catch(e){const code=String(e.cause?.code||e.code||'NETWORK_ERROR').replace(/[^a-z0-9_]/gi,'').slice(0,60);throw Object.assign(Error('助手无法连接后台（'+code+'；'+modeLabel()+'）。浏览器可访问时，请核对系统代理设置。'),{status:503,networkCode:code})}}
async function health(){const r=await request(BASE+'/api/bridge/health',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw await responseError(r);if(!(r.headers.get('content-type')||'').includes('application/json'))throw Object.assign(Error('后台返回了网页，未返回状态数据；请核对网络或登录跳转。'),{status:503});const d=await r.json();if(d.service!=='beepoptvc-background')throw Error('状态响应不是 beepoptvc 后台。');return {ok:true,mode:configure().mode,label:modeLabel(),version:d.version}}
module.exports={settings,parseRegistry,proxyURL,systemProxy,configure,modeLabel,request,responseError,health};
if(require.main===module&&process.argv[2]==='check')health().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.log(JSON.stringify({ok:false,error:error.message,httpStatus:error.httpStatus,requestId:error.requestId,networkCode:error.networkCode}));process.exitCode=1});
