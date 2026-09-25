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
let data=null,map=null,infoWindow=null,lang='en',homeMarker=null,homePulseMarkers=[],homePulseFrame=0,poiMarkers=[];
let availableCategories=[],selectedCategories=new Set(),activePoiIndex=null,setMobileSheetState=null;
const livePlaces=new Map();
const DATA_API=window.PROPERTY_MAP_DATA_API||'';
const ROUTES_ENABLED=window.PROPERTY_MAP_ROUTES_ENABLED===true;
const routeModes={DRIVING:{icon:'🚗',en:'Drive',zh:'驾车'}};
let routeMode='DRIVING',routeReversed=false,routeBaseLine=null,routeFlowLine=null,routeFlowFrame=0,currentRoute=null,routeRequestSerial=0;
const routeCache=new Map();
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function validId(id){return /^psm_[A-Z2-9]{8}$/.test(id||'');}
function latLng(place){if(!place||!place.location)return null;const loc=place.location,lat=typeof loc.lat==='function'?loc.lat():loc.lat,lng=typeof loc.lng==='function'?loc.lng():loc.lng;return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;}
function asPlace(place){const loc=latLng(place);return {placeId:place.id,name:place.displayName||'Unnamed place',address:place.formattedAddress||'',type:place.primaryTypeDisplayName||place.primaryType||'',lat:loc&&loc.lat,lng:loc&&loc.lng};}
function homeData(){return data.home&&data.home.googlePlaceId?(livePlaces.get(data.home.googlePlaceId)||{name:data.home.name||'Property',address:data.home.address||'',lat:data.home.lat,lng:data.home.lng}):data.home||{};}
function poiData(p){return p.placeId?{...(livePlaces.get(p.placeId)||{name:p.name||'Place',address:p.address||'',lat:p.lat,lng:p.lng}),...p}:p;}
function distance(a,b){if(a.lat==null||a.lng==null||b.lat==null||b.lng==null)return null;const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLng=(b.lng-a.lng)*r,x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;return 12742*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function distanceText(p){const km=distance(homeData(),p);return km==null?'':km<1?Math.round(km*1000)+' m':km.toFixed(1)+' km';}
function googleUrl(p){const id=p.placeId||p.googlePlaceId;if(id)return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.name||'place')+'&query_place_id='+encodeURIComponent(id);return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([p.name,p.address].filter(Boolean).join(' '));}
function categoryKey(raw){return categories[raw&&raw.category]?raw.category:'other';}
function initCategoryFilters(){
  const used=new Set((data&&data.pois||[]).map(categoryKey));
  availableCategories=Object.keys(categories).filter(key=>used.has(key));
  selectedCategories=new Set(availableCategories);
}
function isCategoryVisible(raw){return selectedCategories.has(categoryKey(raw));}
function visiblePoiCount(){return (data&&data.pois||[]).filter(isCategoryVisible).length;}
function setAllCategories(){selectedCategories=new Set(availableCategories);renderFilters();renderClient();renderMap(true);}
function toggleCategory(key){
  if(selectedCategories.has(key))selectedCategories.delete(key);else selectedCategories.add(key);
  if(activePoiIndex!=null&&data&&data.pois&&data.pois[activePoiIndex]&&!isCategoryVisible(data.pois[activePoiIndex])){activePoiIndex=null;clearActiveRoute();}
  renderFilters();renderClient();renderMap(true);
}
function renderFilters(){
  const host=$('categoryFilters');
  if(!host)return;
  host.replaceChildren();
  if(!availableCategories.length){host.hidden=true;return;}
  host.hidden=false;
  const allActive=selectedCategories.size===availableCategories.length;
  const all=document.createElement('button');
  all.type='button';all.className='filterChip'+(allActive?' active':'');all.textContent=lang==='zh'?'全部':'All';
  all.setAttribute('aria-pressed',allActive?'true':'false');
  all.onclick=setAllCategories;host.appendChild(all);
  availableCategories.forEach(key=>{
    const cat=categories[key]||categories.other,active=selectedCategories.has(key),btn=document.createElement('button');
    btn.type='button';btn.className='filterChip'+(active?' active':'');
    btn.setAttribute('aria-pressed',active?'true':'false');
    btn.innerHTML='<span class="filterChipIcon">'+cat.icon+'</span><span>'+esc(lang==='zh'?cat.zh:cat.en)+'</span>';
    btn.onclick=()=>toggleCategory(key);host.appendChild(btn);
  });
  requestAnimationFrame(updateFilterScrollButtons);
}
function updateFilterScrollButtons(){
  const host=$('categoryFilters'),left=$('filterScrollLeft'),right=$('filterScrollRight');
  if(!host||!left||!right)return;
  const max=Math.max(0,host.scrollWidth-host.clientWidth);
  const canScroll=max>4;
  left.hidden=!canScroll||host.scrollLeft<=4;
  right.hidden=!canScroll||host.scrollLeft>=max-4;
}
function initFilterScroller(){
  const host=$('categoryFilters'),left=$('filterScrollLeft'),right=$('filterScrollRight');
  if(!host||!left||!right)return;
  const amount=()=>Math.max(180,Math.round(host.clientWidth*.72));
  left.onclick=()=>host.scrollBy({left:-amount(),behavior:'smooth'});
  right.onclick=()=>host.scrollBy({left:amount(),behavior:'smooth'});
  host.addEventListener('scroll',updateFilterScrollButtons,{passive:true});
  addEventListener('resize',updateFilterScrollButtons);
  new ResizeObserver(updateFilterScrollButtons).observe(host);
  requestAnimationFrame(updateFilterScrollButtons);
}
function roundPinIcon(size,fill,stroke,strokeWeight=2){return {path:google.maps.SymbolPath.CIRCLE,scale:size/2,fillColor:fill,fillOpacity:1,strokeColor:stroke,strokeWeight};}
function poiMarkerIcon(i){
  const active=i===activePoiIndex;
  return roundPinIcon(active?36:32,'#ffffff',active?'#243244':'#94a3b8',active?3:1.5);
}
function updatePoiSelectionStyles(){
  if(!data)return;
  poiMarkers.forEach((m,i)=>{
    if(!m)return;
    m.setIcon(poiMarkerIcon(i));
    m.setZIndex(i===activePoiIndex?900:undefined);
  });
  document.querySelectorAll('.clientPoi[data-poi-index]').forEach(card=>{
    const i=Number(card.dataset.poiIndex);
    card.classList.toggle('selected',i===activePoiIndex);
    card.setAttribute('aria-selected',i===activePoiIndex?'true':'false');
  });
}
function scrollActivePoiIntoView(){
  if(activePoiIndex==null)return;
  requestAnimationFrame(()=>{
    const card=document.querySelector('.clientPoi[data-poi-index="'+activePoiIndex+'"]');
    if(card)card.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
}
function selectPoi(i,options={}){
  const raw=(data&&data.pois||[])[i];
  if(!raw||!isCategoryVisible(raw))return;
  const p=poiData(raw);
  activePoiIndex=i;
  updatePoiSelectionStyles();

  if(options.expandSheet&&matchMedia('(max-width:900px)').matches&&setMobileSheetState)setMobileSheetState('half');
  if(options.scroll)scrollActivePoiIntoView();

  if(p.lat==null||p.lng==null){
    if(options.openFallback)window.open(googleUrl(p),'_blank','noopener,noreferrer');
    return;
  }
  if(options.center)map.setCenter({lat:p.lat,lng:p.lng});
  if(options.zoom)map.setZoom(16);
  const m=poiMarkers[i];
  if(m&&options.info!==false){
    infoWindow.setContent(popup(p));
    infoWindow.open(map,m);
  }
  if(ROUTES_ENABLED)requestActiveRoute();
}
function routePointKey(p){return p&&p.placeId?('pid:'+p.placeId):[Number(p&&p.lat).toFixed(6),Number(p&&p.lng).toFixed(6)].join(',');}
function routeCacheKey(home,poi){return [routePointKey(home),routePointKey(poi),routeMode,routeReversed?'R':'F'].join('|');}
function formatRouteDistance(meters){
  if(!Number.isFinite(meters))return '';
  return meters<1000?Math.max(1,Math.round(meters))+' m':(meters/1000).toFixed(meters<10000?1:0)+' km';
}
function formatRouteDuration(ms){
  if(!Number.isFinite(ms))return '';
  const minutes=Math.max(1,Math.round(ms/60000));
  if(minutes<60)return minutes+' min';
  const h=Math.floor(minutes/60),m=minutes%60;
  return h+' hr'+(m?' '+m+' min':'');
}
function clearRouteOverlay(){
  routeRequestSerial++;
  if(routeFlowFrame)cancelAnimationFrame(routeFlowFrame);
  routeFlowFrame=0;
  if(routeBaseLine)routeBaseLine.setMap(null);
  if(routeFlowLine)routeFlowLine.setMap(null);
  routeBaseLine=null;routeFlowLine=null;currentRoute=null;
}
function fitRoutePath(path){
  if(!map||!path||!path.length)return;
  const bounds=new google.maps.LatLngBounds();
  path.forEach(pt=>bounds.extend(pt));
  const mobile=matchMedia('(max-width:900px)').matches;
  map.fitBounds(bounds,mobile?72:58);
}
function drawRoutePath(route,fit=true){
  if(!map||!route||!Array.isArray(route.path)||!route.path.length)return;
  if(routeFlowFrame)cancelAnimationFrame(routeFlowFrame);
  if(routeBaseLine)routeBaseLine.setMap(null);
  if(routeFlowLine)routeFlowLine.setMap(null);

  routeBaseLine=new google.maps.Polyline({
    map,path:route.path,geodesic:false,clickable:false,zIndex:420,
    strokeColor:'#4f8fd8',strokeOpacity:.78,strokeWeight:5
  });
  const arrow={path:google.maps.SymbolPath.FORWARD_CLOSED_ARROW,scale:2.15,fillColor:'#ffffff',fillOpacity:1,strokeColor:'#2563eb',strokeOpacity:1,strokeWeight:1};
  routeFlowLine=new google.maps.Polyline({
    map,path:route.path,geodesic:false,clickable:false,zIndex:421,
    strokeOpacity:0,
    icons:[{icon:arrow,offset:'0px',repeat:'44px'}]
  });

  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const started=performance.now();
    const animate=now=>{
      if(!routeFlowLine)return;
      const offset=((now-started)/28)%44;
      const icons=routeFlowLine.get('icons');
      if(icons&&icons[0]){icons[0].offset=offset.toFixed(1)+'px';routeFlowLine.set('icons',icons);}
      routeFlowFrame=requestAnimationFrame(animate);
    };
    routeFlowFrame=requestAnimationFrame(animate);
  }
  if(fit)fitRoutePath(route.path);
}
function renderRoutePanel(){
  const panel=$('routePanel');
  if(!panel)return;
  const raw=activePoiIndex==null?null:(data&&data.pois||[])[activePoiIndex];
  if(!ROUTES_ENABLED||!raw){panel.hidden=true;return;}
  panel.hidden=false;
  const home=homeData(),poi=poiData(raw);
  const from=routeReversed?poi:home,to=routeReversed?home:poi;
  $('routeDirectionLabel').textContent=(from.name||'Start')+' → '+(to.name||'Destination');
  $('routeReverseBtn').title=lang==='zh'?'反转方向':'Reverse direction';
  $('routeReverseBtn').setAttribute('aria-label',$('routeReverseBtn').title);
  document.querySelectorAll('[data-route-mode]').forEach(btn=>{
    const key=btn.dataset.routeMode,meta=routeModes[key],active=key===routeMode;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-pressed',active?'true':'false');
    btn.innerHTML='<span>'+meta.icon+'</span><span>'+esc(lang==='zh'?meta.zh:meta.en)+'</span>';
  });
  const warning=$('routeWarning');
  const warnMode=routeMode==='WALKING'||routeMode==='BICYCLING';
  warning.hidden=!warnMode;
  warning.textContent=warnMode?(lang==='zh'?'步行和骑行路线可能没有完整的人行道或自行车道信息。':'Walking and cycling routes may not include complete sidewalk or cycle-path information.'):'';
  if(currentRoute){
    $('routeSummary').textContent=[formatRouteDuration(currentRoute.durationMillis),formatRouteDistance(currentRoute.distanceMeters)].filter(Boolean).join(' · ');
  }else{
    $('routeSummary').textContent=lang==='zh'?'计算路线…':'Calculating route…';
  }
}
function decodePolyline(encoded){
  const path=[];let index=0,lat=0,lng=0;
  while(index<encoded.length){
    let result=0,shift=0,b;
    do{b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);
    const dlat=(result&1)?~(result>>1):(result>>1);lat+=dlat;
    result=0;shift=0;
    do{b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);
    const dlng=(result&1)?~(result>>1):(result>>1);lng+=dlng;
    path.push({lat:lat/1e5,lng:lng/1e5});
  }
  return path;
}
function routeGateway(id,poiIndex,reversed,mode){
  return new Promise((resolve,reject)=>{
    if(!DATA_API){reject(new Error('Route service is not configured.'));return;}
    const cb='psmroute_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script');
    const timer=setTimeout(()=>{cleanup();reject(new Error('Route service timed out.'));},15000);
    function cleanup(){clearTimeout(timer);delete window[cb];script.remove();}
    window[cb]=value=>{cleanup();resolve(value);};
    script.onerror=()=>{cleanup();reject(new Error('Could not reach route service.'));};
    const q=new URLSearchParams({
      action:'route',id:String(id||''),poi:String(poiIndex),
      reverse:reversed?'1':'0',mode:String(mode||'DRIVING'),callback:cb
    });
    script.src=DATA_API+'?'+q.toString();
    document.head.appendChild(script);
  });
}
async function requestActiveRoute(){
  if(!ROUTES_ENABLED||!map||activePoiIndex==null)return;
  const raw=(data&&data.pois||[])[activePoiIndex];
  if(!raw||!isCategoryVisible(raw))return;
  const home=homeData(),poi=poiData(raw);
  currentRoute=null;
  renderRoutePanel();

  const cacheKey=routeCacheKey(home,poi),cached=routeCache.get(cacheKey);
  if(cached){
    currentRoute=cached;
    drawRoutePath(cached,true);
    renderRoutePanel();
    return;
  }

  const serial=++routeRequestSerial;
  $('routeStatus').textContent=lang==='zh'?'正在读取路线…':'Loading route…';
  try{
    const result=await routeGateway(data.id,activePoiIndex,routeReversed,routeMode);
    if(serial!==routeRequestSerial)return;
    if(!result||!result.ok)throw new Error(result&&result.error?result.error:'Route unavailable.');
    if(!result.route||!result.route.encodedPolyline)throw new Error('No route found.');
    const path=decodePolyline(result.route.encodedPolyline);
    if(!path.length)throw new Error('No route path returned.');
    currentRoute={
      path,
      distanceMeters:Number(result.route.distanceMeters),
      durationMillis:Number(result.route.durationSeconds)*1000
    };
    routeCache.set(cacheKey,currentRoute);
    drawRoutePath(currentRoute,true);
    $('routeStatus').textContent='';
  }catch(err){
    if(serial!==routeRequestSerial)return;
    clearRouteOverlay();
    renderRoutePanel();
    $('routeSummary').textContent=lang==='zh'?'暂时无法取得路线':'Route unavailable';
    $('routeStatus').textContent=err&&err.message?err.message:'Could not calculate route.';
  }
}
function clearActiveRoute(){
  clearRouteOverlay();
  currentRoute=null;
  const panel=$('routePanel');if(panel)panel.hidden=true;
}
function initRouteControls(){
  const reverse=$('routeReverseBtn');
  if(reverse)reverse.onclick=()=>{if(!ROUTES_ENABLED)return;routeReversed=!routeReversed;clearRouteOverlay();requestActiveRoute();};
  document.querySelectorAll('[data-route-mode]').forEach(btn=>{
    btn.onclick=()=>{
      if(!ROUTES_ENABLED)return;
      const next=btn.dataset.routeMode;
      if(!routeModes[next]||next===routeMode)return;
      routeMode=next;clearRouteOverlay();requestActiveRoute();
    };
  });
}
function createPropertyPulseMarker(position,title,onClick){
  const makeHalo=()=>new google.maps.Marker({
    map,position,clickable:false,zIndex:997,
    icon:{path:google.maps.SymbolPath.CIRCLE,scale:21,fillOpacity:0,strokeColor:'#60a5fa',strokeOpacity:.6,strokeWeight:2}
  });
  const haloA=makeHalo(),haloB=makeHalo();
  homePulseMarkers=[haloA,haloB];

  const core=new google.maps.Marker({
    map,position,zIndex:999,title,
    icon:{path:google.maps.SymbolPath.CIRCLE,scale:19,fillColor:'#0f172a',fillOpacity:1,strokeColor:'#ffffff',strokeOpacity:1,strokeWeight:3},
    label:{text:'⌂',color:'#ffffff',fontSize:'18px',fontWeight:'900'}
  });
  if(onClick)core.addListener('click',onClick);

  const start=performance.now();
  const animate=now=>{
    const cycle=1900;
    const phases=[((now-start)%cycle)/cycle,(((now-start)+cycle/2)%cycle)/cycle];
    homePulseMarkers.forEach((marker,i)=>{
      const p=phases[i],scale=20+(p*15),opacity=Math.max(0,.72*(1-p));
      marker.setIcon({path:google.maps.SymbolPath.CIRCLE,scale,fillOpacity:0,strokeColor:'#60a5fa',strokeOpacity:opacity,strokeWeight:2});
    });
    homePulseFrame=requestAnimationFrame(animate);
  };
  homePulseFrame=requestAnimationFrame(animate);
  return core;
}
function popup(p){return '<strong>'+esc(p.name||'Place')+'</strong><br>'+esc(p.address||'')+(p.note?'<br>'+esc(p.note):'')+'<br><a target="_blank" rel="noopener" href="'+esc(googleUrl(p))+'">Open in Google Maps ↗</a>';}
function clearMarkers(){if(homePulseFrame)cancelAnimationFrame(homePulseFrame);homePulseFrame=0;if(homeMarker)homeMarker.setMap(null);homePulseMarkers.forEach(m=>m&&m.setMap(null));poiMarkers.forEach(m=>m&&m.setMap(null));homeMarker=null;homePulseMarkers=[];poiMarkers=[];}
function renderMap(fit){if(!map||!data)return;clearMarkers();const bounds=new google.maps.LatLngBounds();let count=0,home=homeData();
  if(home.lat!=null&&home.lng!=null){const pos={lat:home.lat,lng:home.lng};homeMarker=createPropertyPulseMarker(pos,(home.name||'Property')+' — Main property',()=>{infoWindow.setContent('<strong>'+esc(home.name||'Property')+'</strong><br><span style="font-size:11px;font-weight:700;color:#64748b">MAIN PROPERTY</span><br>'+esc(home.address||'')+'<br><a target="_blank" rel="noopener" href="'+esc(googleUrl(home))+'">Open in Google Maps ↗</a>');infoWindow.open(map,homeMarker);});bounds.extend(pos);count++;}
  (data.pois||[]).forEach((raw,i)=>{if(!isCategoryVisible(raw))return;const p=poiData(raw);if(p.lat==null||p.lng==null)return;const cat=categories[p.category]||categories.other,pos={lat:p.lat,lng:p.lng};const m=new google.maps.Marker({map,position:pos,title:p.name,icon:poiMarkerIcon(i),label:{text:cat.icon,fontSize:'16px'},zIndex:i===activePoiIndex?900:undefined});m.addListener('click',()=>selectPoi(i,{expandSheet:true,scroll:true,info:true}));poiMarkers[i]=m;bounds.extend(pos);count++;});
  if(fit&&count){if(count===1){map.setCenter(bounds.getCenter());map.setZoom(15);}else map.fitBounds(bounds,52);}
}
function focusPoi(i){selectPoi(i,{center:true,zoom:true,info:true,openFallback:true});}
function focusHome(){
  if(!map||!data)return;
  const home=homeData();
  if(home.lat==null||home.lng==null)return;
  activePoiIndex=null;
  updatePoiSelectionStyles();
  clearActiveRoute();
  if(infoWindow)infoWindow.close();
  map.panTo({lat:home.lat,lng:home.lng});
  map.setZoom(15);
  if(homeMarker&&infoWindow){
    infoWindow.setContent('<strong>'+esc(home.name||'Property')+'</strong><br><span style="font-size:11px;font-weight:700;color:#64748b">MAIN PROPERTY</span><br>'+esc(home.address||'')+'<br><a target="_blank" rel="noopener" href="'+esc(googleUrl(home))+'">Open in Google Maps ↗</a>');
    infoWindow.open(map,homeMarker);
  }
}
function renderClient(){
  const home=homeData(),title=data.title||home.name||'Property Spot Map',visible=visiblePoiCount();
  $('clientTopTitle').textContent=title;
  $('clientTopRef').textContent=data.client?(lang==='zh'?'客户 / 参考：':'Client / ref: ')+data.client:'';
  $('clientHomeName').textContent=home.name||(lang==='zh'?'物业':'Property');
  $('clientHomeAddress').textContent=home.address||'';
  $('clientIntro').textContent=data.intro||'';
  $('clientCount').textContent=visible+(lang==='zh'?' 个地点':' places');
  $('langBtn').textContent=lang==='en'?'中文':'EN';
  renderFilters();
  renderRoutePanel();

  const list=$('clientPoiList');list.replaceChildren();
  const visibleItems=(data.pois||[]).map((raw,i)=>({raw,p:poiData(raw),i})).filter(x=>isCategoryVisible(x.raw));
  if(!visibleItems.length){
    if((data.pois||[]).length){
      list.innerHTML='<div class="filterEmpty"><div>'+(lang==='zh'?'没有选择任何类别。':'No categories selected.')+'</div><button type="button" class="btn tiny primary" id="showAllCategoriesBtn">'+(lang==='zh'?'显示全部':'Show all')+'</button></div>';
      $('showAllCategoriesBtn').onclick=setAllCategories;
    }else{
      list.innerHTML='<div class="empty">'+(lang==='zh'?'暂时没有加入附近地点。':'No nearby places added yet.')+'</div>';
    }
    return;
  }

  visibleItems.sort((a,b)=>(distance(home,a.p)??999)-(distance(home,b.p)??999)).forEach(({p,i})=>{
    const cat=categories[p.category]||categories.other,item=document.createElement('div');
    item.className='clientPoi'+(i===activePoiIndex?' selected':'');
    item.dataset.poiIndex=String(i);
    item.setAttribute('aria-selected',i===activePoiIndex?'true':'false');
    item.innerHTML='<div class="poiIcon">'+cat.icon+'</div><div><div class="poiTitle">'+esc(p.name||'Place')+'</div><div class="poiMeta">'+esc(lang==='zh'?cat.zh:cat.en)+(distanceText(p)?' · '+esc(distanceText(p)):'')+'</div>'+(p.note?'<div class="note">'+esc(p.note)+'</div>':'')+'</div><a class="gmaps" target="_blank" rel="noopener" href="'+esc(googleUrl(p))+'">Google Maps ↗</a>';
    item.onclick=e=>{if(e.target.closest('a'))return;focusPoi(i);};
    list.appendChild(item);
  });
  updatePoiSelectionStyles();
}
function initMobileSheet(){
  const sheet=$('clientSheet'),handle=$('sheetHandle');
  if(!sheet||!handle)return;
  let state='half',dragging=false,startY=0,startH=0,moved=false;
  const order=['peek','half','full'];

  function heightFor(next){
    const host=sheet.parentElement.getBoundingClientRect().height;
    if(next==='peek')return 112;
    if(next==='full')return Math.max(180,host-12);
    return Math.max(220,Math.min(host*.46,440));
  }
  function apply(next,animate=true){
    state=next;
    sheet.classList.remove('sheetPeek','sheetHalf','sheetFull');
    sheet.classList.add('sheet'+next[0].toUpperCase()+next.slice(1));
    if(!animate)sheet.style.transition='none';
    sheet.style.height='';
    handle.setAttribute('aria-expanded',next!=='peek'?'true':'false');
    if(!animate)requestAnimationFrame(()=>sheet.style.transition='');
  }
  function snapFromHeight(h){
    const values=order.map(x=>({x,h:heightFor(x)}));
    values.sort((a,b)=>Math.abs(a.h-h)-Math.abs(b.h-h));
    apply(values[0].x);
  }
  handle.addEventListener('pointerdown',e=>{
    if(!matchMedia('(max-width:900px)').matches)return;
    dragging=true;moved=false;startY=e.clientY;startH=sheet.getBoundingClientRect().height;
    sheet.style.transition='none';handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const dy=e.clientY-startY;if(Math.abs(dy)>4)moved=true;
    const min=heightFor('peek'),max=heightFor('full');
    const next=Math.max(min,Math.min(max,startH-dy));
    sheet.style.height=next+'px';
  });
  handle.addEventListener('pointerup',e=>{
    if(!dragging)return;dragging=false;sheet.style.transition='';try{handle.releasePointerCapture(e.pointerId);}catch(_){}
    if(!moved){
      const i=order.indexOf(state);
      apply(order[i===2?1:i+1]);
      return;
    }
    snapFromHeight(sheet.getBoundingClientRect().height);
  });
  handle.addEventListener('pointercancel',()=>{dragging=false;sheet.style.transition='';apply(state);});
  handle.addEventListener('keydown',e=>{
    const i=order.indexOf(state);
    if(e.key==='ArrowUp'){e.preventDefault();apply(order[Math.min(2,i+1)]);}
    if(e.key==='ArrowDown'){e.preventDefault();apply(order[Math.max(0,i-1)]);}
  });
  addEventListener('resize',()=>{if(matchMedia('(max-width:900px)').matches)apply(state,false);});
  setMobileSheetState=next=>{if(order.includes(next))apply(next);};
  apply('half',false);
}

