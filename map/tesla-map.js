const SUPABASE_URL=window.CHARGERX_SUPABASE.url;
const SUPABASE_KEY=window.CHARGERX_SUPABASE.publishableKey;
const GEORGIA_CENTER=[43.45,42.05];
const VOYAGER_STYLE={version:8,sources:{voyager:{type:'raster',tiles:['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png','https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png','https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'],tileSize:256,attribution:'© OpenStreetMap © CARTO'}},layers:[{id:'voyager',type:'raster',source:'voyager'}]};
const map=new maplibregl.Map({container:'map',style:VOYAGER_STYLE,center:GEORGIA_CENTER,zoom:7,pitch:0,bearing:0,maxPitch:75,attributionControl:false});
map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-left');

let chargers=[],markers=[],selected=null,userLocation=null,userMarker=null,is3d=false,routeActive=false,searchMarker=null,searchTimer=null;
let trackingStarted=false,lastTrackPoint=null,firstGpsFix=true;
let naprEnabled=false,naprUpdateTimer=null;
const NAPR_WMS='https://gpv0.napr.gov.ge/inspirevs/napr_ad/ows';
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

function locateUser(showMessage=true){if(!navigator.geolocation){toast('GPS ამ ბრაუზერში მიუწვდომელია');return}navigator.geolocation.getCurrentPosition(position=>{userLocation={lat:position.coords.latitude,lng:position.coords.longitude};if(!userMarker){const el=document.createElement('div');el.className='user-location';el.style.cssText='width:22px;height:22px;border:4px solid white;border-radius:50%;background:#287cf5;box-shadow:0 0 0 8px #287cf533';userMarker=new maplibregl.Marker({element:el}).setLngLat([userLocation.lng,userLocation.lat]).addTo(map)}else userMarker.setLngLat([userLocation.lng,userLocation.lat]);map.easeTo({center:[userLocation.lng,userLocation.lat],zoom:15,pitch:is3d?50:0});renderList();if(showMessage)toast('მდებარეობა განახლებულია')},()=>toast('მდებარეობის მიღება ვერ მოხერხდა'),{enableHighAccuracy:true,timeout:10000,maximumAge:30000})}

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
    if(!userMarker){const el=document.createElement('div');el.className='user-location';el.style.cssText='width:22px;height:22px;border:4px solid white;border-radius:50%;background:#287cf5;box-shadow:0 0 0 8px #287cf533';userMarker=new maplibregl.Marker({element:el}).setLngLat([point.lng,point.lat]).addTo(map)}else userMarker.setLngLat([point.lng,point.lat]);
    if(firstGpsFix){firstGpsFix=false;map.easeTo({center:[point.lng,point.lat],zoom:15,duration:700})}
  },()=>{$('networkStatus').textContent='GPS მიუწვდომელია'},{enableHighAccuracy:true,maximumAge:1000,timeout:15000});
}

async function buildRoute(){if(!selected)return;if(!userLocation){toast('ჯერ ჩართე მიმდინარე მდებარეობა');locateUser(false);return}$('routeButton').textContent='იგეგმება…';try{const params=new URLSearchParams({from:`${userLocation.lat},${userLocation.lng}`,to:`${selected.lat},${selected.lng}`});const response=await fetch(`${SUPABASE_URL}/functions/v1/route?${params}`);if(!response.ok)throw new Error('No route');const route=await response.json(),source=map.getSource('active-route');source.setData({type:'Feature',geometry:route.geometry,properties:{}});routeActive=true;$('routeDistance').textContent=km(route.distance);$('routeDuration').textContent=`დაახლოებით ${Math.round(route.duration/60)} წუთი`;$('routeCard').hidden=false;$('chargerDetail').hidden=true;const bounds=new maplibregl.LngLatBounds();route.geometry.coordinates.forEach(x=>bounds.extend(x));map.fitBounds(bounds,{padding:{top:110,right:90,bottom:100,left:innerWidth>850?450:90},maxZoom:15,duration:1000})}catch(error){toast('მარშრუტის აგება ვერ მოხერხდა')}finally{$('routeButton').textContent='მარშრუტი'}}

