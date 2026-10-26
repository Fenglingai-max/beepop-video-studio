'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
function createPlatform({platform=process.platform,arch=process.arch,env=process.env,exists=fs.existsSync,resolve=require.resolve,node=process.execPath,root=__dirname,compositorDir}={}){
 const win=platform==='win32',p=win?path.win32:path;
 function supported(){if(!(win&&arch==='x64')&&!(platform==='darwin'&&['x64','arm64'].includes(arch)))throw Error('需要 Windows 10/11 的 x64 版 Node.js 22+，或 macOS。Windows ARM 电脑请使用 x64 版 Node.js。')}
 function mediaTools(){supported();if(Boolean(env.FFMPEG_PATH)!==Boolean(env.FFPROBE_PATH))throw Error('FFMPEG_PATH 和 FFPROBE_PATH 需要一起设置。');
  if(env.FFMPEG_PATH&&env.FFPROBE_PATH)return {ffmpeg:env.FFMPEG_PATH,ffprobe:env.FFPROBE_PATH};
  const name=win?'@remotion/compositor-win32-x64-msvc':'@remotion/compositor-darwin-'+arch;
  const dir=compositorDir?compositorDir(name):(()=>{const cli=createRequire(resolve('@remotion/cli')),renderer=createRequire(cli.resolve('@remotion/renderer'));return renderer(name).dir})();
  const ext=win?'.exe':'',tools={ffmpeg:p.join(dir,'ffmpeg'+ext),ffprobe:p.join(dir,'ffprobe'+ext)};
  for(const file of Object.values(tools))if(!exists(file))throw Error('视频组件不完整，请重新运行助手启动文件以安装依赖。');return tools;
 }
 function spec(file){if(/\.(cmd|bat)$/i.test(file)){const script=p.join(p.dirname(file),'node_modules','@openai','codex','bin','codex.js');return exists(script)?{command:node,prefix:[script]}:null}return /\.[cm]?js$/i.test(file)?{command:node,prefix:[file]}:{command:file,prefix:[]}}
 function codexCommand(){supported();if(env.BEEPOP_CODEX_BIN){if(!exists(env.BEEPOP_CODEX_BIN))throw Error('BEEPOP_CODEX_BIN 指向的 Codex 文件不存在。');const s=spec(env.BEEPOP_CODEX_BIN);if(!s)throw Error('请将 BEEPOP_CODEX_BIN 指向官方 codex.exe 或 codex.js。');return s}
  const mac='/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';if(!win&&exists(mac))return spec(mac);
  const local=p.join(root,'node_modules','@openai','codex','bin','codex.js');if(exists(local))return spec(local);
  const candidates=win?[...(env.PATH||env.Path||'').split(';').filter(Boolean).flatMap(d=>[p.join(d,'codex.exe'),p.join(d,'codex.cmd')]),env.LOCALAPPDATA&&p.join(env.LOCALAPPDATA,'Programs','OpenAI','Codex','bin','codex.exe'),env.APPDATA&&p.join(env.APPDATA,'npm','node_modules','@openai','codex','bin','codex.js')].filter(Boolean):[];
  for(const f of candidates)if(exists(f)){const s=spec(f);if(s)return s}
  if(!win)return {command:'codex',prefix:[]};throw Error('Codex 组件不完整，请重新运行 start-beepoptvc.cmd 安装锁定依赖。');
 }
 return {supported,mediaTools,codexCommand};
}
module.exports={createPlatform};