async function hydrate(){const ids=[data.home&&data.home.googlePlaceId,...(data.pois||[]).map(p=>p.placeId)].filter(Boolean);await Promise.all([...new Set(ids)].map(async id=>{try{const place=new google.maps.places.Place({id});await place.fetchFields({fields:['displayName','formattedAddress','location','primaryTypeDisplayName']});livePlaces.set(id,asPlace(place));}catch(e){console.warn('Place details unavailable',id,e);}}));renderClient();renderMap(true);}
async function initGoogle(){map=new google.maps.Map($('map'),{center:{lat:3.159,lng:101.692},zoom:12,mapTypeControl:false,streetViewControl:false,gestureHandling:'greedy'});infoWindow=new google.maps.InfoWindow();await hydrate();$('mapPlaceholder')?.remove();}
function loadGoogle(){const key=window.PROPERTY_MAP_CONFIG&&window.PROPERTY_MAP_CONFIG.apiKey;if(!key||key==='YOUR_GOOGLE_MAPS_API_KEY'){$('mapPlaceholder').textContent='Google Maps is not configured.';return;}window.propertyMapViewerReady=()=>initGoogle().catch(e=>{$('mapPlaceholder').textContent='Google Maps could not initialize: '+e.message;});const s=document.createElement('script');s.async=true;s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&libraries=places&loading=async&callback=propertyMapViewerReady';s.onerror=()=>{$('mapPlaceholder').textContent='Could not load Google Maps.';};document.head.appendChild(s);}
function jsonpMap(id){return new Promise((resolve,reject)=>{if(!DATA_API){reject(new Error('Map service is not configured.'));return;}const cb='psmview_'+Date.now()+'_'+Math.random().toString(36).slice(2),s=document.createElement('script'),timer=setTimeout(()=>{cleanup();reject(new Error('Property map service timed out.'));},12000);function cleanup(){clearTimeout(timer);delete window[cb];s.remove();}window[cb]=x=>{cleanup();resolve(x);};s.onerror=()=>{cleanup();reject(new Error('Could not reach property map service.'));};s.src=DATA_API+'?id='+encodeURIComponent(id)+'&callback='+encodeURIComponent(cb);document.head.appendChild(s);});}
async function loadPublishedMap(id){if(DATA_API){const result=await jsonpMap(id);if(result&&result.ok&&result.map)return result.map;if(result&&result.error&&result.error!=='Map not found')throw new Error(result.error);}const res=await fetch('maps/'+encodeURIComponent(id)+'.json',{cache:'no-store'});if(!res.ok)throw new Error('Property map not found.');return res.json();}
async function boot(){const id=new URLSearchParams(location.search).get('id');if(!validId(id)){$('mapPlaceholder').textContent='Invalid property map link.';return;}try{data=await loadPublishedMap(id);if(!data||data.id!==id||!data.home||!Array.isArray(data.pois))throw new Error('Property map data is invalid.');initCategoryFilters();renderClient();loadGoogle();}catch(e){$('mapPlaceholder').textContent=e.message;}}
$('langBtn').onclick=()=>{lang=lang==='en'?'zh':'en';if(data)renderClient();};
$('copyLinkBtn').onclick=()=>navigator.clipboard.writeText(location.href).then(()=>{const b=$('copyLinkBtn'),old=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=old,1200);});
$('homeReturnBtn').onclick=focusHome;
$('homeReturnBtn').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focusHome();}};
initMobileSheet();
initFilterScroller();
initRouteControls();
boot();
})();