'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
try{const root=path.resolve(process.argv[2]||'.');require(root+'/zip-patch.js');const m=JSON.parse(fs.readFileSync(root+'/local-companion-v4.json','utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const base=Buffer.concat(m.base.parts.map(p=>fs.readFileSync(path.join(root,p))));if(hash(base)!==m.base.sha256)throw Error('base checksum');const updates=new Map();for(const p of m.patches){const bytes=fs.readFileSync(path.join(root,p.path));if(hash(bytes)!==p.sha256)throw Error('patch checksum '+p.path);updates.set(p.entry,new Uint8Array(bytes))}
const bytes=BeePOPZip.patch(new Uint8Array(base),updates);if(hash(bytes)!==m.sha256)throw Error('archive checksum');fs.writeFileSync(path.join(root,'companion-verified.zip'),bytes);console.log('Verified helper ZIP assembled from audited source patches.');

}catch(e){console.error('::error::'+String(e.message).replace(/\r?\n/g,' '));process.exitCode=1}
