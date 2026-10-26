'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net'),{spawn}=require('node:child_process');
const network=require('./relay-network.cjs');
test('reuse configured proxy; preserve loopback bypass and do not read registry when env is explicit',()=>{
 const a=network.settings({platform:'win32',env:{HTTPS_PROXY:'http://127.0.0.1:7890',NO_PROXY:'.example.test'},readRegistry(){throw Error('not needed')}});assert.equal(a.mode,'environment');assert.equal(a.proxyEnv.HTTPS_PROXY,'http://127.0.0.1:7890/');assert.match(a.proxyEnv.NO_PROXY,/127\.0\.0\.1/);assert.match(a.proxyEnv.NO_PROXY,/\.example\.test/);
 const b=network.settings({platform:'win32',env:{},readRegistry:()=>String.raw`    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ    http=127.0.0.1:7890;https=127.0.0.1:7891`});assert.equal(b.mode,'windows-system');assert.equal(b.proxyEnv.HTTPS_PROXY,'http://127.0.0.1:7891/');
 const c=network.settings({platform:'win32',env:{},readRegistry:()=>String.raw` ProxyEnable REG_DWORD 0x0
 AutoConfigURL REG_SZ https://proxy.example.invalid/a.pac`});assert.equal(c.mode,'direct');assert.equal(c.pac,true);assert.equal(c.proxyEnv.HTTPS_PROXY,undefined);
 assert.throws(()=>network.proxyURL('socks://127.0.0.1:1234'));assert.throws(()=>network.proxyURL('http://example.invalid/path'));
});
test('gateway failures show HTTP and request ID, and do not revoke saved authorization as a fake 401',async()=>{
 let e=await network.responseError(new Response('<html>blocked</html>',{status:403,headers:{'Content-Type':'text/html','cf-ray':'abc123-LAX'}}));assert.equal(e.status,503);assert.equal(e.httpStatus,403);assert.match(e.message,/403/);assert.match(e.message,/abc123-LAX/);
 e=await network.responseError(new Response('<html>login</html>',{status:401}));assert.equal(e.status,503);
 e=await network.responseError(Response.json({error:'连接已过期，请重新授权。'},{status:401}));assert.equal(e.status,401);assert.match(e.message,/已过期/);
 e=await network.responseError(new Response(null,{status:302,headers:{location:'https://auth.example.invalid'}}));assert.match(e.message,/登录跳转/);
});
test('real Node fetch uses configured proxy and bypasses it for local assistant',async()=>{
 const target=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"ok":true}')});await new Promise(r=>target.listen(0,'127.0.0.1',r));let hits=0;
 const proxy=http.createServer();proxy.on('connect',(req,client,head)=>{hits++;const socket=net.connect(target.address().port,'127.0.0.1',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)socket.write(head);client.pipe(socket);socket.pipe(client)});socket.on('error',()=>client.destroy());client.on('error',()=>socket.destroy());});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const script=`const n=require(${JSON.stringify(require.resolve('./relay-network.cjs'))});n.configure({platform:'win32',env:{},readRegistry:()=> ' ProxyEnable REG_DWORD 0x1\\n ProxyServer REG_SZ 127.0.0.1:${proxy.address().port}'});(async()=>{for(const u of ['http://beepop.fixture.invalid/status','http://127.0.0.1:${target.address().port}/health']){const r=await fetch(u);if(!(await r.json()).ok)throw Error('bad health')}console.log('PROXY_AND_LOOPBACK_OK')})().catch(e=>{console.error(e);process.exitCode=1});`;
 try{await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',script],{stdio:['ignore','pipe','pipe'],windowsHide:true});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('exit',code=>{try{assert.equal(code,0,err);assert.match(out,/PROXY_AND_LOOPBACK_OK/);resolve()}catch(e){reject(e)}})});assert.equal(hits,1,'external fetch goes through proxy, local fetch bypasses it')}finally{proxy.closeAllConnections();target.closeAllConnections();await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>target.close(r))])}
});
