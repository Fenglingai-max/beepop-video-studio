'use strict';
const crypto=require('node:crypto');
function validControl(req,secret){const value=req.headers['x-beepop-service'];return !req.headers.origin&&/^[a-f0-9]{64}$/.test(secret||'')&&typeof value==='string'&&value.length===secret.length&&crypto.timingSafeEqual(Buffer.from(value),Buffer.from(secret))}
module.exports={validControl};
