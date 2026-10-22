// Case materials load only after an explicit click. Files stay editable in the existing form.
(function(){
  const names={coffee:'咖啡罐',perfume:'香水 · Elfenstall',flags:'希腊旗装饰签',saturn:'土星灯',camping:'夏日露营推车',grill:'煎烤盘',ghost:'万圣节幽灵灯'};
  const cache=new Map();let activeCase=null,loadVersion=0,controller=null;
  const panel=document.querySelector('#creationPanel');
  const context=document.querySelector('#remixContext');
  function busy(on){panel.setAttribute('aria-busy',String(on));for(const id of ['generate','saveDraft','upload'])document.querySelector('#'+id).disabled=on;document.querySelector('#retryCase').hidden=true;}
  function showContext(title,note){context.hidden=false;document.querySelector('#remixTitle').textContent=title;document.querySelector('#remixNote').textContent=note;}
  function focusEditor(){if(window.history?.replaceState)window.history.replaceState(null,'','#create');else location.hash='create';panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});document.querySelector('#description').focus({preventScroll:true});}
  window.currentCaseId=()=>activeCase;
  window.cancelCaseLoad=()=>{loadVersion++;controller?.abort();controller=null;busy(false);};
  window.restoreCaseContext=id=>{activeCase=names[id]?id:null;context.hidden=!activeCase;if(activeCase)showContext('复刻案例：'+names[activeCase],'商品图片、生成场景与原始产品信息已带入，可继续修改。');};
  async function materialBundle(id,signal){
    if(cache.has(id))return cache.get(id);
    const response=await fetch('case-'+id+'.json?v=20261022-5',{signal});
    if(!response.ok)throw new Error('案例资料暂未加载成功');
    const data=await response.json();
    if(data.id!==id||typeof data.description!=='string'||!data.description.trim()||data.description.length>10000||!Array.isArray(data.images)||data.images.length<1||data.images.length>6)throw new Error('案例资料不完整');
    if(data.images.some(x=>typeof x.name!=='string'||!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(x.dataUrl)))throw new Error('案例图片格式不正确');
    cache.set(id,data);return data;
  }
  function imageFile(asset){const binary=atob(asset.dataUrl.split(',')[1]);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new File([bytes],asset.name,{type:'image/webp'});}
  window.replicateCase=async id=>{
    if(!names[id])return;
    reset();const version=++loadVersion;controller=new AbortController();const request=controller;
    busy(true);showContext('正在载入：'+names[id],'正在带入商品图片、生成场景和原始产品信息…');focusEditor();
    const timeout=setTimeout(()=>request.abort(),45000);
    try{
      const data=await materialBundle(id,request.signal);
      if(version!==loadVersion)return;
      const files=data.images.map(asset=>({file:imageFile(asset),label:asset.label}));
      images=files.map(item=>({...item,url:URL.createObjectURL(item.file)}));
      document.querySelector('#description').value=data.description;
      setMode(false);restoreSettings(data.settings);renderImages();updateText();
      window.restoreCaseContext(id);toast('已带入「'+names[id]+'」的 '+images.length+' 张图片和产品信息');
    }catch(err){
      if(version!==loadVersion)return;
      showContext('案例资料未载入','网络暂时不稳定，请点击重试；也可以直接填写商品资料。');
      const retry=document.querySelector('#retryCase');retry.hidden=false;retry.onclick=()=>window.replicateCase(id);
    }finally{
      clearTimeout(timeout);
      if(version===loadVersion){controller=null;for(const key of ['generate','saveDraft','upload'])document.querySelector('#'+key).disabled=false;panel.setAttribute('aria-busy','false');}
    }
  };
  document.querySelectorAll('[data-remix]').forEach(button=>button.addEventListener('click',()=>window.replicateCase(button.dataset.remix)));
  document.querySelector('#clearCase').addEventListener('click',()=>{reset();document.querySelector('#description').focus();toast('已清除带入的案例资料');});
})();
