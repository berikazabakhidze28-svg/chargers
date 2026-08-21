let map,autocomplete,directionsService,directionsRenderer,currentPosition,userMarker,currentLeg,currentDirectionsResult,currentRouteIndex=0,routePolylines=[],watchId,currentStepIndex=0,hasInitialFocus=false,trafficLayer,lastHeading=0,smoothedHeading=0,currentSpeedKmh=0,manualDestinationMarker,placesService,selectedPlacePosition;
const timeWantsDark=()=>{const hour=new Date().getHours();return hour>=19||hour<7};
let autoDarkMode=localStorage.getItem('chargerx-map-auto-dark')==='true';
let darkMode=autoDarkMode?timeWantsDark():localStorage.getItem('chargerx-map-dark')==='true',is3d=localStorage.getItem('chargerx-map-3d')==='true',trafficVisible=localStorage.getItem('chargerx-map-traffic')==='true',navigationFollowing=true;
let markerStyle=localStorage.getItem('chargerx-marker-style')||'model-3';
let markerColor=/^#[0-9a-f]{6}$/i.test(localStorage.getItem('chargerx-marker-color')||'')?localStorage.getItem('chargerx-marker-color'):'#e82127';
const mapLanguage=['ka','en','ru'].includes(localStorage.getItem('chargerx-language'))?localStorage.getItem('chargerx-language'):'ka';
const mapLocale={ka:'ka-GE',en:'en-US',ru:'ru-RU'}[mapLanguage];
const mapUnitM={ka:'მ',en:'m',ru:'м'}[mapLanguage];
const mapCopy={ka:{next:'შემდეგ:',ahead:'დანიშნულების ადგილი წინ არის',route:'მარშრუტი',destination:'დანიშნულების ადგილი'},en:{next:'Next:',ahead:'The destination is ahead',route:'Route',destination:'Destination'},ru:{next:'Далее:',ahead:'Пункт назначения впереди',route:'Маршрут',destination:'Пункт назначения'}}[mapLanguage];
const defaultCenter={lat:41.7151,lng:44.8271};
const message=text=>{const el=document.getElementById('mapMessage');el.textContent=text;el.hidden=false;clearTimeout(message.timer);message.timer=setTimeout(()=>el.hidden=true,3500)};
async function loadGoogleMaps(){
  try{
    const config=window.CHARGERX_SUPABASE;
    const response=await fetch(`${config.url}/functions/v1/google-maps-config`,{headers:{apikey:config.publishableKey,authorization:`Bearer ${config.publishableKey}`}});
    if(!response.ok)throw new Error('config');
    const {key}=await response.json();
    const script=document.createElement('script');
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places,geometry&language=${mapLanguage}&region=GE&callback=initGoogleMap`;
    script.async=true;script.onerror=()=>message('Google Maps ვერ ჩაიტვირთა');document.head.appendChild(script);
  }catch{message('რუკის კონფიგურაცია მიუწვდომელია')}
}
window.initGoogleMap=function(){
  createMap();
  watchLocation();
  setupMarkerPicker();
  trafficLayer=new google.maps.TrafficLayer();if(trafficVisible)trafficLayer.setMap(map);document.getElementById('mode3dButton').classList.toggle('active',is3d);document.getElementById('trafficButton').classList.toggle('active',trafficVisible);
  directionsService=new google.maps.DirectionsService();
  directionsRenderer=new google.maps.DirectionsRenderer({map,suppressPolylines:true});
  autocomplete=new google.maps.places.Autocomplete(document.getElementById('destination'),{componentRestrictions:{country:'ge'},fields:['geometry','formatted_address','name']});
  autocomplete.bindTo('bounds',map);
  autocomplete.addListener('place_changed',()=>{const place=autocomplete.getPlace();if(place.geometry?.location)buildRoute(place.geometry.location)});
  document.getElementById('routeForm').addEventListener('submit',event=>{event.preventDefault();const place=autocomplete.getPlace();if(place.geometry?.location)buildRoute(place.geometry.location);else message('აირჩიეთ მისამართი Google-ის შედეგებიდან')});
  document.getElementById('locateButton')?.addEventListener('click',focusLocation);
  document.getElementById('themeButton').addEventListener('click',toggleTheme);
  document.getElementById('mode3dButton').addEventListener('click',toggle3d);
  document.getElementById('trafficButton').addEventListener('click',toggleTraffic);
  document.getElementById('startRoute').addEventListener('click',startNavigation);
  document.getElementById('moreRoutes').addEventListener('click',()=>{const options=document.getElementById('routeOptions');options.hidden=!options.hidden});
  document.getElementById('routeOptions').addEventListener('click',event=>{const option=event.target.closest('[data-route-index]');if(option)selectRoute(Number(option.dataset.routeIndex))});
  document.getElementById('closeRoute').addEventListener('click',clearRoute);
  document.getElementById('placeClose').addEventListener('click',hidePlaceCard);
  document.getElementById('placeDirections').addEventListener('click',()=>{if(selectedPlacePosition){const position=selectedPlacePosition,label=document.getElementById('placeName').textContent;hidePlaceCard();setManualDestination(position,label)}});
};
function createMap(){
  const center=map?.getCenter()||currentPosition||defaultCenter,zoom=map?.getZoom()||13,savedRoute=directionsRenderer?.getDirections();
  map=new google.maps.Map(document.getElementById('map'),{center,zoom,disableDefaultUI:true,gestureHandling:'greedy',isFractionalZoomEnabled:true,renderingType:google.maps.RenderingType.VECTOR,colorScheme:darkMode?google.maps.ColorScheme.DARK:google.maps.ColorScheme.LIGHT,headingInteractionEnabled:true,tiltInteractionEnabled:true,clickableIcons:true,tilt:is3d?60:0});
  if(directionsRenderer){directionsRenderer.setMap(map);if(savedRoute)directionsRenderer.setDirections(savedRoute)}
  if(userMarker)userMarker.setMap(map);
  if(manualDestinationMarker)manualDestinationMarker.setMap(map);
  routePolylines.forEach(line=>line.setMap(map));
  if(trafficVisible)trafficLayer?.setMap(map);
  placesService=new google.maps.places.PlacesService(map);
  autocomplete?.bindTo('bounds',map);
  map.addListener('click',event=>{if(document.body.classList.contains('navigating'))return;if(event.placeId){if(typeof event.stop==='function')event.stop();showPlaceCard(event.placeId,event.latLng)}else{hidePlaceCard();setManualDestination(event.latLng)}});
  map.addListener('dragstart',()=>{if(document.body.classList.contains('navigating'))navigationFollowing=false});
}
const vehicleImages={};
function loadVehicle(model){const variant=is3d?model+'-3d-v2':model;return vehicleImages[variant]||(vehicleImages[variant]=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=`/map/vehicles/${variant}.png`}))}
async function teslaIcon(heading=0){
  if(markerStyle==='arrow'){
    const depth=is3d?'.68':'1',svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(32 32) rotate(${heading}) scale(1 ${depth}) translate(-32 -32)"><path d="M32 5 51 53 32 44 13 53z" fill="${markerColor}" stroke="#fff" stroke-width="3"/></g></svg>`;
    return{url:`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,scaledSize:new google.maps.Size(82,82),anchor:new google.maps.Point(41,41)};
  }
  const image=await loadVehicle(markerStyle),paintWidth=is3d?96:64,paintHeight=96,paint=document.createElement('canvas'),pctx=paint.getContext('2d');paint.width=paintWidth;paint.height=paintHeight;pctx.drawImage(image,0,0,paintWidth,paintHeight);pctx.globalCompositeOperation='multiply';pctx.fillStyle=markerColor;pctx.fillRect(0,0,paintWidth,paintHeight);pctx.globalCompositeOperation='destination-in';pctx.drawImage(image,0,0,paintWidth,paintHeight);
  const drawWidth=is3d?96:68,drawHeight=is3d?96:102,angle=heading,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=180;canvas.height=180;ctx.translate(90,90);ctx.rotate(angle*Math.PI/180);ctx.shadowColor=darkMode?'rgba(255,255,255,.9)':'rgba(0,0,0,.95)';ctx.shadowBlur=12;ctx.shadowOffsetY=4;ctx.drawImage(paint,-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);
  return{url:canvas.toDataURL('image/png'),scaledSize:new google.maps.Size(108,108),anchor:new google.maps.Point(54,54)};
}
let iconRenderId=0;
async function updateLocationIcon(){const renderId=++iconRenderId,screenHeading=(is3d||document.body.classList.contains('navigating'))?0:lastHeading;try{const icon=await teslaIcon(screenHeading);if(renderId!==iconRenderId)return;userMarker?.setIcon(icon);const preview=document.getElementById('locateIcon');if(preview)preview.src=icon.url}catch{message('მანქანის ნიშნული ვერ ჩაიტვირთა')}}
function setupMarkerPicker(){
  const colorInput=document.getElementById('markerColor'),picker=document.getElementById('markerPicker'),toggle=document.getElementById('markerPickerButton');if(!colorInput||!picker||!toggle)return;colorInput.value=markerColor;
  const updateButtons=()=>document.querySelectorAll('[data-marker]').forEach(button=>button.classList.toggle('active',button.dataset.marker===markerStyle));
  updateButtons();updateLocationIcon();
  toggle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const opening=picker.hasAttribute('hidden');picker.toggleAttribute('hidden',!opening);toggle.classList.toggle('active',opening);toggle.setAttribute('aria-expanded',String(opening))});
  document.querySelector('.marker-options').addEventListener('click',event=>{const button=event.target.closest('[data-marker]');if(!button)return;markerStyle=button.dataset.marker;localStorage.setItem('chargerx-marker-style',markerStyle);updateButtons();updateLocationIcon();picker.hidden=true;toggle.classList.remove('active');toggle.setAttribute('aria-expanded','false')});
  const applyMarkerColor=()=>{markerColor=colorInput.value;localStorage.setItem('chargerx-marker-color',markerColor);updateLocationIcon()};colorInput.addEventListener('input',applyMarkerColor);colorInput.addEventListener('change',applyMarkerColor);
  const autoInput=document.getElementById('autoDarkMode');if(autoInput){autoInput.checked=autoDarkMode;autoInput.addEventListener('change',()=>{autoDarkMode=autoInput.checked;localStorage.setItem('chargerx-map-auto-dark',String(autoDarkMode));if(autoDarkMode)applyDarkMode(timeWantsDark())})}
}
function watchLocation(){
  if(!navigator.geolocation)return message('მდებარეობის სერვისი მიუწვდომელია');
  watchId=navigator.geolocation.watchPosition(position=>{
    const previousPosition=currentPosition;
    currentPosition={lat:position.coords.latitude,lng:position.coords.longitude};
    currentSpeedKmh=Math.max(0,(position.coords.speed||0)*3.6);document.getElementById('speedValue').textContent=Math.round(currentSpeedKmh);
    if(previousPosition&&google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(previousPosition),new google.maps.LatLng(currentPosition))>2)lastHeading=google.maps.geometry.spherical.computeHeading(new google.maps.LatLng(previousPosition),new google.maps.LatLng(currentPosition));else if((position.coords.speed||0)>1&&Number.isFinite(position.coords.heading))lastHeading=position.coords.heading;
    if(userMarker)userMarker.setPosition(currentPosition);else userMarker=new google.maps.Marker({map,position:currentPosition,title:'ჩემი მდებარეობა',zIndex:1000,clickable:false,keyboardShortcuts:false});updateLocationIcon();
    if(!hasInitialFocus){hasInitialFocus=true;map.panTo(currentPosition);map.setZoom(17)}
    if(document.body.classList.contains('navigating')){if(navigationFollowing)updateNavigationCamera();updateLocationIcon();updateManeuver()}else if(is3d){map.setHeading(lastHeading);updateLocationIcon()}
  },()=>message('ჩართეთ მდებარეობაზე წვდომა'),{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
}
function focusLocation(){if(!currentPosition)return message('მდებარეობა ჯერ არ არის მიღებული');if(document.body.classList.contains('navigating')){navigationFollowing=true;updateNavigationCamera()}else{map.panTo(currentPosition);map.setZoom(17)}}
function normalizedHeading(value){return(value%360+360)%360}
function smoothAngle(from,to,amount){const delta=((to-from+540)%360)-180;return normalizedHeading(from+delta*amount)}
function cardinalDirection(heading){return['N','NE','E','SE','S','SW','W','NW'][Math.round(normalizedHeading(heading)/45)%8]}
function updateNavigationCamera(){
  smoothedHeading=smoothAngle(smoothedHeading,lastHeading,.28);
  document.getElementById('headingValue').textContent=cardinalDirection(smoothedHeading);
  const lookAhead=Math.min(280,Math.max(90,110+currentSpeedKmh*2.2));
  const cameraCenter=google.maps.geometry.spherical.computeOffset(new google.maps.LatLng(currentPosition),lookAhead,smoothedHeading);
  const zoom=currentSpeedKmh>90?15.8:currentSpeedKmh>60?16.15:currentSpeedKmh>20?16.6:17.1;
  map.panTo(cameraCenter);map.setHeading(smoothedHeading);map.setTilt(is3d?60:0);map.setZoom(zoom);
}
function buildRoute(destination,manual=false){
  if(!manual&&manualDestinationMarker){manualDestinationMarker.setMap(null);manualDestinationMarker=null}
  directionsService.route({origin:currentPosition||defaultCenter,destination,travelMode:google.maps.TravelMode.DRIVING,provideRouteAlternatives:true},(result,status)=>{
    if(status!=='OK')return message('მარშრუტის აგება ვერ მოხერხდა');
    currentDirectionsResult=result;directionsRenderer.setDirections(result);renderRouteOptions(result.routes);selectRoute(0);document.getElementById('routeDestination').textContent=document.getElementById('destination').value||mapCopy.destination;document.getElementById('routeSummary').hidden=false;
  });
}
function renderRouteOptions(routes){
  routePolylines.forEach(line=>line.setMap(null));routePolylines=routes.map((route,index)=>{const line=new google.maps.Polyline({map,path:route.overview_path,strokeColor:index===0?'#1a73e8':'#657180',strokeOpacity:index===0?1:.75,strokeWeight:index===0?8:6,zIndex:index===0?20:10,clickable:true});line.addListener('click',()=>selectRoute(index));return line});
  const root=document.getElementById('routeOptions');root.innerHTML=routes.map((route,index)=>{const leg=route.legs[0],name=route.summary||(mapCopy.route+' '+(index+1));return`<button class="route-option${index===0?' active':''}" type="button" data-route-index="${index}"><span>${name}</span><small>${leg.duration?.text||'—'} · ${leg.distance?.text||'—'}</small></button>`}).join('');root.hidden=true;document.getElementById('moreRoutes').hidden=routes.length<2
}
function selectRoute(index){
  const route=currentDirectionsResult?.routes?.[index];if(!route)return;currentRouteIndex=index;currentLeg=route.legs[0];currentStepIndex=0;directionsRenderer.setRouteIndex(index);
  document.querySelectorAll('[data-route-index]').forEach(option=>option.classList.toggle('active',Number(option.dataset.routeIndex)===index));
  routePolylines.forEach((line,lineIndex)=>line.setOptions({strokeColor:lineIndex===index?'#1a73e8':'#657180',strokeOpacity:lineIndex===index?1:.75,strokeWeight:lineIndex===index?8:6,zIndex:lineIndex===index?20:10}));
  document.getElementById('routeDistance').textContent=currentLeg.distance?.text||'—';document.getElementById('routeDuration').textContent=currentLeg.duration?.text||'—';document.getElementById('routeArrival').textContent=new Date(Date.now()+(currentLeg.duration?.value||0)*1000).toLocaleTimeString(mapLocale,{hour:'2-digit',minute:'2-digit'});
}
function startNavigation(){if(!currentLeg)return;navigationFollowing=true;smoothedHeading=normalizedHeading(lastHeading);routePolylines.forEach((line,index)=>line.setVisible(index===currentRouteIndex));document.body.classList.add('navigating');document.getElementById('maneuver').hidden=false;document.getElementById('routeOptions').hidden=true;if(currentPosition)updateNavigationCamera();else map.moveCamera({center:map.getCenter(),zoom:17.1,tilt:is3d?60:0,heading:lastHeading});updateLocationIcon();updateManeuver()}
function updateManeuver(){
  if(!currentLeg?.steps?.length||!currentPosition)return;let step=currentLeg.steps[currentStepIndex];let distance=google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(currentPosition),step.end_location);
  if(distance<30&&currentStepIndex<currentLeg.steps.length-1){currentStepIndex++;step=currentLeg.steps[currentStepIndex];distance=google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(currentPosition),step.end_location)}
  const nextStep=currentLeg.steps[currentStepIndex+1];document.getElementById('maneuverDistance').textContent=distance?(Math.round(distance)+' '+mapUnitM):(step.distance?.text||'—');document.getElementById('maneuverText').textContent=step.instructions.replace(/<[^>]+>/g,' ');document.getElementById('maneuverNext').textContent=nextStep?(mapCopy.next+' '+nextStep.instructions.replace(/<[^>]+>/g,' ')):mapCopy.ahead;
  document.getElementById('maneuverArrow').textContent=/left/i.test(step.maneuver||'')?'←':/right/i.test(step.maneuver||'')?'→':'↑';
}
function applyDarkMode(next){if(darkMode===next)return;darkMode=next;document.body.classList.toggle('dark',darkMode);localStorage.setItem('chargerx-map-dark',String(darkMode));createMap();updateLocationIcon();document.getElementById('themeButton').textContent=darkMode?'☀':'☾'}
function toggleTheme(){autoDarkMode=false;localStorage.setItem('chargerx-map-auto-dark','false');const autoInput=document.getElementById('autoDarkMode');if(autoInput)autoInput.checked=false;applyDarkMode(!darkMode)}
setInterval(()=>{if(autoDarkMode)applyDarkMode(timeWantsDark())},60000);
function toggle3d(){is3d=!is3d;localStorage.setItem('chargerx-map-3d',String(is3d));if(is3d&&map.getZoom()<18)map.setZoom(18);map.setHeading(is3d?lastHeading:0);map.setTilt(is3d?60:0);updateLocationIcon();document.getElementById('mode3dButton').classList.toggle('active',is3d)}
function toggleTraffic(){trafficVisible=!trafficVisible;localStorage.setItem('chargerx-map-traffic',String(trafficVisible));trafficLayer.setMap(trafficVisible?map:null);document.getElementById('trafficButton').classList.toggle('active',trafficVisible)}
function setManualDestination(position,label='რუკაზე არჩეული ადგილი'){
  if(manualDestinationMarker)manualDestinationMarker.setPosition(position);else manualDestinationMarker=new google.maps.Marker({map,position,title:'დანიშნულების ადგილი',zIndex:900});
  document.getElementById('destination').value=label;buildRoute(position,true);
}
function showPlaceCard(placeId,fallbackPosition){
  placesService.getDetails({placeId,fields:['name','formatted_address','geometry']},(place,status)=>{
    if(status!==google.maps.places.PlacesServiceStatus.OK)return setManualDestination(fallbackPosition);
    selectedPlacePosition=place.geometry?.location||fallbackPosition;document.getElementById('placeName').textContent=place.name||'არჩეული ობიექტი';document.getElementById('placeAddress').textContent=place.formatted_address||'მისამართი არ არის მითითებული';document.getElementById('placeCard').hidden=false;
  });
}
function hidePlaceCard(){selectedPlacePosition=null;document.getElementById('placeCard').hidden=true}
function clearRoute(){document.body.classList.remove('navigating');document.getElementById('routeSummary').hidden=true;document.getElementById('routeOptions').hidden=true;document.getElementById('maneuver').hidden=true;routePolylines.forEach(line=>line.setMap(null));routePolylines=[];directionsRenderer?.setMap(null);directionsRenderer=new google.maps.DirectionsRenderer({map,suppressPolylines:true});currentLeg=null;currentDirectionsResult=null;currentRouteIndex=0;currentStepIndex=0;navigationFollowing=true;hidePlaceCard();manualDestinationMarker?.setMap(null);manualDestinationMarker=null;document.getElementById('destination').value=String();if(currentPosition){map.moveCamera({center:currentPosition,zoom:17,heading:is3d?lastHeading:0,tilt:is3d?60:0})}else{map.setHeading(is3d?lastHeading:0)}updateLocationIcon()}
loadGoogleMaps();
