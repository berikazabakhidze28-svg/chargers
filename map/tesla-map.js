const SUPABASE_URL=window.CHARGERX_SUPABASE.url;
const SUPABASE_KEY=window.CHARGERX_SUPABASE.publishableKey;
const GEORGIA_CENTER=[43.45,42.05];
const LIGHT_STYLE='https://tiles.openfreemap.org/styles/liberty';
const DARK_STYLE='https://tiles.openfreemap.org/styles/dark';
let darkModeEnabled=localStorage.getItem('chargerx-map-dark')==='true';
const VOYAGER_STYLE=darkModeEnabled?DARK_STYLE:LIGHT_STYLE;
const map=new maplibregl.Map({container:'map',style:VOYAGER_STYLE,center:GEORGIA_CENTER,zoom:7,pitch:0,bearing:0,maxPitch:75,attributionControl:false});
map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-left');

let chargers=[],markers=[],selected=null,userLocation=null,userMarker=null,is3d=false,routeActive=false,searchMarker=null,searchTimer=null;
let trackingStarted=false,lastTrackPoint=null,firstGpsFix=true;
let routeGuidance=[],guidanceIndex=0,navigationStarted=false;
let activeRouteFeature={type:'Feature',geometry:{type:'LineString',coordinates:[]},properties:{}};
let naprEnabled=false,naprUpdateTimer=null;
const NAPR_WMS='https://gpv0.napr.gov.ge/inspirevs/napr_ad/ows';
const NAPR_SETTLEMENT_WMS='https://gpv0.napr.gov.ge/inspirevs/napr_au/ows';
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const km=value=>value<1000?`${Math.round(value)} მ`:`${(value/1000).toFixed(value<10000?1:0)} კმ`;
function distance(a,b){const rad=x=>x*Math.PI/180,R=6371000,dLat=rad(b.lat-a.lat),dLon=rad(b.lng-a.lng),q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function toast(message){const node=$('mapToast');node.textContent=message;node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,2800)}
function normalize(row){return{id:Number(row.id),name:row.name,address:row.address||'',city:row.city||'',lat:Number(row.latitude),lng:Number(row.longitude),type:row.charger_type||'AC',connectors:row.connector_types||[],power:row.power_kw==null?null:Number(row.power_kw),ports:Number(row.ports||1),operator:row.operator||'',hours:row.working_hours||'24/7',price:row.price_info||'',notes:row.notes||''}}

async function fetchChargers(){
  try{const response=await fetch(`${SUPABASE_URL}/rest/v1/chargers?select=*&is_active=eq.true&order=city.asc,name.asc`,{headers:{apikey:SUPABASE_KEY}});if(!response.ok)throw new Error(`HTTP ${response.status}`);chargers=(await response.json()).map(normalize);$('networkStatus').textContent='ცოცხალი მონაცემები';renderMarkers();renderList()}
  catch(error){$('networkStatus').textContent='კავშირის შეცდომა';$('chargerList').innerHTML='<div class="list-loading">ლოკაციების ჩატვირთვა ვერ მოხერხდა.</div>';toast('Supabase-თან კავშირი ვერ მოხერხდა');console.error(error)}
}

function filteredChargers(){const list=[...chargers];if(userLocation)list.sort((a,b)=>distance(userLocation,a)-distance(userLocation,b));return list}
function renderList(){const list=filteredChargers();$('chargerCount').textContent=`${list.length} ლოკაცია`;$('chargerList').innerHTML=list.map(x=>{const away=userLocation?km(distance(userLocation,x)):x.city;return `<article class="charger-item ${selected?.id===x.id?'active':''}" data-charger="${x.id}"><div class="charger-icon">⚡</div><div><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml([x.city,x.address].filter(Boolean).join(' · '))}</small></div><span><b>${x.power??'—'} kW</b>${escapeHtml(away||'')}</span></article>`}).join('')||'<div class="list-loading">ლოკაცია ვერ მოიძებნა.</div>'}
function renderMarkers(){markers.forEach(x=>x.marker.remove());markers=[];chargers.forEach(charger=>{const el=document.createElement('div');el.className='charger-marker';el.innerHTML='<span>⚡</span>';el.addEventListener('click',event=>{event.stopPropagation();selectCharger(charger,true)});const marker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([charger.lng,charger.lat]).addTo(map);markers.push({id:charger.id,marker,element:el})})}

