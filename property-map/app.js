(function () {
'use strict';

const categories = {
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
const $ = id => document.getElementById(id);
const emptyState = () => ({version:2,title:'',client:'',home:{name:'',address:'',lat:null,lng:null},intro:'',pois:[]});
let state = emptyState(), lang = 'en', map = null, infoWindow = null, homeMarker = null;
let poiMarkers = [], selectedMarker = null, selectedIndex = -1, results = [], searchRun = 0;
let pinTarget = null, repairIndex = null, readOnly = false;
const livePlaces = new Map(); // Only in memory. Shared links/drafts keep IDs, not Google place data.

function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function status(id,message,kind) { const el=$(id); el.textContent=message||''; el.className='status'+(kind?' '+kind:''); }
function mapsLink(raw) {
  try { const u=new URL(raw); if(u.protocol!=='https:') return '';
    if(u.hostname==='maps.app.goo.gl' || (['www.google.com','google.com','maps.google.com','www.google.com.my','google.com.my'].includes(u.hostname) && (u.pathname.startsWith('/maps') || u.hostname==='maps.google.com'))) return u.href;
  } catch (_) {} return '';
}
function googleUrl(p) {
  const id=p.placeId||p.googlePlaceId;
  if(id) return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.name||'place')+'&query_place_id='+encodeURIComponent(id);
  return mapsLink(p.googleUrl)||'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([p.name,p.address].filter(Boolean).join(' '));
}
function coordsFromMapsUrl(raw) {
  const safe=mapsLink(raw); if(!safe) return null;
  const u=new URL(safe),q=u.searchParams.get('query')||u.searchParams.get('q')||'';
  let m=q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if(!m) m=u.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if(!m) return null;
  const lat=Number(m[1]),lng=Number(m[2]); return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
function validLink(id,statusId) {
  const raw=$(id).value.trim();
  if(raw&&!mapsLink(raw)){status(statusId,'Paste a Google Maps link beginning https://www.google.com/maps/ or https://maps.app.goo.gl/.','warn');return null;}
  return raw;
}
function latLng(place) {
  if(!place || !place.location) return null;
  const loc=place.location, lat=typeof loc.lat==='function'?loc.lat():loc.lat, lng=typeof loc.lng==='function'?loc.lng():loc.lng;
  return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;
}
function asPlace(place) {
  const loc=latLng(place);
  return {placeId:place.id,name:place.displayName||'Unnamed place',address:place.formattedAddress||'',type:place.primaryTypeDisplayName||place.primaryType||'',lat:loc&&loc.lat,lng:loc&&loc.lng};
}
function homeData() { return state.home.googlePlaceId ? (livePlaces.get(state.home.googlePlaceId)||{name:'Loading property…',address:'',lat:null,lng:null}) : state.home; }
function poiData(p) { return p.placeId ? {...(livePlaces.get(p.placeId)||{name:'Loading place…',address:'',lat:null,lng:null}),category:p.category,note:p.note||'',placeId:p.placeId} : p; }
function distance(a,b) {
  if(a.lat==null||a.lng==null||b.lat==null||b.lng==null) return null;
  const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;
  const x=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
  return 12742*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function distanceText(p) { const km=distance(homeData(),p); return km==null?'':(km<1?Math.round(km*1000)+' m':km.toFixed(1)+' km'); }
function portable() {
  const home=state.home.googlePlaceId?{googlePlaceId:state.home.googlePlaceId}:{...state.home};
  return {version:2,title:state.title,client:state.client,home,intro:state.intro,
    pois:state.pois.map(p=>p.placeId?{placeId:p.placeId,category:p.category,note:p.note||''}:{...p})};
}
function saveDraft() { try { localStorage.setItem('propertySpotMapDraft',JSON.stringify(portable())); } catch (_) {} }
function loadDraft() { try { const d=JSON.parse(localStorage.getItem('propertySpotMapDraft')); if(d&&d.home&&Array.isArray(d.pois)) state=d; } catch (_) {} }
function syncFromForm() { state.title=$('mapTitle').value.trim();state.client=$('clientName').value.trim();state.intro=$('intro').value.trim();if(!state.home.googlePlaceId){state.home.name=$('homeName').value.trim();state.home.address=$('homeAddress').value.trim();state.home.googleUrl=mapsLink($('homeGoogleUrl').value.trim());}saveDraft(); }
function syncToForm() { const home=homeData();$('mapTitle').value=state.title||'';$('clientName').value=state.client||'';$('homeName').value=home.name||'';$('homeAddress').value=home.address||'';$('homeGoogleUrl').value=state.home.googleUrl||'';$('intro').value=state.intro||''; }
function fillCategories() { const s=$('poiCategory');Object.keys(categories).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=categories[k].icon+' '+categories[k].en;s.appendChild(o);}); }

function clearMarkers() { if(homeMarker)homeMarker.setMap(null);poiMarkers.forEach(m=>m.setMap(null));homeMarker=null;poiMarkers=[]; }
function roundPinIcon(size,fill,stroke) {
  const c=size/2,r=size/2-2;
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'"><defs><filter id="s" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0f172a" flood-opacity=".28"/></filter></defs><circle cx="'+c+'" cy="'+c+'" r="'+r+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="2" filter="url(#s)"/></svg>';
  return {url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg),scaledSize:new google.maps.Size(size,size),anchor:new google.maps.Point(c,c),labelOrigin:new google.maps.Point(c,c)};
}
function popup(p) { return '<strong>'+esc(p.name||'Place')+'</strong><br>'+esc(p.address||'')+(p.note?'<br>'+esc(p.note):'')+'<br><a target="_blank" rel="noopener" href="'+esc(googleUrl(p))+'">Open in Google Maps ↗</a>'; }
function renderMap(fit) {
  if(!map) return;clearMarkers();const bounds=new google.maps.LatLngBounds();let count=0;
  const home=homeData();if(home.lat!=null&&home.lng!=null){const pos={lat:home.lat,lng:home.lng};homeMarker=new google.maps.Marker({map,position:pos,title:home.name||'Property',icon:roundPinIcon(36,'#111827','#ffffff'),label:{text:'⌂',color:'#ffffff',fontSize:'17px',fontWeight:'800'}});homeMarker.addListener('click',()=>{infoWindow.setContent(popup({...home,googlePlaceId:state.home.googlePlaceId,googleUrl:state.home.googleUrl}));infoWindow.open(map,homeMarker);});bounds.extend(pos);count++;}
  state.pois.forEach((raw,i)=>{const p=poiData(raw);if(p.lat==null||p.lng==null)return;const pos={lat:p.lat,lng:p.lng},cat=categories[p.category]||categories.other;
    const marker=new google.maps.Marker({map,position:pos,title:p.name,icon:roundPinIcon(32,'#ffffff','#ffffff'),label:{text:cat.icon,fontSize:'16px'}});
    marker.addListener('click',()=>{infoWindow.setContent(popup(p));infoWindow.open(map,marker);});poiMarkers[i]=marker;bounds.extend(pos);count++;
  });
  if(fit&&count){if(count===1){map.setCenter(bounds.getCenter());map.setZoom(15);}else map.fitBounds(bounds,52);}
}
function focusPoi(i) {
  const p=poiData(state.pois[i]||{});
  if(p.lat==null||p.lng==null){
    if(readOnly){window.open(googleUrl(p),'_blank','noopener,noreferrer');return;}
    repairIndex=i;$('poiCategory').value=p.category||'other';$('poiName').value=p.name==='Loading place…'?'':p.name;$('poiAddress').value=p.address||'';$('poiGoogleUrl').value=p.googleUrl||'';$('poiNote').value=p.note||'';
    status('poiStatus','Pin unavailable. Select the property on Google Maps or use Pin on map.','warn');document.querySelector('.poiForm').scrollIntoView({behavior:'smooth',block:'nearest'});return;
  }
  map.setCenter({lat:p.lat,lng:p.lng});map.setZoom(16);const marker=poiMarkers[i];if(marker){infoWindow.setContent(popup(p));infoWindow.open(map,marker);} $('map').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderEditorList() {
  const el=$('poiEditList');el.replaceChildren();if(!state.pois.length){el.innerHTML='<div class="empty">No places added yet. Search above to add one.</div>';return;}
  state.pois.forEach((raw,i)=>{const p=poiData(raw),cat=categories[p.category]||categories.other,card=document.createElement('div');card.className='poiEdit';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Show '+p.name+' on map');
    card.innerHTML='<div class="poiIcon">'+cat.icon+'</div><div><div class="poiTitle">'+esc(p.name)+'</div><div class="poiMeta">'+esc(cat.en)+(distanceText(p)?' · '+esc(distanceText(p)):' · Pin pending')+'</div><div class="poiMeta">'+esc(p.address)+'</div>'+(p.note?'<div class="poiMeta">'+esc(p.note)+'</div>':'')+'</div><div class="row"><button type="button" class="btn tiny ghost" data-focus>Map</button><button type="button" class="btn tiny ghost danger" data-delete aria-label="Remove '+esc(p.name)+'">×</button></div>';
    card.onclick=()=>focusPoi(i);card.onkeydown=e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();focusPoi(i);}};
    card.querySelector('[data-focus]').onclick=e=>{e.stopPropagation();focusPoi(i);};card.querySelector('[data-delete]').onclick=e=>{e.stopPropagation();state.pois.splice(i,1);repairIndex=null;saveDraft();renderAll(true);};el.appendChild(card);
  });
}
function renderClient() {
  const home=homeData(),title=state.title||home.name||'Property Spot Map';$('clientTopTitle').textContent=title;$('clientTopRef').textContent=state.client?(lang==='zh'?'客户 / 参考：':'Client / ref: ')+state.client:'';
  $('clientHomeName').textContent=home.name||(lang==='zh'?'物业':'Property');$('clientHomeAddress').textContent=home.address||'';$('clientIntro').textContent=state.intro||'';$('clientCount').textContent=state.pois.length+(lang==='zh'?' 个地点':' places');$('langBtn').textContent=lang==='en'?'中文':'EN';
  const list=$('clientPoiList');list.replaceChildren();if(!state.pois.length){list.innerHTML='<div class="empty">'+(lang==='zh'?'暂时没有加入附近地点。':'No nearby places added yet.')+'</div>';return;}
  state.pois.map((raw,i)=>({p:poiData(raw),i})).sort((a,b)=>(distance(home,a.p)??999)-(distance(home,b.p)??999)).forEach(({p,i})=>{
    const cat=categories[p.category]||categories.other,item=document.createElement('div');item.className='clientPoi';item.innerHTML='<div class="poiIcon">'+cat.icon+'</div><div><div class="poiTitle">'+esc(p.name)+'</div><div class="poiMeta">'+esc(lang==='zh'?cat.zh:cat.en)+(distanceText(p)?' · '+esc(distanceText(p)):'')+'</div>'+(p.note?'<div class="note">'+esc(p.note)+'</div>':'')+'</div><a class="gmaps" target="_blank" rel="noopener" href="'+esc(googleUrl(p))+'">Google Maps ↗</a>';
    item.onclick=e=>{if(e.target.closest('a'))return;focusPoi(i);};list.appendChild(item);
  });
}
function renderAll(fit) { syncToForm();renderEditorList();renderClient();renderMap(fit); }

