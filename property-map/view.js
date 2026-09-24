(function(){
'use strict';
const categories={
  market:{en:'Wet / Fresh Market',zh:'菜市场 / 鲜货市场',icon:'🥬'},
  grocery:{en:'Supermarket / Grocery',zh:'超市 / 杂货',icon:'🛒'},
  chinese:{en:'Chinese Grocery',zh:'中国超市',icon:'🥟'},
  school:{en:'School / University',zh:'学校 / 大学',icon:'🎓'},
  transit:{en:'LRT / MRT / Transport',zh:'交通',icon:'🚆'},
  food:{en:'Food / Restaurant',zh:'餐饮',icon:'🍜'},
  medical:{en:'Medical',zh:'医疗',icon:'🏥'},
  shopping:{en:'Shopping',zh:'购物',icon:'🛍️'},
  leisure:{en:'Leisure / Park',zh:'休闲 / 公园',icon:'🌳'},
  other:{en:'Other',zh:'其他',icon:'📍'}
};
const $=id=>document.getElementById(id);
let data=null,map=null,infoWindow=null,lang='en',homeMarker=null,poiMarkers=[];
const livePlaces=new Map();
const DATA_API=window.PROPERTY_MAP_DATA_API||'';
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function validId(id){return /^psm_[A-Z2-9]{8}$/.test(id||'');}
function latLng(place){if(!place||!place.location)return null;const loc=place.location,lat=typeof loc.lat==='function'?loc.lat():loc.lat,lng=typeof loc.lng==='function'?loc.lng():loc.lng;return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;}
function asPlace(place){const loc=latLng(place);return {placeId:place.id,name:place.displayName||'Unnamed place',address:place.formattedAddress||'',type:place.primaryTypeDisplayName||place.primaryType||'',lat:loc&&loc.lat,lng:loc&&loc.lng};}
function homeData(){return data.home&&data.home.googlePlaceId?(livePlaces.get(data.home.googlePlaceId)||{name:data.home.name||'Property',address:data.home.address||'',lat:data.home.lat,lng:data.home.lng}):data.home||{};}
function poiData(p){return p.placeId?{...(livePlaces.get(p.placeId)||{name:p.name||'Place',address:p.address||'',lat:p.lat,lng:p.lng}),...p}:p;}
function distance(a,b){if(a.lat==null||a.lng==null||b.lat==null||b.lng==null)return null;const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLng=(b.lng-a.lng)*r,x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;return 12742*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function distanceText(p){const km=distance(homeData(),p);return km==null?'':km<1?Math.round(km*1000)+' m':km.toFixed(1)+' km';}
function googleUrl(p){const id=p.placeId||p.googlePlaceId;if(id)return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.name||'place')+'&query_place_id='+encodeURIComponent(id);return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([p.name,p.address].filter(Boolean).join(' '));}
function roundPinIcon(size,fill,stroke){return {path:google.maps.SymbolPath.CIRCLE,scale:size/2,fillColor:fill,fillOpacity:1,strokeColor:stroke,strokeWeight:2};}
function popup(p){return '<strong>'+esc(p.name||'Place')+'</strong><br>'+esc(p.address||'')+(p.note?'<br>'+esc(p.note):'')+'<br><a target="_blank" rel="noopener" href="'+esc(googleUrl(p))+'">Open in Google Maps ↗</a>';}
function clearMarkers(){if(homeMarker)homeMarker.setMap(null);poiMarkers.forEach(m=>m&&m.setMap(null));homeMarker=null;poiMarkers=[];}
function renderMap(fit){if(!map||!data)return;clearMarkers();const bounds=new google.maps.LatLngBounds();let count=0,home=homeData();
  if(home.lat!=null&&home.lng!=null){const pos={lat:home.lat,lng:home.lng};homeMarker=new google.maps.Marker({map,position:pos,title:home.name||'Property',icon:roundPinIcon(36,'#111827','#fff'),label:{text:'⌂',color:'#fff',fontSize:'17px',fontWeight:'800'}});homeMarker.addListener('click',()=>{infoWindow.setContent(popup(home));infoWindow.open(map,homeMarker);});bounds.extend(pos);count++;}
  (data.pois||[]).forEach((raw,i)=>{const p=poiData(raw);if(p.lat==null||p.lng==null)return;const cat=categories[p.category]||categories.other,pos={lat:p.lat,lng:p.lng};const m=new google.maps.Marker({map,position:pos,title:p.name,icon:roundPinIcon(32,'#fff','#fff'),label:{text:cat.icon,fontSize:'16px'}});m.addListener('click',()=>{infoWindow.setContent(popup(p));infoWindow.open(map,m);});poiMarkers[i]=m;bounds.extend(pos);count++;});
  if(fit&&count){if(count===1){map.setCenter(bounds.getCenter());map.setZoom(15);}else map.fitBounds(bounds,52);}
}
function focusPoi(i){const p=poiData((data.pois||[])[i]||{});if(p.lat==null||p.lng==null){window.open(googleUrl(p),'_blank','noopener,noreferrer');return;}map.setCenter({lat:p.lat,lng:p.lng});map.setZoom(16);const m=poiMarkers[i];if(m){infoWindow.setContent(popup(p));infoWindow.open(map,m);}}
function renderClient(){const home=homeData(),title=data.title||home.name||'Property Spot Map';$('clientTopTitle').textContent=title;$('clientTopRef').textContent=data.client?(lang==='zh'?'客户 / 参考：':'Client / ref: ')+data.client:'';$('clientHomeName').textContent=home.name||(lang==='zh'?'物业':'Property');$('clientHomeAddress').textContent=home.address||'';$('clientIntro').textContent=data.intro||'';$('clientCount').textContent=(data.pois||[]).length+(lang==='zh'?' 个地点':' places');$('langBtn').textContent=lang==='en'?'中文':'EN';const list=$('clientPoiList');list.replaceChildren();if(!(data.pois||[]).length){list.innerHTML='<div class="empty">'+(lang==='zh'?'暂时没有加入附近地点。':'No nearby places added yet.')+'</div>';return;}
  data.pois.map((raw,i)=>({p:poiData(raw),i})).sort((a,b)=>(distance(home,a.p)??999)-(distance(home,b.p)??999)).forEach(({p,i})=>{const cat=categories[p.category]||categories.other,item=document.createElement('div');item.className='clientPoi';item.innerHTML='<div class="poiIcon">'+cat.icon+'</div><div><div class="poiTitle">'+esc(p.name||'Place')+'</div><div class="poiMeta">'+esc(lang==='zh'?cat.zh:cat.en)+(distanceText(p)?' · '+esc(distanceText(p)):'')+'</div>'+(p.note?'<div class="note">'+esc(p.note)+'</div>':'')+'</div><a class="gmaps" target="_blank" rel="noopener" href="'+esc(googleUrl(p))+'">Google Maps ↗</a>';item.onclick=e=>{if(e.target.closest('a'))return;focusPoi(i);};list.appendChild(item);});
}
async function hydrate(){const ids=[data.home&&data.home.googlePlaceId,...(data.pois||[]).map(p=>p.placeId)].filter(Boolean);await Promise.all([...new Set(ids)].map(async id=>{try{const place=new google.maps.places.Place({id});await place.fetchFields({fields:['displayName','formattedAddress','location','primaryTypeDisplayName']});livePlaces.set(id,asPlace(place));}catch(e){console.warn('Place details unavailable',id,e);}}));renderClient();renderMap(true);}
async function initGoogle(){map=new google.maps.Map($('map'),{center:{lat:3.159,lng:101.692},zoom:12,mapTypeControl:false,streetViewControl:false,gestureHandling:'greedy'});infoWindow=new google.maps.InfoWindow();await hydrate();$('mapPlaceholder')?.remove();}
function loadGoogle(){const key=window.PROPERTY_MAP_CONFIG&&window.PROPERTY_MAP_CONFIG.apiKey;if(!key||key==='YOUR_GOOGLE_MAPS_API_KEY'){$('mapPlaceholder').textContent='Google Maps is not configured.';return;}window.propertyMapViewerReady=()=>initGoogle().catch(e=>{$('mapPlaceholder').textContent='Google Maps could not initialize: '+e.message;});const s=document.createElement('script');s.async=true;s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&libraries=places&loading=async&callback=propertyMapViewerReady';s.onerror=()=>{$('mapPlaceholder').textContent='Could not load Google Maps.';};document.head.appendChild(s);}
function jsonpMap(id){return new Promise((resolve,reject)=>{if(!DATA_API){reject(new Error('Map service is not configured.'));return;}const cb='psmview_'+Date.now()+'_'+Math.random().toString(36).slice(2),s=document.createElement('script'),timer=setTimeout(()=>{cleanup();reject(new Error('Property map service timed out.'));},12000);function cleanup(){clearTimeout(timer);delete window[cb];s.remove();}window[cb]=x=>{cleanup();resolve(x);};s.onerror=()=>{cleanup();reject(new Error('Could not reach property map service.'));};s.src=DATA_API+'?id='+encodeURIComponent(id)+'&callback='+encodeURIComponent(cb);document.head.appendChild(s);});}
async function loadPublishedMap(id){if(DATA_API){const result=await jsonpMap(id);if(result&&result.ok&&result.map)return result.map;if(result&&result.error&&result.error!=='Map not found')throw new Error(result.error);}const res=await fetch('maps/'+encodeURIComponent(id)+'.json',{cache:'no-store'});if(!res.ok)throw new Error('Property map not found.');return res.json();}
async function boot(){const id=new URLSearchParams(location.search).get('id');if(!validId(id)){$('mapPlaceholder').textContent='Invalid property map link.';return;}try{data=await loadPublishedMap(id);if(!data||data.id!==id||!data.home||!Array.isArray(data.pois))throw new Error('Property map data is invalid.');renderClient();loadGoogle();}catch(e){$('mapPlaceholder').textContent=e.message;}}
$('langBtn').onclick=()=>{lang=lang==='en'?'zh':'en';if(data)renderClient();};
$('copyLinkBtn').onclick=()=>navigator.clipboard.writeText(location.href).then(()=>{const b=$('copyLinkBtn'),old=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=old,1200);});
boot();
})();