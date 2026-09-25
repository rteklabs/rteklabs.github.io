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
const emptyState = () => ({version:3,title:'',client:'',home:{name:'',address:'',lat:null,lng:null},intro:'',pois:[],customCategories:{}});
let state = emptyState(), lang = 'en', map = null, infoWindow = null, homeMarker = null;
let poiMarkers = [], selectedMarker = null, selectedIndex = -1, results = [], searchRun = 0;
let pinTarget = null, repairIndex = null, readOnly = false, currentMapId = null;
const livePlaces = new Map(); // Only in memory. Shared links/drafts keep IDs, not Google place data.
const DATA_API = window.PROPERTY_MAP_DATA_API || '';
const CUSTOM_CATEGORY_KEY='propertySpotMapCustomCategories';
const emojiChoices=['✈️','🛫','💼','🏢','🏭','🍸','🍺','🍻','☕','🍽️','🥐','🏪','⛽','🚗','🅿️','🚕','🚌','🚇','🚆','🏫','🎓','🧸','🏥','🩺','💊','🦷','🏦','💳','🏬','🛍️','🌳','🛝','🏋️','🏊','⚽','🏀','🎾','⛳','🎬','🍿','🏨','📸','📍','🕌','⛪','🛕','🥕','🥩','🐟','🐾','💇','🧺','🔧','🏛️','🛂','📦','🚚','👶','🌊','🏖️','🥾','⭐'];
const categoryZhSuggestions={
  'airport':'机场','international airport':'国际机场','domestic airport':'国内机场',
  'workplace':'工作地点','work place':'工作地点','office':'办公室','office building':'办公楼','business district':'商业区',
  'factory':'工厂','industrial':'工业区','industrial area':'工业区','warehouse':'仓库',
  'bar':'酒吧','pub':'酒吧','bar / pub':'酒吧 / 酒馆','bar and pub':'酒吧 / 酒馆','nightlife':'夜生活',
  'cafe':'咖啡馆','coffee shop':'咖啡馆','restaurant':'餐厅','chinese restaurant':'中餐厅','food court':'美食广场',
  'bakery':'面包店','convenience store':'便利店','supermarket':'超市','grocery':'杂货店','grocery store':'杂货店',
  'wet market':'菜市场','fresh market':'鲜货市场','wet / fresh market':'菜市场 / 鲜货市场','chinese grocery':'中国超市',
  'petrol station':'加油站','gas station':'加油站','ev charging':'电动车充电站','car wash':'洗车店',
  'parking':'停车场','taxi':'出租车','grab':'网约车','bus stop':'巴士站','bus station':'巴士总站',
  'lrt':'轻快铁','mrt':'捷运','lrt / mrt':'轻快铁 / 捷运','train station':'火车站','transport':'交通',
  'school':'学校','university':'大学','college':'学院','kindergarten':'幼儿园','childcare':'托儿所',
  'hospital':'医院','clinic':'诊所','pharmacy':'药房','dentist':'牙医诊所','medical':'医疗',
  'shopping mall':'购物中心','mall':'购物中心','shopping':'购物','retail':'零售',
  'bank':'银行','atm':'自动提款机','post office':'邮局','courier':'快递','parcel':'包裹服务',
  'police station':'警察局','fire station':'消防局','government office':'政府部门','embassy':'大使馆','immigration':'移民局',
  'park':'公园','playground':'游乐场','gym':'健身房','swimming pool':'游泳池','sports':'运动',
  'golf':'高尔夫','golf club':'高尔夫俱乐部','cinema':'电影院','movie theatre':'电影院','entertainment':'娱乐',
  'hotel':'酒店','homestay':'民宿','airbnb':'民宿','tourist attraction':'旅游景点','landmark':'地标',
  'mosque':'清真寺','church':'教堂','temple':'寺庙',
  'organic grocery':'有机食品店','butcher':'肉店','seafood market':'海鲜市场',
  'pet shop':'宠物店','veterinary':'兽医诊所','vet':'兽医诊所','salon':'美发店','laundry':'洗衣店',
  'automotive':'汽车服务','car workshop':'汽车维修店','mechanic':'汽车维修店',
  'beach':'海滩','hiking':'徒步','nature':'自然景点','other':'其他'
};
let customZhAutoValue='';
let customCategoryLibrary=readCustomCategoryLibrary();
let selectedCustomEmoji='✈️';

