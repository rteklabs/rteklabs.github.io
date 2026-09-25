(function(){
'use strict';
const KEY='propertySpotMapLibrary';
const DATA_API=window.PROPERTY_MAP_DATA_API||'';
const listEl=document.getElementById('savedMapList');
const countEl=document.getElementById('mapCount');
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[];}catch(_){return [];}}
function write(items){localStorage.setItem(KEY,JSON.stringify(items));}
function when(iso){if(!iso)return '';try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));}catch(_){return iso;}}
function clientUrl(id){return location.origin+location.pathname.replace(/dashboard\.html$/,'')+'view.html?id='+encodeURIComponent(id);}
function copy(text){return navigator.clipboard&&window.isSecureContext?navigator.clipboard.writeText(text):Promise.reject(new Error('Clipboard unavailable'));}
function adminWriteKey(){
  let key=localStorage.getItem('propertySpotMapWriteKey')||'';
  if(key)return key;
  key=(prompt('Enter your Property Spot Map WRITE_KEY. It will be stored only in this browser.')||'').trim();
  if(key)localStorage.setItem('propertySpotMapWriteKey',key);
  return key;
}
function jsonpMap(id){
  return new Promise((resolve,reject)=>{
    if(!DATA_API){reject(new Error('Publishing service is not configured.'));return;}
    const cb='psmdash_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script');
    const timer=setTimeout(()=>{cleanup();reject(new Error('Publishing service timed out.'));},12000);
    function cleanup(){clearTimeout(timer);delete window[cb];script.remove();}
    window[cb]=value=>{cleanup();resolve(value);};
    script.onerror=()=>{cleanup();reject(new Error('Could not reach publishing service.'));};
    script.src=DATA_API+'?id='+encodeURIComponent(id)+'&callback='+encodeURIComponent(cb);
    document.head.appendChild(script);
  });
}
async function deletePublishedMap(item){
  if(!DATA_API)throw new Error('Publishing service is not configured.');
  const key=adminWriteKey();if(!key)throw new Error('WRITE_KEY is required to delete a published map.');
  await fetch(DATA_API,{
    method:'POST',mode:'no-cors',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'delete',key,id:item.id})
  });
  let last=null;
  for(let i=0;i<6;i++){
    await new Promise(r=>setTimeout(r,i?650:300));
    last=await jsonpMap(item.id);
    if(last&&last.ok===false&&last.error==='Map not found')return true;
  }
  throw new Error(last&&last.error?last.error:'Published map could not be verified as deleted.');
}
function render(){
  const items=read().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  countEl.textContent=items.length+(items.length===1?' map':' maps');
  listEl.replaceChildren();
  if(!items.length){
    listEl.innerHTML='<div class="dashboardEmpty"><strong>No saved maps yet.</strong><div class="hint">Create your first client map, add the useful places, then press Save & back to dashboard.</div><a class="btn primary" href="index.html?new=1&edit=1">Create first map</a></div>';
    return;
  }
  items.forEach(item=>{
    const card=document.createElement('article');card.className='savedMapCard';
    card.innerHTML='<div class="savedMapBody"><div class="savedMapTitle">'+esc(item.title||item.homeName||'Untitled map')+'</div>'
      +(item.client?'<div class="savedMapClient">'+esc(item.client)+'</div>':'')
      +'<div class="savedMapProperty">'+esc(item.homeName||'Property')+'</div>'
      +(item.homeAddress?'<div class="savedMapAddress">'+esc(item.homeAddress)+'</div>':'')
      +'<div class="savedMapMeta">'+Number(item.poiCount||0)+' points of interest · Updated '+esc(when(item.updatedAt))+'</div></div>'
      +'<div class="savedMapActions"><a class="btn primary tiny" href="index.html?map='+encodeURIComponent(item.id)+'&edit=1">Edit</a><a class="btn ghost tiny" target="_blank" rel="noopener" href="view.html?id='+encodeURIComponent(item.id)+'">View</a><button class="btn ghost tiny" type="button" data-copy>Copy link</button><button class="btn ghost tiny danger" type="button" data-delete>Delete</button></div>';
    card.querySelector('[data-copy]').onclick=()=>{const b=card.querySelector('[data-copy]');copy(clientUrl(item.id)).then(()=>{const old=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=old,1200);}).catch(()=>prompt('Copy this client link:',clientUrl(item.id)));};
    card.querySelector('[data-delete]').onclick=async()=>{
      if(!confirm('Permanently delete "'+(item.title||item.homeName||'this map')+'"?\n\nThis removes the published client map from Google Drive and this dashboard.'))return;
      const b=card.querySelector('[data-delete]'),old=b.textContent;
      b.disabled=true;b.textContent='Deleting…';
      try{
        await deletePublishedMap(item);
        write(read().filter(x=>x.id!==item.id));
        render();
      }catch(e){
        b.disabled=false;b.textContent=old;
        alert('Delete failed: '+e.message);
      }
    };
    listEl.appendChild(card);
  });
}
async function reconcileMissingPublishedMaps(){
  if(!DATA_API)return;
  const items=read();
  if(!items.length)return;
  const keep=[];
  for(const item of items){
    try{
      const result=await jsonpMap(item.id);
      if(result&&result.ok===false&&result.error==='Map not found')continue;
    }catch(_){}
    keep.push(item);
  }
  if(keep.length!==items.length){
    write(keep);
    render();
  }
}
render();
reconcileMissingPublishedMaps();
})();