// Case materials load only after an explicit click. Files stay editable in the existing form.
(function(){
  const names={"v1-01": "蓝色手动颈部按摩器", "v1-02": "水壶网兜提袋", "v1-03": "粉色四格烘焙模具", "v1-04": "竹制四孔鸡蛋托盘", "v1-05": "防滑蹦床袜套装", "v1-06": "粉色排球护具套装", "v1-07": "亚克力收藏展示盒", "v1-08": "双人网球拍套装", "v1-09": "红色爆米花纸盒", "v1-10": "圣诞陶瓷房屋摆件", "v2-01": "水壶网兜提袋", "v2-02": "竹制四孔鸡蛋托盘", "v2-03": "防滑蹦床袜套装", "v2-04": "粉色排球护具套装", "v2-05": "亚克力收藏展示盒", "v2-06": "红色爆米花纸盒", "v2-07": "圣诞陶瓷房屋摆件", "v2-09": "招财福羊摆件", "v2-17": "蓝色手动颈部按摩器", "v2-18": "双人网球拍套装", "v3-01": "招财福羊摆件", "v3-02": "圣诞陶瓷房屋摆件", "v3-03": "蓝色伸缩挂绳卡套", "v3-04": "硅胶法棍烤盘", "v3-05": "竹制四孔鸡蛋托盘", "v3-06": "防滑蹦床袜套装", "v3-07": "蓝色手动颈部按摩器", "v3-08": "水壶网兜提袋", "v3-09": "亚克力收藏展示盒", "v3-10": "双人网球拍套装"};
  const cache=new Map();let activeCase=null,loadVersion=0,controller=null;
  const panel=document.querySelector('#creationPanel');
  const context=document.querySelector('#remixContext');
  function busy(on){panel.setAttribute('aria-busy',String(on));for(const id of ['generate','saveDraft','upload'])document.querySelector('#'+id).disabled=on;document.querySelector('#retryCase').hidden=true;}
  function showContext(title,note){context.hidden=false;document.querySelector('#remixTitle').textContent=title;document.querySelector('#remixNote').textContent=note;}
  function focusEditor(){if(window.history?.replaceState)window.history.replaceState(null,'','#create');else location.hash='create';panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});document.querySelector('#description').focus({preventScroll:true});}
  window.currentCaseId=()=>activeCase;
  window.cancelCaseLoad=()=>{loadVersion++;controller?.abort();controller=null;busy(false);};
  window.restoreCaseContext=id=>{activeCase=names[id]?id:null;context.hidden=!activeCase;if(activeCase)showContext('复刻案例：'+names[activeCase],'已载入原聊天商品资料与制作设置，可继续修改。');};
  async function materialBundle(id,signal){
    if(cache.has(id))return cache.get(id);
    const response=await fetch('case-materials.json?v=20261113-history1',{signal});
    if(!response.ok)throw new Error('案例资料暂未加载成功');
    const all=await response.json();const data=(all.cases||all)[id];if(data&&all.images){const bank={};const parts=[...new Set(data.images.map(a=>all.images[a.imageRef]))];await Promise.all(parts.map(async file=>{if(!/^case-images-\d+\.json$/.test(file))throw new Error('案例素材索引无效');const r=await fetch(file+'?v=20261113-history1',{signal});if(!r.ok)throw new Error('案例图片暂未加载成功');Object.assign(bank,await r.json());}));data.images=data.images.map(a=>({...a,dataUrl:bank[a.imageRef]}));}if(!data)throw new Error('案例资料不存在');
    if(data.id!==id||typeof data.description!=='string'||!data.description.trim()||data.description.length>10000||!Array.isArray(data.images)||data.images.length<1||data.images.length>6)throw new Error('案例资料不完整');
    if(data.images.some(x=>typeof x.name!=='string'||!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(x.dataUrl)))throw new Error('案例图片格式不正确');
    cache.set(id,data);return data;
  }
  function imageFile(asset){const binary=atob(asset.dataUrl.split(',')[1]);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new File([bytes],asset.name,{type:'image/webp'});}
  window.replicateCase=async id=>{
    if(!names[id])return;
    reset();const version=++loadVersion;controller=new AbortController();const request=controller;
    busy(true);showContext('正在载入：'+names[id],'正在带入原聊天商品资料、图片和制作设置…');focusEditor();
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
  document.querySelectorAll('[data-remix]').forEach(button=>{if(!button.closest('#caseGallery'))button.addEventListener('click',()=>window.replicateCase(button.dataset.remix));});
  document.querySelector('#clearCase').addEventListener('click',()=>{reset();document.querySelector('#description').focus();toast('已清除带入的案例资料');});
})();