function set3d(enabled){is3d=enabled;$('mode3d').setAttribute('aria-pressed',String(enabled));localStorage.setItem('chargerx-map-3d',String(enabled));if(enabled){if(map.getSource('terrain-dem'))map.setTerrain({source:'terrain-dem',exaggeration:1.15});map.easeTo({pitch:55,bearing:-12,duration:800})}else{map.setTerrain(null);map.easeTo({pitch:0,bearing:0,duration:700})}}
function add3dLayers(){if(!map.getSource('terrain-dem'))map.addSource('terrain-dem',{type:'raster-dem',url:'https://tiles.mapterhorn.com/tilejson.json',tileSize:512,maxzoom:14});const vectorSource=Object.entries(map.getStyle().sources).find(([,source])=>source.type==='vector')?.[0];if(vectorSource&&!map.getLayer('chargerx-3d-buildings')){try{map.addLayer({id:'chargerx-3d-buildings',source:vectorSource,'source-layer':'building',type:'fill-extrusion',minzoom:14,paint:{'fill-extrusion-color':['interpolate',['linear'],['get','render_height'],0,'#d9dde0',80,'#aeb7bd'],'fill-extrusion-height':['coalesce',['get','render_height'],['get','height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.78}})}catch(error){console.warn('3D buildings layer unavailable',error)}}if(localStorage.getItem('chargerx-map-3d')==='true')set3d(true)}

function naprImage(){
  const bounds=map.getBounds(),west=bounds.getWest(),south=bounds.getSouth(),east=bounds.getEast(),north=bounds.getNorth();
  const width=Math.min(1400,Math.max(512,Math.round(map.getCanvas().clientWidth*window.devicePixelRatio)));
  const height=Math.min(1400,Math.max(512,Math.round(map.getCanvas().clientHeight*window.devicePixelRatio)));
  const params=new URLSearchParams({service:'WMS',version:'1.3.0',request:'GetMap',layers:'napr_ad:AD.NamedStreets,napr_ad:AD.Address',styles:'',crs:'CRS:84',bbox:`${west},${south},${east},${north}`,width:String(width),height:String(height),format:'image/png',transparent:'true'});
  return{url:`${NAPR_WMS}?${params}`,coordinates:[[west,north],[east,north],[east,south],[west,south]]};
}
function updateNaprOverlay(){
  if(!naprEnabled||!map.loaded())return;
  const image=naprImage(),source=map.getSource('napr-addresses');
  if(source){source.updateImage(image);return}
  map.addSource('napr-addresses',{type:'image',...image});
  map.addLayer({id:'napr-addresses-layer',type:'raster',source:'napr-addresses',paint:{'raster-opacity':.82,'raster-fade-duration':0}},map.getLayer('active-route-line')?'active-route-line':undefined);
}
function setNapr(enabled){
  naprEnabled=enabled;$('naprLayer').setAttribute('aria-pressed',String(enabled));$('naprCredit').hidden=!enabled;localStorage.setItem('chargerx-map-napr',String(enabled));
  if(map.getLayer('napr-addresses-layer'))map.setLayoutProperty('napr-addresses-layer','visibility',enabled?'visible':'none');
  if(enabled)updateNaprOverlay();
}

function addressTitle(result){return result.poi?.name||[result.address?.streetName,result.address?.streetNumber].filter(Boolean).join(' ')||result.address?.freeformAddress||'მისამართი'}
function addressSubtitle(result){return result.address?.freeformAddress||[result.address?.municipality,result.address?.country].filter(Boolean).join(', ')}
function renderAddressResults(results){const origin=userLocation||{lat:41.7151,lng:44.8271},ranked=[...results].sort((a,b)=>distance(origin,{lat:Number(a.position.lat),lng:Number(a.position.lon)})-distance(origin,{lat:Number(b.position.lat),lng:Number(b.position.lon)}));const root=$('addressResults');root.hidden=false;root.innerHTML=ranked.length?ranked.map((result,index)=>`<button class="address-result" data-address-result="${index}"><span>⌖</span><div><strong>${escapeHtml(addressTitle(result))}</strong><small>${escapeHtml(addressSubtitle(result))}</small></div></button>`).join(''):'<div class="address-empty">მისამართი ვერ მოიძებნა.</div>';root._results=ranked}
async function searchAddress(query){const location=userLocation||{lat:41.7151,lng:44.8271},params=new URLSearchParams({q:query,lat:String(location.lat),lon:String(location.lng)});try{const response=await fetch(`${SUPABASE_URL}/functions/v1/geo-search?${params}`);if(!response.ok)throw new Error();const data=await response.json();renderAddressResults(data.results||[])}catch(error){$('addressResults').hidden=true;toast('მისამართის ძიება ჯერ არ არის გამართული')}}
function chooseAddress(result){const lat=Number(result.position.lat),lng=Number(result.position.lon),name=addressTitle(result),address=addressSubtitle(result);$('addressSearch').value=address;$('addressResults').hidden=true;if(!searchMarker){const element=document.createElement('div');element.className='search-location-marker';searchMarker=new maplibregl.Marker({element,anchor:'bottom'}).setLngLat([lng,lat]).addTo(map)}else searchMarker.setLngLat([lng,lat]);selected={id:null,name,address,city:'',lat,lng,type:'მისამართი',connectors:[],power:null,ports:'—',operator:'',hours:'—',price:'',notes:''};selectCharger(selected,true);if(userLocation)setTimeout(buildRoute,350);else toast('GPS-ის მიღების შემდეგ დააჭირე „მარშრუტს“')}

map.on('load',()=>{map.addSource('active-route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[]},properties:{}}});map.addLayer({id:'active-route-line',type:'line',source:'active-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#e82127','line-width':7,'line-opacity':.95}});add3dLayers();$('networkStatus').textContent='ნავიგაცია მზად არის'});
map.on('load',startSpeedTracking);
map.on('load',()=>setNapr(localStorage.getItem('chargerx-map-napr')==='true'));
map.on('moveend',()=>{if(!naprEnabled)return;clearTimeout(naprUpdateTimer);naprUpdateTimer=setTimeout(updateNaprOverlay,250)});
$('chargerList').addEventListener('click',event=>{const item=event.target.closest('[data-charger]');if(item)selectCharger(chargers.find(x=>x.id===Number(item.dataset.charger)),true)});
$('addressSearch').addEventListener('input',event=>{clearTimeout(searchTimer);const query=event.target.value.trim();if(query.length<2){$('addressResults').hidden=true;return}searchTimer=setTimeout(()=>searchAddress(query),420)});
$('addressResults').addEventListener('click',event=>{const button=event.target.closest('[data-address-result]');if(button)chooseAddress($('addressResults')._results[Number(button.dataset.addressResult)])});
document.addEventListener('click',event=>{if(!event.target.closest('.address-search-wrap'))$('addressResults').hidden=true});
$('naprLayer').onclick=()=>setNapr(!naprEnabled);
$('panelToggle').onclick=()=>{const closed=$('chargerPanel').classList.toggle('closed');$('panelToggle').setAttribute('aria-label',closed?'პანელის გახსნა':'პანელის დამალვა')};$('locateButton').onclick=()=>locateUser();$('sortNearest').onclick=()=>locateUser();$('mode3d').onclick=()=>set3d(!is3d);$('resetNorth').onclick=()=>map.easeTo({bearing:0,pitch:is3d?55:0});$('detailClose').onclick=()=>{$('chargerDetail').hidden=true;selected=null;markers.forEach(x=>x.element.classList.remove('active'));renderList()};$('routeButton').onclick=buildRoute;$('routeClose').onclick=()=>{map.getSource('active-route')?.setData({type:'Feature',geometry:{type:'LineString',coordinates:[]},properties:{}});routeActive=false;$('routeCard').hidden=true};
