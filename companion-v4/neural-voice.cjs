'use strict';
const path=require('node:path');
const catalog=[
 ['af_bella','Bella · 美式女声'],['af_heart','Heart · 美式女声'],['af_nicole','Nicole · 美式女声'],['af_sarah','Sarah · 美式女声'],['af_kore','Kore · 美式女声'],
 ['am_michael','Michael · 美式男声'],['am_puck','Puck · 美式男声'],['bf_emma','Emma · 英式女声'],['bm_george','George · 英式男声'],['bm_fable','Fable · 英式男声']
];
function voices(){return catalog.map(([name,label])=>({id:'local:Kokoro'+name.replace(/_/g,''),name,label:label+' · 神经配音'}))}
function modelDir(){return process.env.BEEPOP_VOICE_MODEL_DIR||path.join(__dirname,'data','models','kokoro-v1')}
module.exports={voices,modelDir};