function readCustomCategoryLibrary(){
  try{
    const value=JSON.parse(localStorage.getItem(CUSTOM_CATEGORY_KEY)||'{}');
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch(_){return {};}
}
function writeCustomCategoryLibrary(){
  try{localStorage.setItem(CUSTOM_CATEGORY_KEY,JSON.stringify(customCategoryLibrary));}catch(_){}
}
function normalizeCategoryDef(def){
  if(!def||typeof def!=='object')return null;
  const en=String(def.en||'').trim(),zh=String(def.zh||'').trim(),icon=String(def.icon||'📍').trim()||'📍';
  return en?{en,zh:zh||en,icon}:null;
}
function syncCustomCategoriesFromState(){
  if(!state.customCategories||typeof state.customCategories!=='object'||Array.isArray(state.customCategories))state.customCategories={};
  Object.entries(state.customCategories).forEach(([key,def])=>{
    const clean=normalizeCategoryDef(def);
    if(clean&&key.startsWith('custom_'))customCategoryLibrary[key]=clean;
  });
  writeCustomCategoryLibrary();
}
function categoryMeta(key){
  return categories[key]||(state.customCategories&&state.customCategories[key])||customCategoryLibrary[key]||categories.other;
}
function rememberCategoryForMap(key){
  if(categories[key])return;
  const def=normalizeCategoryDef(customCategoryLibrary[key]||(state.customCategories&&state.customCategories[key]));
  if(!def)return;
  if(!state.customCategories||typeof state.customCategories!=='object')state.customCategories={};
  state.customCategories[key]=def;
}
function makeCustomCategoryKey(){
  const bytes=new Uint8Array(5);crypto.getRandomValues(bytes);
  return 'custom_'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function fillCategories(selected){
  const s=$('poiCategory');if(!s)return;
  const wanted=selected||s.value||'market';
  s.replaceChildren();
  Object.entries(categories).forEach(([k,cat])=>{
    const o=document.createElement('option');o.value=k;o.textContent=cat.icon+' '+cat.en;s.appendChild(o);
  });
  const merged={...(state.customCategories||{}),...customCategoryLibrary};
  Object.entries(merged)
    .map(([k,v])=>[k,normalizeCategoryDef(v)])
    .filter(([,v])=>v)
    .sort((a,b)=>a[1].en.localeCompare(b[1].en))
    .forEach(([k,cat])=>{const o=document.createElement('option');o.value=k;o.textContent=cat.icon+' '+cat.en;s.appendChild(o);});
  s.value=[...s.options].some(o=>o.value===wanted)?wanted:'market';
}
function normalizeCategoryName(value){
  return String(value||'').trim().toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[–—]/g,'-')
    .replace(/\s+/g,' ');
}
function suggestCategoryChinese(value){
  const key=normalizeCategoryName(value);
  if(!key)return '';
  return categoryZhSuggestions[key]||'';
}
function updateCategoryChineseSuggestion(){
  const en=$('customCategoryEn'),zh=$('customCategoryZh');
  if(!en||!zh)return;
  const suggestion=suggestCategoryChinese(en.value);
  const canReplace=!zh.value.trim()||zh.value===customZhAutoValue;
  if(!canReplace)return;
  zh.value=suggestion;
  customZhAutoValue=suggestion;
}
function renderEmojiPicker(){
  const host=$('emojiPicker');if(!host)return;
  host.replaceChildren();
  emojiChoices.forEach(icon=>{
    const b=document.createElement('button');
    b.type='button';b.className='emojiChoice'+(icon===selectedCustomEmoji?' selected':'');
    b.textContent=icon;b.setAttribute('role','option');b.setAttribute('aria-selected',icon===selectedCustomEmoji?'true':'false');
    b.onclick=()=>{selectedCustomEmoji=icon;$('selectedEmoji').textContent=icon;renderEmojiPicker();};
    host.appendChild(b);
  });
}
function openCategoryModal(){
  selectedCustomEmoji='✈️';customZhAutoValue='';
  $('selectedEmoji').textContent=selectedCustomEmoji;
  $('customCategoryEn').value='';$('customCategoryZh').value='';status('categoryStatus','');
  renderEmojiPicker();
  $('categoryModal').classList.add('open');$('categoryModal').setAttribute('aria-hidden','false');
  setTimeout(()=>$('customCategoryEn').focus(),0);
}
function closeCategoryModal(){
  $('categoryModal').classList.remove('open');$('categoryModal').setAttribute('aria-hidden','true');
}
function saveCustomCategory(){
  const en=$('customCategoryEn').value.trim(),zh=$('customCategoryZh').value.trim();
  if(!en){status('categoryStatus','Enter a category name.','warn');$('customCategoryEn').focus();return;}
  const duplicate=Object.entries({...categories,...customCategoryLibrary}).find(([,def])=>String(def.en||'').toLowerCase()===en.toLowerCase());
  if(duplicate){fillCategories(duplicate[0]);closeCategoryModal();return;}
  const key=makeCustomCategoryKey(),def={en,zh:zh||en,icon:selectedCustomEmoji};
  customCategoryLibrary[key]=def;writeCustomCategoryLibrary();
  if(!state.customCategories||typeof state.customCategories!=='object')state.customCategories={};
  state.customCategories[key]=def;
  fillCategories(key);saveDraft();closeCategoryModal();
}
const placeholderExamples = [
  {
    title:'e.g. Nadi Bangsar — Daily Convenience',
    client:'e.g. Ms Lim',
    property:'Nadi Bangsar',
    address:'Jalan Tandok, Bangsar, Kuala Lumpur',
    search:'e.g. Bangsar Village',
    poi:'Bangsar Village',
    poiAddress:'Jalan Telawi 1, Bangsar Baru, Kuala Lumpur',
    note:'Convenient for groceries, dining and daily essentials nearby.'
  },
  {
    title:'e.g. The Westside One — Family Essentials',
    client:'e.g. Mr Tan',
    property:'The Westside One',
    address:'Desa ParkCity, Kuala Lumpur',
    search:'e.g. Plaza Arkadia',
    poi:'Plaza Arkadia',
    poiAddress:'Desa ParkCity, Kuala Lumpur',
    note:'Useful for groceries, cafes and family-friendly amenities.'
  },
  {
    title:'e.g. The Troika — City Living',
    client:'e.g. Mr Chen',
    property:'The Troika',
    address:'Persiaran KLCC, Kuala Lumpur',
    search:'e.g. Suria KLCC',
    poi:'Suria KLCC',
    poiAddress:'Kuala Lumpur City Centre, Kuala Lumpur',
    note:'Nearby shopping, dining and everyday conveniences.'
  },
  {
    title:'e.g. The Park Sky Residence — Nearby Essentials',
    client:'e.g. Mr Wong',
    property:'The Park Sky Residence',
    address:'Bukit Jalil, Kuala Lumpur',
    search:'e.g. Pavilion Bukit Jalil',
    poi:'Pavilion Bukit Jalil',
    poiAddress:'Persiaran Jalil 8, Bukit Jalil, Kuala Lumpur',
    note:'Convenient access to shopping, groceries and restaurants.'
  },
  {
    title:'e.g. Tropicana Grande — Lifestyle Nearby',
    client:'e.g. Ms Ng',
    property:'Tropicana Grande',
    address:'Tropicana, Petaling Jaya, Selangor',
    search:'e.g. Tropicana Gardens Mall',
    poi:'Tropicana Gardens Mall',
    poiAddress:'Persiaran Surian, Kota Damansara, Selangor',
    note:'Good access to retail, groceries, dining and transport.'
  }
];
const placeholderExample = placeholderExamples[Math.floor(Math.random()*placeholderExamples.length)];

function applyRandomPlaceholders(){
  const values={
    mapTitle:placeholderExample.title,
    clientName:placeholderExample.client,
    homeName:placeholderExample.property,
    homeAddress:placeholderExample.address,
    placeSearchInput:placeholderExample.search,
    poiName:placeholderExample.poi,
    poiAddress:placeholderExample.poiAddress,
    poiNote:placeholderExample.note
  };
  Object.entries(values).forEach(([id,value])=>{const el=$(id);if(el)el.placeholder=value;});
}

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
  const usedCustom={};
  state.pois.forEach(p=>{
    if(categories[p.category])return;
    const def=normalizeCategoryDef((state.customCategories&&state.customCategories[p.category])||customCategoryLibrary[p.category]);
    if(def)usedCustom[p.category]=def;
  });
  return {version:3,title:state.title,client:state.client,home,intro:state.intro,customCategories:usedCustom,
    pois:state.pois.map(p=>p.placeId?{placeId:p.placeId,category:p.category,note:p.note||''}:{...p})};
}
function saveDraft() { try { localStorage.setItem('propertySpotMapDraft',JSON.stringify(portable())); } catch (_) {} }
function loadDraft() { try { const d=JSON.parse(localStorage.getItem('propertySpotMapDraft')); if(d&&d.home&&Array.isArray(d.pois)) state=d; } catch (_) {} }
function savedMaps() { try { const x=JSON.parse(localStorage.getItem('propertySpotMapLibrary')||'[]'); return Array.isArray(x)?x:[]; } catch (_) { return []; } }
function loadSavedMap(id) {
  const record=savedMaps().find(x=>x&&x.id===id);
  if(!record||!record.data||!record.data.home||!Array.isArray(record.data.pois)) return false;
  state=record.data;currentMapId=id;return true;
}
async function loadPublishedMapForEdit(id) {
  if(!/^psm_[A-Z2-9]{8}$/.test(id||'')) throw new Error('Invalid map ID.');
  if(!DATA_API) throw new Error('Publishing service is not configured.');
  const result=await jsonp({id});
  if(!result||!result.ok||!result.map) throw new Error(result&&result.error?result.error:'Published map could not be loaded.');
  if(!result.map.home||!Array.isArray(result.map.pois)) throw new Error('Published map data is invalid.');
  state=result.map;
  currentMapId=id;
  saveDraft();
  return true;
}
function makeMapId(existing) {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const used=new Set((existing||[]).map(x=>x&&x.id).filter(Boolean));
  for(let attempt=0;attempt<20;attempt++){
    const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);
    let id='psm_';for(const b of bytes)id+=alphabet[b%alphabet.length];
    if(!used.has(id))return id;
  }
  throw new Error('Could not create a unique map ID.');
}
function jsonp(params) {
  return new Promise((resolve,reject)=>{
    if(!DATA_API){reject(new Error('Publishing service is not configured.'));return;}
    const cb='psmcb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const timer=setTimeout(()=>{cleanup();reject(new Error('Publishing service timed out.'));},12000);
    const script=document.createElement('script');
    function cleanup(){clearTimeout(timer);delete window[cb];script.remove();}
    window[cb]=value=>{cleanup();resolve(value);};
    script.onerror=()=>{cleanup();reject(new Error('Could not reach publishing service.'));};
    const q=new URLSearchParams({...params,callback:cb});
    script.src=DATA_API+'?'+q.toString();document.head.appendChild(script);
  });
}
function adminWriteKey() {
  let key=localStorage.getItem('propertySpotMapWriteKey')||'';
  if(key)return key;
  key=prompt('Enter your Property Spot Map WRITE_KEY. It will be stored only in this browser.')||'';
  key=key.trim();if(key)localStorage.setItem('propertySpotMapWriteKey',key);
  return key;
}
async function publishMap(record) {
  if(!DATA_API) throw new Error('Publishing service is not configured.');
  const key=adminWriteKey();if(!key)throw new Error('WRITE_KEY is required to publish.');
  const payload={action:'save',key,map:record.data};
  // no-cors keeps the write key out of the URL. Apps Script receives the JSON body.
  await fetch(DATA_API,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
  // Because the POST response is opaque cross-origin, verify the save through the public JSONP reader.
  let last=null;
  for(let i=0;i<6;i++){
    await new Promise(r=>setTimeout(r,i?700:350));
    last=await jsonp({id:record.id});
    if(last&&last.ok&&last.map&&last.map.id===record.id&&last.map.publishedAt===record.data.publishedAt)return last.map;
  }
  throw new Error(last&&last.error?last.error:'The map could not be verified after publishing.');
}
async function saveToDashboard() {
  syncFromForm();
  const home=homeData();
  if(!state.title){status('homeStatus','Map title is required before publishing.','warn');$('mapTitle').focus();return;}
  if(home.lat==null||home.lng==null){status('homeStatus','Choose the main property from Google suggestions, find it from details, or pin it manually before publishing.','warn');return;}
  const list=savedMaps(),now=new Date().toISOString();
  if(!currentMapId) currentMapId=makeMapId(list);
  const existing=list.find(x=>x.id===currentMapId);
  const publishedData={...portable(),id:currentMapId,version:3,publishedAt:now};
  const record={
    id:currentMapId,
    title:state.title||home.name||'Untitled map',
    client:state.client||'',
    homeName:home.name||'',
    homeAddress:home.address||'',
    poiCount:state.pois.length,
    createdAt:existing&&existing.createdAt?existing.createdAt:now,
    updatedAt:now,
    publishedAt:now,
    data:publishedData
  };
  const btn=$('saveDashboardBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='Publishing…';
  try {
    await publishMap(record);
    const i=list.findIndex(x=>x.id===currentMapId);
    if(i>=0) list[i]=record; else list.unshift(record);
    localStorage.setItem('propertySpotMapLibrary',JSON.stringify(list));
    localStorage.removeItem('propertySpotMapDraft');
    location.href='dashboard.html';
  } catch (e) {
    if(/Unauthorized/i.test(e.message||'')) localStorage.removeItem('propertySpotMapWriteKey');
    status('homeStatus','Publish failed: '+e.message,'warn');
    btn.disabled=false;btn.textContent=old;
  }
}
function syncFromForm() { state.title=$('mapTitle').value.trim();state.client=$('clientName').value.trim();state.intro=$('intro').value.trim();if(!state.home.googlePlaceId){state.home.name=$('homeName').value.trim();state.home.address=$('homeAddress').value.trim();state.home.googleUrl=mapsLink($('homeGoogleUrl').value.trim());}saveDraft(); }
function syncToForm() { const home=homeData();$('mapTitle').value=state.title||'';$('clientName').value=state.client||'';$('homeName').value=home.name||'';$('homeAddress').value=home.address||'';$('homeGoogleUrl').value=state.home.googleUrl||'';$('intro').value=state.intro||''; }

function clearMarkers() { if(homeMarker)homeMarker.setMap(null);poiMarkers.forEach(m=>m.setMap(null));homeMarker=null;poiMarkers=[]; }
function roundPinIcon(size,fill,stroke) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: size/2,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: stroke,
    strokeWeight: 2
  };
}
function popup(p) { return '<strong>'+esc(p.name||'Place')+'</strong><br>'+esc(p.address||'')+(p.note?'<br>'+esc(p.note):'')+'<br><a target="_blank" rel="noopener" href="'+esc(googleUrl(p))+'">Open in Google Maps ↗</a>'; }
function renderMap(fit) {
  if(!map) return;clearMarkers();const bounds=new google.maps.LatLngBounds();let count=0;
  const home=homeData();if(home.lat!=null&&home.lng!=null){const pos={lat:home.lat,lng:home.lng};homeMarker=new google.maps.Marker({map,position:pos,title:home.name||'Property',icon:roundPinIcon(36,'#111827','#ffffff'),label:{text:'⌂',color:'#ffffff',fontSize:'17px',fontWeight:'800'}});homeMarker.addListener('click',()=>{infoWindow.setContent(popup({...home,googlePlaceId:state.home.googlePlaceId,googleUrl:state.home.googleUrl}));infoWindow.open(map,homeMarker);});bounds.extend(pos);count++;}
  state.pois.forEach((raw,i)=>{const p=poiData(raw);if(p.lat==null||p.lng==null)return;const pos={lat:p.lat,lng:p.lng},cat=categoryMeta(p.category);
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
function renderGoogleListingLimit(){
  const el=$('googleListingLimit');if(!el)return;
  const total=state.pois.length,googleLinked=state.pois.filter(p=>p&&p.placeId).length,shown=Math.min(20,googleLinked);
  if(!total){
    el.innerHTML='<strong>Google Listing:</strong> up to 20 Google-linked POIs can appear with Google place cards. Map and Expanded view will show all POIs.';
    return;
  }
  if(googleLinked>20){
    el.className='googleListingLimit over';
    el.innerHTML='<strong>'+total+' POIs added.</strong> Google Listing will show only the first 20 Google-linked POIs. Map and Expanded view will still show all '+total+'.';
  }else{
    el.className='googleListingLimit';
    el.innerHTML='<strong>'+total+' POI'+(total===1?'':'s')+' added.</strong> Google Listing: '+shown+'/20 Google-linked places available. Map and Expanded view will show all POIs.';
  }
}
function renderEditorList() {
  const el=$('poiEditList');el.replaceChildren();renderGoogleListingLimit();if(!state.pois.length){el.innerHTML='<div class="empty">No places added yet. Search above to add one.</div>';return;}
  state.pois.forEach((raw,i)=>{const p=poiData(raw),cat=categoryMeta(p.category),card=document.createElement('div');card.className='poiEdit';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Show '+p.name+' on map');
    card.innerHTML='<div class="poiIcon">'+cat.icon+'</div><div><div class="poiTitle">'+esc(p.name)+'</div><div class="poiMeta">'+esc(cat.en)+(distanceText(p)?' · '+esc(distanceText(p)):' · Pin pending')+'</div><div class="poiMeta">'+esc(p.address)+'</div>'+(p.note?'<div class="poiMeta">'+esc(p.note)+'</div>':'')+'</div><div class="row"><button type="button" class="btn tiny ghost" data-focus>Map</button><button type="button" class="btn tiny ghost danger" data-delete aria-label="Remove '+esc(p.name)+'">Remove</button></div>';
    card.onclick=()=>focusPoi(i);card.onkeydown=e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();focusPoi(i);}};
    card.querySelector('[data-focus]').onclick=e=>{e.stopPropagation();focusPoi(i);};card.querySelector('[data-delete]').onclick=e=>{e.stopPropagation();state.pois.splice(i,1);repairIndex=null;saveDraft();renderAll(true);};el.appendChild(card);
  });
}
function renderClient() {
  const home=homeData(),title=state.title||home.name||'Property Spot Map';$('clientTopTitle').textContent=title;$('clientTopRef').textContent=state.client?(lang==='zh'?'客户 / 参考：':'Client / ref: ')+state.client:'';
  $('clientHomeName').textContent=home.name||(lang==='zh'?'物业':'Property');$('clientHomeAddress').textContent=home.address||'';$('clientIntro').textContent=state.intro||'';$('clientCount').textContent=state.pois.length+(lang==='zh'?' 个地点':' places');$('langBtn').textContent=lang==='en'?'中文':'EN';
  const list=$('clientPoiList');list.replaceChildren();if(!state.pois.length){list.innerHTML='<div class="empty">'+(lang==='zh'?'暂时没有加入附近地点。':'No nearby places added yet.')+'</div>';return;}
  state.pois.map((raw,i)=>({p:poiData(raw),i})).sort((a,b)=>(distance(home,a.p)??999)-(distance(home,b.p)??999)).forEach(({p,i})=>{
    const cat=categoryMeta(p.category),item=document.createElement('div');item.className='clientPoi';item.innerHTML='<div class="poiIcon">'+cat.icon+'</div><div><div class="poiTitle">'+esc(p.name)+'</div><div class="poiMeta">'+esc(lang==='zh'?cat.zh:cat.en)+(distanceText(p)?' · '+esc(distanceText(p)):'')+'</div>'+(p.note?'<div class="note">'+esc(p.note)+'</div>':'')+'</div><a class="gmaps" target="_blank" rel="noopener" href="'+esc(googleUrl(p))+'">Google Maps ↗</a>';
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
  rememberCategoryForMap(p.category);
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
  const category=$('poiCategory').value;rememberCategoryForMap(category);
  livePlaces.set(p.placeId,p);repairIndex=null;state.pois.push({placeId:p.placeId,category,note:''});saveDraft();renderAll(true);renderSearchResults();showSelection(i);status('placeSearchStatus','Added '+p.name+'.','ok');
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
function copy(text) {if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text);const input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();return Promise.resolve();}
function downloadJson() {syncFromForm();const blob=new Blob([JSON.stringify(portable(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=((homeData().name||'property-map').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'property-map')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function importJson(file) {const reader=new FileReader();reader.onload=async()=>{try{const d=JSON.parse(reader.result);if(!d.home||!Array.isArray(d.pois))throw new Error();state=d;syncCustomCategoriesFromState();fillCategories();livePlaces.clear();saveDraft();renderAll(true);await hydratePlaces();status('homeStatus','Map imported.','ok');}catch(e){status('homeStatus','Invalid map JSON.','warn');}};reader.readAsText(file);}
function newMap() {if(!confirm('Start a new map? Your current draft will be cleared from this browser.'))return;state=emptyState();currentMapId=null;livePlaces.clear();pinTarget=null;repairIndex=null;results=[];selectedIndex=-1;if(selectedMarker){selectedMarker.setMap(null);selectedMarker=null;}renderSearchResults();$('placeSearchInput').value='';status('placeSearchStatus','');localStorage.removeItem('propertySpotMapDraft');history.replaceState(null,'',location.pathname+'?new=1&edit=1');renderAll(false);if(map){map.setCenter({lat:3.159, lng:101.692});map.setZoom(12);}}

function bindUi() {
  $('setHomeBtn').onclick=setHome;$('addPoiBtn').onclick=addPoi;$('clearPoiBtn').onclick=clearPoi;$('saveDashboardBtn').onclick=saveToDashboard;$('exportBtn').onclick=downloadJson;$('newBtn').onclick=newMap;
  $('addCategoryBtn').onclick=openCategoryModal;$('closeCategoryBtn').onclick=closeCategoryModal;$('saveCategoryBtn').onclick=saveCustomCategory;
  $('customCategoryEn').addEventListener('input',updateCategoryChineseSuggestion);
  $('customCategoryZh').addEventListener('input',()=>{if($('customCategoryZh').value!==customZhAutoValue)customZhAutoValue='';});
  $('categoryModal').onclick=e=>{if(e.target===$('categoryModal'))closeCategoryModal();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('categoryModal').classList.contains('open'))closeCategoryModal();});
  $('findPlacesBtn').onclick=findPlaces;$('placeSearchInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();findPlaces();}};
  $('pickHomeBtn').onclick=()=>startPin('home');$('pickPoiBtn').onclick=()=>startPin('poi');
  ['mapTitle','clientName','intro'].forEach(id=>$(id).addEventListener('input',()=>{syncFromForm();renderClient();}));
  ['homeName','homeAddress'].forEach(id=>$(id).addEventListener('input',onHomeChanged));
  $('homeGoogleUrl').onchange=()=>{if(validLink('homeGoogleUrl','homeStatus')!==null)syncFromForm();};
  $('importFile').onchange=function(){if(this.files&&this.files[0])importJson(this.files[0]);this.value='';};

  $('copyClientUrlBtn').onclick=()=>copy(location.href).then(()=>{const btn=$('copyClientUrlBtn'),old=btn.textContent;btn.textContent=lang==='zh'?'已复制':'Copied';setTimeout(()=>btn.textContent=old,1200);});
  $('langBtn').onclick=()=>{lang=lang==='en'?'zh':'en';renderClient();};
}
async function initGoogle() {
  map=new google.maps.Map($('map'),{center:{lat:3.159,lng:101.692},zoom:12,mapTypeControl:false,streetViewControl:false,gestureHandling:'greedy'});
  infoWindow=new google.maps.InfoWindow();map.addListener('click',e=>{if(!readOnly)pinAt(e.latLng);});
  const {PlaceAutocompleteElement}=await google.maps.importLibrary('places');
  const autocomplete=new PlaceAutocompleteElement();autocomplete.placeholder='Search e.g. '+placeholderExample.property+' or any address in Malaysia';autocomplete.includedRegionCodes=['my'];$('homeAutocomplete').appendChild(autocomplete);
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
async function boot() {
  applyRandomPlaceholders();const params=new URLSearchParams(location.search);
  let loadWarning='';
  if(location.hash.length>1){try{state=decodeState(location.hash.slice(1));}catch(e){loadDraft();}}
  else if(params.get('map')){
    const id=params.get('map');
    if(!loadSavedMap(id)){
      try{await loadPublishedMapForEdit(id);}
      catch(e){state=emptyState();currentMapId=null;loadWarning='Could not load published map: '+e.message;}
    }
  }
  else if(params.get('new')==='1'){state=emptyState();currentMapId=null;localStorage.removeItem('propertySpotMapDraft');}
  else loadDraft();
  syncCustomCategoriesFromState();
  fillCategories();
  readOnly=location.hash.length>1&&params.get('edit')!=='1';if(readOnly){$('app').classList.add('readOnly');$('modeLabel').textContent='Client view';}
  else $('modeLabel').textContent='Agent builder';
  bindUi();renderAll(false);
  if(loadWarning)status('homeStatus',loadWarning,'warn');
  loadGoogle();
}
boot();
})();