function selectCharger(charger,move=false){selected=charger;markers.forEach(x=>x.element.classList.toggle('active',x.id===charger.id));$('detailType').textContent=charger.type;$('detailName').textContent=charger.name;$('detailAddress').textContent=[charger.city,charger.address].filter(Boolean).join(' · ')||'მისამართი მითითებული არ არის';$('detailPower').textContent=charger.power==null?'—':`${charger.power} kW`;$('detailPorts').textContent=charger.ports;$('detailHours').textContent=charger.hours;$('detailConnectors').textContent=charger.connectors.length?`კონექტორები: ${charger.connectors.join(' · ')}`:'კონექტორები არ არის მითითებული';$('detailPrice').textContent=charger.price||'ფასი არ არის მითითებული';$('externalRoute').href=`https://www.google.com/maps/dir/?api=1&destination=${charger.lat},${charger.lng}`;$('chargerDetail').hidden=false;renderList();if(move)map.easeTo({center:[charger.lng,charger.lat],zoom:15,pitch:is3d?55:0,duration:900,padding:{left:innerWidth>850?390:0,bottom:innerWidth<=850?220:0}})}

function locateUser(showMessage=true,routeAfter=false){if(!navigator.geolocation){toast('GPS ამ ბრაუზერში მიუწვდომელია');return}navigator.geolocation.getCurrentPosition(position=>{userLocation={lat:position.coords.latitude,lng:position.coords.longitude};if(!userMarker){const el=document.createElement('div');el.className='user-location vehicle-arrow';userMarker=new maplibregl.Marker({element:el,pitchAlignment:'map',rotationAlignment:'map'}).setLngLat([userLocation.lng,userLocation.lat]).addTo(map)}else userMarker.setLngLat([userLocation.lng,userLocation.lat]);map.easeTo({center:[userLocation.lng,userLocation.lat],zoom:17,pitch:is3d?55:0});renderList();if(routeAfter)setTimeout(buildRoute,150);if(showMessage)toast('მდებარეობა განახლებულია')},()=>toast('მდებარეობის მიღება ვერ მოხერხდა'),{enableHighAccuracy:true,timeout:10000,maximumAge:30000})}

function startSpeedTracking(){
  if(trackingStarted||!navigator.geolocation)return;
  trackingStarted=true;
  navigator.geolocation.watchPosition(position=>{
    const now=position.timestamp||Date.now(),point={lat:position.coords.latitude,lng:position.coords.longitude,time:now};
    let speed=Number.isFinite(position.coords.speed)&&position.coords.speed>=0?position.coords.speed*3.6:null;
    if(speed===null&&lastTrackPoint){const seconds=(now-lastTrackPoint.time)/1000;if(seconds>0&&seconds<30)speed=distance(lastTrackPoint,point)/seconds*3.6}
    if(speed===null||speed<2.5)speed=0;speed=Math.min(250,Math.round(speed));
    $('speedValue').textContent=speed;$('speedDisplay').classList.toggle('moving',speed>0);$('speedDisplay').classList.toggle('fast',speed>=120);
    userLocation={lat:point.lat,lng:point.lng};lastTrackPoint=point;
    if(navigationStarted)updateNavigationInstruction();
    if(!userMarker){const el=document.createElement('div');el.className='user-location vehicle-arrow';userMarker=new maplibregl.Marker({element:el,pitchAlignment:'map',rotationAlignment:'map'}).setLngLat([point.lng,point.lat]).addTo(map)}else userMarker.setLngLat([point.lng,point.lat]);
    if(firstGpsFix){firstGpsFix=false;map.easeTo({center:[point.lng,point.lat],zoom:17,pitch:55,duration:700})}
  },()=>{$('networkStatus').textContent='GPS მიუწვდომელია'},{enableHighAccuracy:true,maximumAge:1000,timeout:15000});
}

function maneuverArrow(maneuver=''){const value=maneuver.toUpperCase();if(value.includes('LEFT'))return '↰';if(value.includes('RIGHT'))return '↱';if(value.includes('ROUNDABOUT'))return '↻';if(value.includes('UTURN'))return '↶';if(value.includes('ARRIVE'))return '●';return '↑'}
function updateNavigationInstruction(){
  if(!userLocation||!routeGuidance.length){$('maneuverDistance').textContent='—';$('maneuverInstruction').textContent='გააგრძელეთ მარშრუტზე';$('maneuverArrow').textContent='↑';return}
  let instruction=routeGuidance[Math.min(guidanceIndex,routeGuidance.length-1)],away=instruction.point?distance(userLocation,instruction.point):0;
  while(away<30&&guidanceIndex<routeGuidance.length-1){instruction=routeGuidance[++guidanceIndex];away=instruction.point?distance(userLocation,instruction.point):0}
  $('maneuverDistance').textContent=km(away);$('maneuverInstruction').textContent=instruction.message||'გააგრძელეთ მარშრუტზე';$('maneuverArrow').textContent=maneuverArrow(instruction.maneuver);
}

