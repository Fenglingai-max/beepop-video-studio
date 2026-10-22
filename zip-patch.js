(function(root){
'use strict';
const encode=new TextEncoder(),decode=new TextDecoder();
const cat=arrays=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){out.set(a,p);p+=a.length}return out};
const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function record(name,bytes,offset,previous){const file=encode.encode(name),sum=crc(bytes),time=previous?new DataView(previous.buffer,previous.byteOffset,previous.length).getUint16(12,true):0,date=previous?new DataView(previous.buffer,previous.byteOffset,previous.length).getUint16(14,true):23894;
 const local=new Uint8Array(30+file.length+bytes.length),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(10,time,true);l.setUint16(12,date,true);l.setUint32(14,sum,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,file.length,true);local.set(file,30);local.set(bytes,30+file.length);
 const central=new Uint8Array(46+file.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,0x0314,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(12,time,true);c.setUint16(14,date,true);c.setUint32(16,sum,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,file.length,true);c.setUint32(38,previous?new DataView(previous.buffer,previous.byteOffset,previous.length).getUint32(38,true):((name.endsWith('.command')?0o100755:0o100644)<<16)>>>0,true);c.setUint32(42,offset,true);central.set(file,46);return {local,central}}
function patch(input,updates){const base=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(base.buffer,base.byteOffset,base.length);let end=-1;for(let i=base.length-22;i>=Math.max(0,base.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break}if(end<0)throw Error('安装包目录损坏。');const count=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),offset=0;const locals=[],centrals=[],remaining=new Map(updates);
 for(let i=0;i<count;i++){if(v.getUint32(pos,true)!==0x02014b50)throw Error('安装包条目损坏。');const length=46+v.getUint16(pos+28,true)+v.getUint16(pos+30,true)+v.getUint16(pos+32,true),name=decode.decode(base.subarray(pos+46,pos+46+v.getUint16(pos+28,true))),previous=base.slice(pos,pos+length);if(!name.startsWith('beepoptvc-local/')||name.includes('..'))throw Error('安装包路径无效。');let r;
  if(remaining.has(name)){r=record(name,remaining.get(name),offset,previous);remaining.delete(name)}else{const start=v.getUint32(pos+42,true);if(v.getUint32(start,true)!==0x04034b50||v.getUint16(start+6,true)&8)throw Error('安装包压缩条目不受支持。');const size=30+v.getUint16(start+26,true)+v.getUint16(start+28,true)+v.getUint32(pos+20,true),local=base.slice(start,start+size),central=previous;new DataView(central.buffer).setUint32(42,offset,true);r={local,central}}
  locals.push(r.local);centrals.push(r.central);offset+=r.local.length;pos+=length;
 }
 for(const [name,bytes]of remaining){if(!name.startsWith('beepoptvc-local/')||name.includes('..'))throw Error('更新路径无效。');const r=record(name,bytes,offset);locals.push(r.local);centrals.push(r.central);offset+=r.local.length}
 const central=cat(centrals),eocd=new Uint8Array(22),e=new DataView(eocd.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,locals.length,true);e.setUint16(10,locals.length,true);e.setUint32(12,central.length,true);e.setUint32(16,offset,true);return cat([...locals,central,eocd]);
}
root.BeePOPZip={patch};
})(typeof window==='undefined'?globalThis:window);