async function hydratePlaces() {
  if(!map)return;const ids=[state.home.googlePlaceId,...state.pois.map(p=>p.placeId)].filter(Boolean);
  await Promise.all([...new Set(ids)].map(async id=>{
    try {const place=new google.maps.places.Place({id});await place.fetchFields({fields:['displayName','formattedAddress','location','primaryTypeDisplayName']});livePlaces.set(id,asPlace(place));}
    catch(e){console.warn('Place details unavailable for',id,e);}
  }));renderAll(true);
  if(state.home.googlePlaceId&&!livePlaces.has(state.home.googlePlaceId))status('homeStatus','Property details could not be loaded. Select the property again.','warn');
}
function onHomeChanged() { if(state.home.googlePlaceId){const current=homeData();state.home={name:current.name||'',address:current.address||'',lat:null,lng:null};}else{state.home.lat=null;state.home.lng=null;}syncFromForm();renderClient();renderMap(false);status('homeStatus','Select a Google address suggestion or press Set / find property.','warn'); }
function setHomeFromPlace(place) {
  const p=asPlace(place);if(p.lat==null)throw new Error('This place has no map location.');
  livePlaces.set(p.placeId,p);state.home={googlePlaceId:p.placeId,name:p.name,address:p.address,lat:p.lat,lng:p.lng};saveDraft();renderAll(true);status('homeStatus','Property pinned from Google Places.','ok');
}
async function setHome() {
  const link=validLink('homeGoogleUrl','homeStatus');if(link===null)return;syncFromForm();const q=[state.home.name,state.home.address].filter(Boolean).join(' ').trim(),coords=coordsFromMapsUrl(link);
  if(coords){state.home={name:state.home.name||'Property',address:state.home.address||'',googleUrl:link,...coords};saveDraft();renderAll(true);status('homeStatus','Property pinned.','ok');return;}
  if(!q){status('homeStatus','Select an address suggestion or enter the property name/address.','warn');return;}
  const btn=$('setHomeBtn');btn.disabled=true;status('homeStatus','Finding property in Google Places…');
  try {const {places}=await google.maps.places.Place.searchByText({textQuery:q,fields:['id','displayName','formattedAddress','location'],locationBias:{center:{lat:3.16,lng:101.69},radius:30000},region:'my',maxResultCount:1});
    if(!places.length)throw new Error('Property not found. Try a fuller address.');setHomeFromPlace(places[0]);}
  catch(e){status('homeStatus',e.message+' You can use Pin on map.','warn');}finally{btn.disabled=false;}
}
function poiFromForm() {return {category:$('poiCategory').value,name:$('poiName').value.trim(),address:$('poiAddress').value.trim(),googleUrl:mapsLink($('poiGoogleUrl').value.trim()),note:$('poiNote').value.trim(),lat:null,lng:null};}
function clearPoi() {repairIndex=null;['poiName','poiAddress','poiGoogleUrl','poiNote'].forEach(id=>$(id).value='');status('poiStatus','');}
function commitPoi(p) {
  if(repairIndex!=null&&state.pois[repairIndex]&&state.pois[repairIndex].name===p.name)state.pois[repairIndex]=p;else state.pois.push(p);
  clearPoi();saveDraft();renderAll(true);status('poiStatus','Added to map.','ok');
}
async function addPoi() {
  const link=validLink('poiGoogleUrl','poiStatus');if(link===null)return;syncFromForm();const p=poiFromForm(),coords=coordsFromMapsUrl(link);
  if(!p.name&&!p.address){status('poiStatus','Enter a place name or use Find places above.','warn');return;}
  if(coords){Object.assign(p,coords);commitPoi(p);return;}
  const btn=$('addPoiBtn');btn.disabled=true;status('poiStatus','Finding place in Google Places…');
  try {const home=homeData(),request={textQuery:[p.name,p.address].filter(Boolean).join(' '),fields:['id','displayName','formattedAddress','location','primaryTypeDisplayName'],region:'my',maxResultCount:1};
    if(home.lat!=null)request.locationBias={center:{lat:home.lat,lng:home.lng},radius:25000};
    const {places}=await google.maps.places.Place.searchByText(request);if(!places.length)throw new Error('Place not found.');const found=asPlace(places[0]);livePlaces.set(found.placeId,found);commitPoi({placeId:found.placeId,category:p.category,note:p.note});}
  catch(e){status('poiStatus',e.message+' Try the search list or Pin on map.','warn');}finally{btn.disabled=false;}
}
function showSelection(i) {
  selectedIndex=i;renderSearchResults();if(!map)return;const p=results[i];if(selectedMarker){selectedMarker.setMap(null);selectedMarker=null;}if(!p||p.lat==null)return;
  selectedMarker=new google.maps.Marker({map,position:{lat:p.lat,lng:p.lng},title:p.name,animation:google.maps.Animation.DROP,icon:{path:google.maps.SymbolPath.CIRCLE,scale:11,fillColor:'#2563eb',fillOpacity:1,strokeColor:'#fff',strokeWeight:3}});
  map.panTo({lat:p.lat,lng:p.lng});map.setZoom(15);
}
function renderSearchResults() {
  const el=$('placeSearchResults');el.replaceChildren();results.forEach((p,i)=>{
    const item=document.createElement('div');item.className='searchResult'+(i===selectedIndex?' selected':'');item.tabIndex=0;item.setAttribute('role','button');item.setAttribute('aria-label','Select '+p.name);
    const already=state.pois.some(x=>x.placeId===p.placeId);
    item.innerHTML='<div><div class="poiTitle">'+esc(p.name)+'</div><div class="poiMeta">'+esc(p.type||'Place')+'</div><div class="poiMeta">'+esc(p.address)+'</div>'+(distanceText(p)?'<div class="poiMeta">'+esc(distanceText(p))+' straight line</div>':'')+'</div><button class="btn tiny primary" type="button"'+(already?' disabled':'')+'>'+(already?'Added':'Add')+'</button>';
    item.onclick=()=>showSelection(i);item.onkeydown=e=>{if(e.target===item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();showSelection(i);}};
    item.querySelector('button').onclick=e=>{e.stopPropagation();addSearchResult(i);};el.appendChild(item);
  });
}
async function findPlaces() {
  const q=$('placeSearchInput').value.trim();if(!q){status('placeSearchStatus','Enter a place or business name.','warn');return;}
  const home=homeData();if(home.lat==null){status('placeSearchStatus','Set the main property first so results are near it.','warn');return;}
  const run=++searchRun,btn=$('findPlacesBtn');btn.disabled=true;results=[];selectedIndex=-1;renderSearchResults();if(selectedMarker){selectedMarker.setMap(null);selectedMarker=null;}status('placeSearchStatus','Searching Google Places near the property…');
  try {const {places}=await google.maps.places.Place.searchByText({textQuery:q,fields:['id','displayName','formattedAddress','location','primaryTypeDisplayName'],locationBias:{center:{lat:home.lat,lng:home.lng},radius:20000},region:'my',maxResultCount:15});
    if(run!==searchRun)return;results=places.map(asPlace).filter(p=>p.placeId&&p.lat!=null).sort((a,b)=>(distance(home,a)??999)-(distance(home,b)??999));renderSearchResults();status('placeSearchStatus',results.length?results.length+' Google places found. Click one to inspect, then Add.':'No results. Try a more specific place name.',results.length?'ok':'warn');}
  catch(e){if(run===searchRun)status('placeSearchStatus','Google Places search failed: '+e.message,'warn');}finally{if(run===searchRun)btn.disabled=false;}
}
function addSearchResult(i) {
  const p=results[i];if(!p||state.pois.some(x=>x.placeId===p.placeId))return;
  livePlaces.set(p.placeId,p);repairIndex=null;state.pois.push({placeId:p.placeId,category:$('poiCategory').value,note:''});saveDraft();renderAll(true);renderSearchResults();showSelection(i);status('placeSearchStatus','Added '+p.name+'.','ok');
}
function startPin(target) {
  if(!map)return;const link=validLink(target==='home'?'homeGoogleUrl':'poiGoogleUrl',target==='home'?'homeStatus':'poiStatus');if(link===null)return;
  if(target==='poi'&&!$('poiName').value.trim()){status('poiStatus','Enter a place name first.','warn');return;}
  pinTarget=target;$('map').classList.add('picking');status(target==='home'?'homeStatus':'poiStatus','Click the exact spot on the Google map.','ok');$('map').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function pinAt(point) {
  if(!pinTarget)return;const target=pinTarget;pinTarget=null;$('map').classList.remove('picking');syncFromForm();
  if(target==='home'){state.home={name:$('homeName').value.trim()||'Property',address:$('homeAddress').value.trim(),googleUrl:mapsLink($('homeGoogleUrl').value.trim()),lat:point.lat(),lng:point.lng()};saveDraft();renderAll(true);status('homeStatus','Property pinned.','ok');}
  else {const p=poiFromForm();p.lat=point.lat();p.lng=point.lng();commitPoi(p);}
}

function encodeState() {syncFromForm();return btoa(Array.from(new TextEncoder().encode(JSON.stringify(portable())),b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decodeState(s) {const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(b,c=>c.charCodeAt(0))));if(!data||!data.home||!Array.isArray(data.pois))throw new Error('Invalid map');return data;}
function links() {const base=location.origin+location.pathname,hash=encodeState();return {client:base+'#'+hash,edit:base+'?edit=1#'+hash};}
function share() {if(homeData().lat==null){status('homeStatus','Set the main property first.','warn');return;}const u=links();$('clientUrlBox').textContent=u.client;$('editUrlBox').textContent=u.edit;$('shareModal').classList.add('open');}
function copy(text) {if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text);const input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();return Promise.resolve();}
function downloadJson() {syncFromForm();const blob=new Blob([JSON.stringify(portable(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=((homeData().name||'property-map').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'property-map')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function importJson(file) {const reader=new FileReader();reader.onload=async()=>{try{const d=JSON.parse(reader.result);if(!d.home||!Array.isArray(d.pois))throw new Error();state=d;livePlaces.clear();saveDraft();renderAll(true);await hydratePlaces();status('homeStatus','Map imported.','ok');}catch(e){status('homeStatus','Invalid map JSON.','warn');}};reader.readAsText(file);}
function newMap() {if(!confirm('Start a new map? Your current draft will be cleared from this browser.'))return;state=emptyState();livePlaces.clear();pinTarget=null;repairIndex=null;results=[];selectedIndex=-1;if(selectedMarker){selectedMarker.setMap(null);selectedMarker=null;}renderSearchResults();$('placeSearchInput').value='';status('placeSearchStatus','');localStorage.removeItem('propertySpotMapDraft');history.replaceState(null,'',location.pathname+'?edit=1');renderAll(false);if(map){map.setCenter({lat:3.159, lng:101.692});map.setZoom(12);}}
async function loadDemo() {
  state={version:2,title:'Impian Villas — 买菜 & Daily Convenience',client:'China family',home:{name:'Impian Villas',address:'Jalan Kiara 3, Mont Kiara, Kuala Lumpur',lat:null,lng:null},intro:'For daily cooking and groceries, there are both convenient supermarkets and traditional fresh markets within a short drive. 点击地点可在地图查看，Google Maps 按钮可直接导航。',pois:[]};renderAll(false);
  const items=[['market','Kepong Baru Morning Market','Traditional wet market / 早市 — fresh produce.'],['market','ShunYuan Fresh Market','Fresh produce for everyday cooking.'],['grocery','Jaya Grocer 163 Retail Park','Convenient Mont Kiara supermarket.'],['market','Pasar Besar TTDI','Traditional wet market with vegetables, fish and meat.'],['chinese','Wishmart Chinese Supermarket Bandar Menjalara','China-brand groceries and familiar ingredients.']];
  try {status('homeStatus','Finding Impian Villas…');const home=await google.maps.places.Place.searchByText({textQuery:'Impian Villas Jalan Kiara 3 Mont Kiara',fields:['id','displayName','formattedAddress','location'],region:'my',maxResultCount:1});if(!home.places.length)throw new Error('Impian Villas not found');setHomeFromPlace(home.places[0]);
    for(const [cat,q,note] of items){status('homeStatus','Finding '+q+'…');try{const found=await google.maps.places.Place.searchByText({textQuery:q,fields:['id','displayName','formattedAddress','location','primaryTypeDisplayName'],locationBias:{center:{lat:homeData().lat,lng:homeData().lng},radius:25000},region:'my',maxResultCount:1});if(found.places.length){const p=asPlace(found.places[0]);livePlaces.set(p.placeId,p);state.pois.push({placeId:p.placeId,category:cat,note});}}catch(e){console.warn(q,e);}}
    saveDraft();renderAll(true);status('homeStatus','Demo loaded. Please check each Google result before sharing.','ok');}
  catch(e){status('homeStatus','Demo could not load: '+e.message,'warn');}
}
function openGoogle(name,address) {const q=[name,address].filter(Boolean).join(' ');if(q)window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q),'_blank','noopener,noreferrer');}

function bindUi() {
  $('setHomeBtn').onclick=setHome;$('addPoiBtn').onclick=addPoi;$('clearPoiBtn').onclick=clearPoi;$('shareBtn').onclick=share;$('exportBtn').onclick=downloadJson;$('newBtn').onclick=newMap;$('demoBtn').onclick=loadDemo;
  $('findPlacesBtn').onclick=findPlaces;$('placeSearchInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();findPlaces();}};
  $('searchHomeBtn').onclick=()=>openGoogle($('homeName').value.trim(),$('homeAddress').value.trim());
  $('searchPoiBtn').onclick=()=>openGoogle($('poiName').value.trim()||$('placeSearchInput').value.trim(),$('poiAddress').value.trim()||homeData().address||'Kuala Lumpur');
  $('pickHomeBtn').onclick=()=>startPin('home');$('pickPoiBtn').onclick=()=>startPin('poi');
  ['mapTitle','clientName','intro'].forEach(id=>$(id).addEventListener('input',()=>{syncFromForm();renderClient();}));
  ['homeName','homeAddress'].forEach(id=>$(id).addEventListener('input',onHomeChanged));
  $('homeGoogleUrl').onchange=()=>{if(validLink('homeGoogleUrl','homeStatus')!==null)syncFromForm();};
  $('importFile').onchange=function(){if(this.files&&this.files[0])importJson(this.files[0]);this.value='';};
  $('closeShareBtn').onclick=()=>$('shareModal').classList.remove('open');$('shareModal').onclick=e=>{if(e.target===$('shareModal'))$('shareModal').classList.remove('open');};
  document.querySelectorAll('[data-copy]').forEach(btn=>btn.onclick=()=>copy(links()[btn.dataset.copy]).then(()=>{const old=btn.textContent;btn.textContent='Copied';setTimeout(()=>btn.textContent=old,1200);}));
  document.querySelectorAll('[data-open]').forEach(btn=>btn.onclick=()=>window.open(links()[btn.dataset.open],'_blank','noopener'));
  $('copyClientUrlBtn').onclick=()=>copy(location.href).then(()=>{const btn=$('copyClientUrlBtn'),old=btn.textContent;btn.textContent=lang==='zh'?'已复制':'Copied';setTimeout(()=>btn.textContent=old,1200);});
  $('langBtn').onclick=()=>{lang=lang==='en'?'zh':'en';renderClient();};
}
async function initGoogle() {
  map=new google.maps.Map($('map'),{center:{lat:3.159,lng:101.692},zoom:12,mapTypeControl:false,streetViewControl:false,gestureHandling:'greedy'});
  infoWindow=new google.maps.InfoWindow();map.addListener('click',e=>{if(!readOnly)pinAt(e.latLng);});
  const {PlaceAutocompleteElement}=await google.maps.importLibrary('places');
  const autocomplete=new PlaceAutocompleteElement();autocomplete.placeholder='Search a property or address in Malaysia';autocomplete.includedRegionCodes=['my'];$('homeAutocomplete').appendChild(autocomplete);
  autocomplete.addEventListener('gmp-select',async e=>{try{const place=e.placePrediction.toPlace();await place.fetchFields({fields:['displayName','formattedAddress','location']});setHomeFromPlace(place);}catch(error){status('homeStatus','Address selection failed: '+error.message,'warn');}});
  await hydratePlaces();renderAll(true);$('mapPlaceholder')?.remove();
}
function loadGoogle() {
  const key=window.PROPERTY_MAP_CONFIG&&window.PROPERTY_MAP_CONFIG.apiKey;
  if(!key||key==='YOUR_GOOGLE_MAPS_API_KEY'){$('mapPlaceholder').textContent='Google Maps setup needed: add the restricted browser API key in property-map/config.js.';status('homeStatus','Set the Google Maps API key in config.js to enable maps and place search.','warn');return;}
  window.propertyMapReady=()=>{initGoogle().catch(e=>{console.error(e);$('mapPlaceholder').textContent='Google Maps could not initialize: '+e.message;status('homeStatus',e.message,'warn');});};
  window.gm_authFailure=()=>{$('mapPlaceholder').textContent='Google Maps rejected the API key. Check website and API restrictions.';status('homeStatus','Check the API key website restriction and enabled APIs.','warn');};
  const script=document.createElement('script');script.async=true;script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&libraries=places&loading=async&callback=propertyMapReady';script.onerror=()=>{$('mapPlaceholder').textContent='Could not load Google Maps. Check the API key and connection.';};document.head.appendChild(script);
}
function boot() {
  fillCategories();if(location.hash.length>1){try{state=decodeState(location.hash.slice(1));}catch(e){loadDraft();}}else loadDraft();
  readOnly=location.hash.length>1&&new URLSearchParams(location.search).get('edit')!=='1';if(readOnly){$('app').classList.add('readOnly');$('modeLabel').textContent='Client view';}
  else $('modeLabel').textContent='Agent builder';bindUi();renderAll(false);loadGoogle();
}
boot();
})();