async function buildRoute(){if(!selected)return;if(!userLocation){toast('ჯერ ჩართე მიმდინარე მდებარეობა');locateUser(false);return}$('routeCard').hidden=true;$('routeCard').classList.remove('running');$('maneuverCard').hidden=true;$('routeButton').textContent='იგეგმება…';try{const params=new URLSearchParams({from:`${userLocation.lat},${userLocation.lng}`,to:`${selected.lat},${selected.lng}`});const response=await fetch(`${SUPABASE_URL}/functions/v1/route?${params}`);if(!response.ok)throw new Error('No route');const route=await response.json(),source=map.getSource('active-route'),minutes=Math.max(1,Math.round(route.duration/60)),arrival=new Date(route.arrivalTime||Date.now()+route.duration*1000);activeRouteFeature={type:'Feature',geometry:route.geometry,properties:{}};source.setData(activeRouteFeature);routeActive=true;navigationStarted=false;routeGuidance=(route.guidance||[]).filter(x=>x.point&&!String(x.maneuver).toUpperCase().includes('DEPART'));guidanceIndex=0;document.body.classList.add('navigation-active');$('routeDestination').textContent=selected.address||selected.name||'დანიშნულების ადგილი';$('routeDistance').textContent=km(route.distance);$('routeDuration').textContent=minutes>=60?`${Math.floor(minutes/60)}სთ ${minutes%60}წთ`:`${minutes} წთ`;$('routeArrival').textContent=arrival.toLocaleTimeString('ka-GE',{hour:'2-digit',minute:'2-digit',hour12:false});$('routeCard').hidden=false;$('chargerDetail').hidden=true;const bounds=new maplibregl.LngLatBounds();route.geometry.coordinates.forEach(x=>bounds.extend(x));map.fitBounds(bounds,{padding:{top:110,right:55,bottom:70,left:innerWidth>850?350:55},maxZoom:15,pitch:0,bearing:0,duration:1000})}catch(error){toast('მარშრუტის აგება ვერ მოხერხდა')}finally{$('routeButton').textContent='მარშრუტი'}}

