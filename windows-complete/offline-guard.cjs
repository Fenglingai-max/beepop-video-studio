'use strict';
// Test-only preload, inherited by Node child processes. No firewall or OS changes.
const fs=require('node:fs');
function allow(url){const u=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)){fs.appendFileSync(__filename+'.blocked.log',u.origin+'\n');throw Error('OFFLINE TEST: external request blocked: '+u.origin)}}
const original=globalThis.fetch;globalThis.fetch=function(input,...rest){allow(typeof input==='string'||input instanceof URL?input:input.url);return original.call(this,input,...rest)};
for(const protocol of ['http','https']){const m=require('node:'+protocol);for(const method of ['request','get']){const fn=m[method];m[method]=function(input,...rest){if(typeof input==='string'||input instanceof URL)allow(input);else allow(protocol+'://'+(input.hostname||input.host||'localhost'));return fn.call(this,input,...rest)}}}
