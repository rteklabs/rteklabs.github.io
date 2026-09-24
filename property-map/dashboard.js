(function(){
'use strict';
const KEY='propertySpotMapLibrary';
const listEl=document.getElementById('savedMapList');
const countEl=document.getElementById('mapCount');
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[];}catch(_){return [];}}
function write(items){localStorage.setItem(KEY,JSON.stringify(items));}
function when(iso){if(!iso)return '';try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));}catch(_){return iso;}}
function clientUrl(id){return location.origin+location.pathname.replace(/dashboard\.html$/,'')+'view.html?id='+encodeURIComponent(id);}
function copy(text){return navigator.clipboard&&window.isSecureContext?navigator.clipboard.writeText(text):Promise.reject(new Error('Clipboard unavailable'));}
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
    card.querySelector('[data-delete]').onclick=()=>{
      if(!confirm('Delete "'+(item.title||item.homeName||'this map')+'"?'))return;
      write(read().filter(x=>x.id!==item.id));render();
    };
    listEl.appendChild(card);
  });
}
render();
})();