function set3d(enabled){is3d=enabled;$('mode3d').setAttribute('aria-pressed',String(enabled));localStorage.setItem('chargerx-map-3d',String(enabled));if(enabled){if(map.getSource('terrain-dem'))map.setTerrain({source:'terrain-dem',exaggeration:1.15});map.easeTo({pitch:55,bearing:-12,duration:800})}else{map.setTerrain(null);map.easeTo({pitch:0,bearing:0,duration:700})}}
function add3dLayers(){if(!map.getSource('terrain-dem'))map.addSource('terrain-dem',{type:'raster-dem',url:'https://tiles.mapterhorn.com/tilejson.json',tileSize:512,maxzoom:14});const vectorSource=Object.entries(map.getStyle().sources).find(([,source])=>source.type==='vector')?.[0];if(vectorSource&&!map.getLayer('chargerx-3d-buildings')){try{map.addLayer({id:'chargerx-3d-buildings',source:vectorSource,'source-layer':'building',type:'fill-extrusion',minzoom:14,paint:{'fill-extrusion-color':darkModeEnabled?'#1B3B69':['interpolate',['linear'],['coalesce',['get','render_height'],['get','height'],8],0,'#eeeDE8',30,'#d3d2cc',100,'#bdbdb8'],'fill-extrusion-height':['coalesce',['get','render_height'],['get','height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.92}})}catch(error){console.warn('3D buildings layer unavailable',error)}}if(localStorage.getItem('chargerx-map-3d')!=='false')set3d(true)}

function naprImage(service=NAPR_WMS,layers='napr_ad:AD.NamedStreets,napr_ad:AD.Address'){
  const bounds=map.getBounds(),west=bounds.getWest(),south=bounds.getSouth(),east=bounds.getEast(),north=bounds.getNorth();
  const width=Math.min(1400,Math.max(512,Math.round(map.getCanvas().clientWidth*window.devicePixelRatio)));
  const height=Math.min(1400,Math.max(512,Math.round(map.getCanvas().clientHeight*window.devicePixelRatio)));
  const params=new URLSearchParams({service:'WMS',version:'1.3.0',request:'GetMap',layers,styles:'',crs:'CRS:84',bbox:`${west},${south},${east},${north}`,width:String(width),height:String(height),format:'image/png',transparent:'true'});
  return{url:`${service}?${params}`,coordinates:[[west,north],[east,north],[east,south],[west,south]]};
}
function updateNaprImage(sourceId,layerId,image,opacity){const source=map.getSource(sourceId);if(source){source.updateImage(image);return}map.addSource(sourceId,{type:'image',...image});map.addLayer({id:layerId,type:'raster',source:sourceId,paint:{'raster-opacity':opacity,'raster-fade-duration':0}},map.getLayer('active-route-line')?'active-route-line':undefined)}
function updateNaprOverlay(){
  if(!naprEnabled||!map.loaded())return;
  if(map.getZoom()<14){['napr-addresses-layer','napr-settlements-layer'].forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none')});return}
  if(map.getLayer('napr-addresses-layer'))map.setLayoutProperty('napr-addresses-layer','visibility','visible');
  if(map.getLayer('napr-settlements-layer'))map.setLayoutProperty('napr-settlements-layer','visibility','visible');
  updateNaprImage('napr-settlements','napr-settlements-layer',naprImage(NAPR_SETTLEMENT_WMS,'napr_au:AU.AB.Settelment'),.76);
  updateNaprImage('napr-addresses','napr-addresses-layer',naprImage(),.82);
}
function setNapr(enabled){
  naprEnabled=enabled;$('naprLayer').setAttribute('aria-pressed',String(enabled));$('naprCredit').hidden=!enabled;localStorage.setItem('chargerx-map-napr',String(enabled));
  ['napr-addresses-layer','napr-settlements-layer'].forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility',enabled?'visible':'none')});
  if(enabled){if(map.getZoom()<14)toast('ოფიციალური მისამართები ახლო მასშტაბზე გამოჩნდება');updateNaprOverlay()}
}

function addressTitle(result){return result.poi?.name||[result.address?.streetName,result.address?.streetNumber].filter(Boolean).join(' ')||result.address?.freeformAddress||'მისამართი'}
function addressSubtitle(result){return result.address?.freeformAddress||[result.address?.municipality,result.address?.country].filter(Boolean).join(', ')}
function searchHistory(){try{return JSON.parse(localStorage.getItem('chargerx-search-history')||'[]')}catch{return[]}}
function saveSearchHistory(result){const item={position:result.position,address:result.address||{},poi:result.poi||null},key=`${item.position.lat},${item.position.lon}`,history=[item,...searchHistory().filter(x=>`${x.position.lat},${x.position.lon}`!==key)].slice(0,6);localStorage.setItem('chargerx-search-history',JSON.stringify(history))}
function showSearchHistory(){const history=searchHistory();if(history.length)renderAddressResults(history)}
function setDarkMode(enabled){$('darkMode').setAttribute('aria-pressed',String(enabled));localStorage.setItem('chargerx-map-dark',String(enabled));if(enabled===darkModeEnabled)return;darkModeEnabled=enabled;map.setStyle(enabled?DARK_STYLE:LIGHT_STYLE)}
function renderAddressResults(results){const origin=userLocation||{lat:41.7151,lng:44.8271},ranked=[...results].sort((a,b)=>distance(origin,{lat:Number(a.position.lat),lng:Number(a.position.lon)})-distance(origin,{lat:Number(b.position.lat),lng:Number(b.position.lon)}));const root=$('addressResults');root.hidden=false;root.innerHTML=ranked.length?ranked.map((result,index)=>`<button class="address-result" data-address-result="${index}"><span>⌖</span><div><strong>${escapeHtml(addressTitle(result))}</strong><small>${escapeHtml(addressSubtitle(result))}</small></div></button>`).join(''):'<div class="address-empty">მისამართი ვერ მოიძებნა.</div>';root._results=ranked}
async function searchAddress(query){const location=userLocation||{lat:41.7151,lng:44.8271},params=new URLSearchParams({q:query,lat:String(location.lat),lon:String(location.lng)});try{const response=await fetch(`${SUPABASE_URL}/functions/v1/geo-search?${params}`);if(!response.ok)throw new Error();const data=await response.json();renderAddressResults(data.results||[])}catch(error){$('addressResults').hidden=true;toast('მისამართის ძიება ჯერ არ არის გამართული')}}
function chooseAddress(result){const lat=Number(result.position.lat),lng=Number(result.position.lon),name=addressTitle(result),address=addressSubtitle(result);saveSearchHistory(result);$('addressSearch').value=address;$('addressResults').hidden=true;$('routeCard').hidden=true;$('maneuverCard').hidden=true;if(!searchMarker){const element=document.createElement('div');element.className='search-location-marker';searchMarker=new maplibregl.Marker({element,anchor:'bottom'}).setLngLat([lng,lat]).addTo(map)}else searchMarker.setLngLat([lng,lat]);selected={id:null,name,address,city:'',lat,lng,type:'მისამართი',connectors:[],power:null,ports:'—',operator:'',hours:'—',price:'',notes:''};selectCharger(selected,true);$('chargerDetail').hidden=true;if(userLocation)setTimeout(buildRoute,350);else locateUser(false,true)}

function applyNightPalette(){if(!darkModeEnabled)return;if(map.getLayer('background'))map.setPaintProperty('background','background-color','#152541');map.getStyle().layers.forEach(layer=>{if(layer.type==='line'&&layer['source-layer']==='transportation'&&(layer.id.startsWith('highway_')||layer.id==='road_pier'))map.setPaintProperty(layer.id,'line-color','#3E5A77');if(layer.type==='symbol'&&layer['source-layer']==='transportation_name')map.setPaintProperty(layer.id,'text-color','#C2C8D3');if(layer.type==='fill'&&layer['source-layer']==='building')map.setPaintProperty(layer.id,'fill-color','#1B3B69')})}
function restoreMapLayers(){applyNightPalette();if(!map.getSource('active-route'))map.addSource('active-route',{type:'geojson',data:activeRouteFeature});if(!map.getLayer('active-route-line'))map.addLayer({id:'active-route-line',type:'line',source:'active-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#7428f5','line-width':7,'line-opacity':.95}});add3dLayers();if(naprEnabled)map.once('idle',updateNaprOverlay)}
map.on('style.load',restoreMapLayers);
map.on('load',()=>{$('networkStatus').textContent='ნავიგაცია მზად არის'});
map.on('load',startSpeedTracking);
map.on('load',()=>setNapr(localStorage.getItem('chargerx-map-napr')==='true'));
map.on('moveend',()=>{if(!naprEnabled)return;clearTimeout(naprUpdateTimer);naprUpdateTimer=setTimeout(updateNaprOverlay,250)});
$('chargerList').addEventListener('click',event=>{const item=event.target.closest('[data-charger]');if(item)selectCharger(chargers.find(x=>x.id===Number(item.dataset.charger)),true)});
$('addressSearch').addEventListener('focus',event=>{if(!event.target.value.trim())showSearchHistory()});
$('addressSearch').addEventListener('input',event=>{clearTimeout(searchTimer);const query=event.target.value.trim();if(!query){showSearchHistory();return}if(query.length<2){$('addressResults').hidden=true;return}searchTimer=setTimeout(()=>searchAddress(query),420)});
$('addressResults').addEventListener('click',event=>{const button=event.target.closest('[data-address-result]');if(button)chooseAddress($('addressResults')._results[Number(button.dataset.addressResult)])});
document.addEventListener('click',event=>{if(!event.target.closest('.address-search-wrap'))$('addressResults').hidden=true});
$('naprLayer').onclick=()=>setNapr(!naprEnabled);
$('darkMode').onclick=()=>setDarkMode(!darkModeEnabled);
$('routeGo').onclick=()=>{if(!routeActive){if(userLocation)buildRoute();else locateUser();return}navigationStarted=true;$('routeCard').classList.add('running');updateNavigationInstruction();$('maneuverCard').hidden=false;if(userLocation)map.easeTo({center:[userLocation.lng,userLocation.lat],zoom:17,pitch:is3d?55:42,bearing:map.getBearing(),duration:800});toast('ნავიგაცია დაწყებულია')};
setDarkMode(localStorage.getItem('chargerx-map-dark')==='true');
$('panelToggle').onclick=()=>{const closed=$('chargerPanel').classList.toggle('closed');$('panelToggle').setAttribute('aria-label',closed?'პანელის გახსნა':'პანელის დამალვა')};$('locateButton').onclick=()=>locateUser();$('sortNearest').onclick=()=>locateUser();$('mode3d').onclick=()=>set3d(!is3d);$('resetNorth').onclick=()=>map.easeTo({bearing:0,pitch:is3d?55:0});$('detailClose').onclick=()=>{$('chargerDetail').hidden=true;selected=null;markers.forEach(x=>x.element.classList.remove('active'));renderList()};$('routeButton').onclick=buildRoute;$('routeClose').onclick=()=>{navigationStarted=false;routeActive=false;routeGuidance=[];guidanceIndex=0;activeRouteFeature={type:'Feature',geometry:{type:'LineString',coordinates:[]},properties:{}};map.getSource('active-route')?.setData(activeRouteFeature);$('routeCard').classList.remove('running');$('routeCard').hidden=true;$('maneuverCard').hidden=true;document.body.classList.remove('navigation-active')};
