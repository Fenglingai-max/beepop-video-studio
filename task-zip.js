(function(root){
'use strict';
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function create(files){const parts=[],directory=[];let offset=0,size=0;const enc=new TextEncoder();
 for(const f of files){if(f.name.startsWith('/')||f.name.split('/').includes('..'))throw Error('Invalid archive path');const name=enc.encode(f.name),bytes=f.bytes,checksum=crc(bytes),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,checksum,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);h.set(name,30);parts.push(h,bytes);
 const d=new Uint8Array(46+name.length),w=new DataView(d.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,checksum,true);w.setUint32(20,bytes.length,true);w.setUint32(24,bytes.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);d.set(name,46);directory.push(d);size+=d.length;offset+=h.length+bytes.length;
 }const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);const result=new Uint8Array(offset+size+22);let p=0;for(const b of [...parts,...directory,end]){result.set(b,p);p+=b.length;}return result;
}const api={create};root.TVCZip=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
