let map,autocomplete,directionsService,directionsRenderer,currentPosition,userMarker,currentLeg,watchId,currentStepIndex=0,hasInitialFocus=false,trafficLayer,lastHeading=0;
let darkMode=false,is3d=false,trafficVisible=false;
let markerStyle=localStorage.getItem('chargerx-marker-style')||'model-3';
let markerColor=/^#[0-9a-f]{6}$/i.test(localStorage.getItem('chargerx-marker-color')||'')?localStorage.getItem('chargerx-marker-color'):'#e82127';
const defaultCenter={lat:41.7151,lng:44.8271};
const message=text=>{const el=document.getElementById('mapMessage');el.textContent=text;el.hidden=false;clearTimeout(message.timer);message.timer=setTimeout(()=>el.hidden=true,3500)};

async function loadGoogleMaps(){
  try{
    const config=window.CHARGERX_SUPABASE;
    const response=await fetch(`${config.url}/functions/v1/google-maps-config`,{headers:{apikey:config.publishableKey,authorization:`Bearer ${config.publishableKey}`}});
    if(!response.ok)throw new Error('config');
    const {key}=await response.json();
    const script=document.createElement('script');
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places,geometry&language=ka&region=GE&callback=initGoogleMap`;
    script.async=true;script.onerror=()=>message('Google Maps ვერ ჩაიტვირთა');document.head.appendChild(script);
  }catch{message('რუკის კონფიგურაცია მიუწვდომელია')}
}

window.initGoogleMap=function(){
  createMap();
  trafficLayer=new google.maps.TrafficLayer();
  directionsService=new google.maps.DirectionsService();
  directionsRenderer=new google.maps.DirectionsRenderer({map,polylineOptions:{strokeColor:'#1a73e8',strokeWeight:8}});
  autocomplete=new google.maps.places.Autocomplete(document.getElementById('destination'),{componentRestrictions:{country:'ge'},fields:['geometry','formatted_address','name']});
  autocomplete.bindTo('bounds',map);
  autocomplete.addListener('place_changed',()=>{const place=autocomplete.getPlace();if(place.geometry?.location)buildRoute(place.geometry.location)});
  document.getElementById('routeForm').addEventListener('submit',event=>{event.preventDefault();const place=autocomplete.getPlace();if(place.geometry?.location)buildRoute(place.geometry.location);else message('აირჩიეთ მისამართი Google-ის შედეგებიდან')});
  document.getElementById('locateButton').addEventListener('click',()=>focusLocation());
  document.getElementById('themeButton').addEventListener('click',toggleTheme);
  document.getElementById('mode3dButton').addEventListener('click',toggle3d);
  document.getElementById('trafficButton').addEventListener('click',toggleTraffic);
  document.getElementById('startRoute').addEventListener('click',startNavigation);
  document.getElementById('closeRoute').addEventListener('click',clearRoute);
  setupMarkerPicker();
  watchLocation();
};

function createMap(){
  const center=map?.getCenter()||currentPosition||defaultCenter,zoom=map?.getZoom()||13,savedRoute=directionsRenderer?.getDirections();
  map=new google.maps.Map(document.getElementById('map'),{center,zoom,disableDefaultUI:true,gestureHandling:'greedy',isFractionalZoomEnabled:true,renderingType:google.maps.RenderingType.VECTOR,colorScheme:darkMode?google.maps.ColorScheme.DARK:google.maps.ColorScheme.LIGHT,headingInteractionEnabled:true,tiltInteractionEnabled:true,tilt:is3d?60:0});
  if(directionsRenderer){directionsRenderer.setMap(map);if(savedRoute)directionsRenderer.setDirections(savedRoute)}
  if(userMarker)userMarker.setMap(map);
  if(trafficVisible)trafficLayer?.setMap(map);
  autocomplete?.bindTo('bounds',map);
}

const vehicleImages={};
function loadVehicle(model){return vehicleImages[model]||(vehicleImages[model]=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=`/map/vehicles/${model}.png`}))}
async function teslaIcon(heading=0){
  if(markerStyle==='arrow'){
    const depth=is3d?'.68':'1',svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(32 32) rotate(${heading}) scale(1 ${depth}) translate(-32 -32)"><path d="M32 5 51 53 32 44 13 53z" fill="${markerColor}" stroke="#fff" stroke-width="3"/></g></svg>`;
    return{url:`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,scaledSize:new google.maps.Size(82,82),anchor:new google.maps.Point(41,41)};
  }
  const image=await loadVehicle(markerStyle),paint=document.createElement('canvas'),pctx=paint.getContext('2d');paint.width=64;paint.height=96;pctx.drawImage(image,0,0,64,96);pctx.globalCompositeOperation='multiply';pctx.fillStyle=markerColor;pctx.fillRect(0,0,64,96);pctx.globalCompositeOperation='destination-in';pctx.drawImage(image,0,0,64,96);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=160;canvas.height=160;ctx.translate(80,80);ctx.rotate(heading*Math.PI/180);ctx.scale(1,is3d?.7:1);ctx.shadowColor=darkMode?'rgba(255,255,255,.9)':'rgba(0,0,0,.95)';ctx.shadowBlur=12;ctx.shadowOffsetY=3;ctx.drawImage(paint,-34,-51,68,102);
  return{url:canvas.toDataURL('image/png'),scaledSize:new google.maps.Size(96,96),anchor:new google.maps.Point(48,48)};
}

let iconRenderId=0;
async function updateLocationIcon(){const renderId=++iconRenderId,screenHeading=document.body.classList.contains('navigating')?0:lastHeading;try{const icon=await teslaIcon(screenHeading);if(renderId!==iconRenderId)return;userMarker?.setIcon(icon);const preview=document.getElementById('locateIcon');if(preview)preview.src=icon.url}catch{message('მანქანის ნიშნული ვერ ჩაიტვირთა')}}

function setupMarkerPicker(){
  const colorInput=document.getElementById('markerColor'),picker=document.getElementById('markerPicker'),toggle=document.getElementById('markerPickerButton');colorInput.value=markerColor;
  const updateButtons=()=>document.querySelectorAll('[data-marker]').forEach(button=>button.classList.toggle('active',button.dataset.marker===markerStyle));
  updateButtons();updateLocationIcon();
  toggle.addEventListener('click',()=>{picker.hidden=!picker.hidden;toggle.classList.toggle('active',!picker.hidden);toggle.setAttribute('aria-expanded',String(!picker.hidden))});
  document.querySelector('.marker-options').addEventListener('click',event=>{const button=event.target.closest('[data-marker]');if(!button)return;markerStyle=button.dataset.marker;localStorage.setItem('chargerx-marker-style',markerStyle);updateButtons();updateLocationIcon();picker.hidden=true;toggle.classList.remove('active');toggle.setAttribute('aria-expanded','false')});
  colorInput.addEventListener('input',()=>{markerColor=colorInput.value;localStorage.setItem('chargerx-marker-color',markerColor);updateLocationIcon()});
}

function watchLocation(){
  if(!navigator.geolocation)return message('მდებარეობის სერვისი მიუწვდომელია');
  watchId=navigator.geolocation.watchPosition(position=>{
    const previousPosition=currentPosition;
    currentPosition={lat:position.coords.latitude,lng:position.coords.longitude};
    document.getElementById('speedValue').textContent=Math.max(0,Math.round((position.coords.speed||0)*3.6));
    if(Number.isFinite(position.coords.heading))lastHeading=position.coords.heading;else if(previousPosition&&google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(previousPosition),new google.maps.LatLng(currentPosition))>2)lastHeading=google.maps.geometry.spherical.computeHeading(new google.maps.LatLng(previousPosition),new google.maps.LatLng(currentPosition));
    if(userMarker)userMarker.setPosition(currentPosition);else userMarker=new google.maps.Marker({map,position:currentPosition,title:'ჩემი მდებარეობა',zIndex:1000});updateLocationIcon();
    if(!hasInitialFocus){hasInitialFocus=true;map.panTo(currentPosition);map.setZoom(17)}
    if(document.body.classList.contains('navigating')){map.moveCamera({center:currentPosition,heading:lastHeading,tilt:60,zoom:18});updateLocationIcon();updateManeuver()}
  },()=>message('ჩართეთ მდებარეობაზე წვდომა'),{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
}

function focusLocation(){if(!currentPosition)return message('მდებარეობა ჯერ არ არის მიღებული');map.panTo(currentPosition);map.setZoom(17)}
function buildRoute(destination){
  directionsService.route({origin:currentPosition||defaultCenter,destination,travelMode:google.maps.TravelMode.DRIVING},(result,status)=>{
    if(status!=='OK')return message('მარშრუტის აგება ვერ მოხერხდა');
    directionsRenderer.setDirections(result);currentLeg=result.routes[0].legs[0];currentStepIndex=0;
    document.getElementById('routeDistance').textContent=currentLeg.distance?.text||'—';document.getElementById('routeDuration').textContent=currentLeg.duration?.text||'—';document.getElementById('routeArrival').textContent=new Date(Date.now()+(currentLeg.duration?.value||0)*1000).toLocaleTimeString('ka-GE',{hour:'2-digit',minute:'2-digit'});document.getElementById('routeSummary').hidden=false;
  });
}
function startNavigation(){if(!currentLeg)return;is3d=true;document.body.classList.add('navigating');document.getElementById('maneuver').hidden=false;document.getElementById('mode3dButton').classList.add('active');map.moveCamera({center:currentPosition||map.getCenter(),zoom:18,tilt:60,heading:lastHeading});updateLocationIcon();updateManeuver()}
function updateManeuver(){
  if(!currentLeg?.steps?.length||!currentPosition)return;let step=currentLeg.steps[currentStepIndex];let distance=google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(currentPosition),step.end_location);
  if(distance<30&&currentStepIndex<currentLeg.steps.length-1){currentStepIndex++;step=currentLeg.steps[currentStepIndex];distance=google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(currentPosition),step.end_location)}
  const nextStep=currentLeg.steps[currentStepIndex+1];document.getElementById('maneuverDistance').textContent=distance?`${Math.round(distance)} მ`:(step.distance?.text||'—');document.getElementById('maneuverText').textContent=step.instructions.replace(/<[^>]+>/g,' ');document.getElementById('maneuverNext').textContent=nextStep?`შემდეგ: ${nextStep.instructions.replace(/<[^>]+>/g,' ')}`:'დანიშნულების ადგილი წინ არის';
  document.getElementById('maneuverArrow').textContent=/left/i.test(step.maneuver||'')?'←':/right/i.test(step.maneuver||'')?'→':'↑';
}
function toggleTheme(){darkMode=!darkMode;document.body.classList.toggle('dark',darkMode);createMap();updateLocationIcon();document.getElementById('themeButton').textContent=darkMode?'☀':'☾'}
function toggle3d(){is3d=!is3d;if(is3d&&map.getZoom()<18)map.setZoom(18);map.setTilt(is3d?60:0);updateLocationIcon();document.getElementById('mode3dButton').classList.toggle('active',is3d)}
function toggleTraffic(){trafficVisible=!trafficVisible;trafficLayer.setMap(trafficVisible?map:null);document.getElementById('trafficButton').classList.toggle('active',trafficVisible)}
function clearRoute(){directionsRenderer.set('directions',null);currentLeg=null;currentStepIndex=0;document.body.classList.remove('navigating');map.setHeading(0);updateLocationIcon();document.getElementById('routeSummary').hidden=true;document.getElementById('maneuver').hidden=true;document.getElementById('destination').value=''}
loadGoogleMaps();
