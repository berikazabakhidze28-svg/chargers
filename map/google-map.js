let map,autocomplete,directionsService,directionsRenderer,currentPosition,userMarker,currentLeg,watchId,currentStepIndex=0,hasInitialFocus=false,trafficLayer,lastHeading=0;
let darkMode=false,is3d=false,trafficVisible=false;
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

function teslaIcon(heading=0){
  const depth=is3d?'.68':'1',svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(32 32) rotate(${heading}) scale(1 ${depth}) translate(-32 -32)"><ellipse cx="32" cy="35" rx="17" ry="23" fill="#000" opacity=".25"/><path d="M32 5c-9 0-14 6-16 17l-2 24c0 8 6 13 18 13s18-5 18-13l-2-24C46 11 41 5 32 5z" fill="#e82127" stroke="#fff" stroke-width="2"/><path d="M22 23c2-8 5-11 10-11s8 3 10 11l-3 7H25z" fill="#9fd4ff"/><path d="M22 35h20l2 13H20z" fill="#b5161c"/><path d="M27 18h10l-5 8z" fill="#fff"/><circle cx="18" cy="25" r="2" fill="#ffd966"/><circle cx="46" cy="25" r="2" fill="#ffd966"/></g></svg>`;
  return{url:`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,scaledSize:new google.maps.Size(58,58),anchor:new google.maps.Point(29,29)};
}

function watchLocation(){
  if(!navigator.geolocation)return message('მდებარეობის სერვისი მიუწვდომელია');
  watchId=navigator.geolocation.watchPosition(position=>{
    currentPosition={lat:position.coords.latitude,lng:position.coords.longitude};
    document.getElementById('speedValue').textContent=Math.max(0,Math.round((position.coords.speed||0)*3.6));
    lastHeading=Number.isFinite(position.coords.heading)?position.coords.heading:lastHeading;
    if(userMarker){userMarker.setPosition(currentPosition);userMarker.setIcon(teslaIcon(lastHeading))}else userMarker=new google.maps.Marker({map,position:currentPosition,title:'ჩემი მდებარეობა',icon:teslaIcon(lastHeading),zIndex:1000});
    if(!hasInitialFocus){hasInitialFocus=true;map.panTo(currentPosition);map.setZoom(17)}
    if(document.body.classList.contains('navigating')){map.panTo(currentPosition);updateManeuver()}
  },()=>message('ჩართეთ მდებარეობაზე წვდომა'),{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
}

function focusLocation(){if(!currentPosition)return message('მდებარეობა ჯერ არ არის მიღებული');map.panTo(currentPosition);map.setZoom(17)}
function buildRoute(destination){
  directionsService.route({origin:currentPosition||defaultCenter,destination,travelMode:google.maps.TravelMode.DRIVING},(result,status)=>{
    if(status!=='OK')return message('მარშრუტის აგება ვერ მოხერხდა');
    directionsRenderer.setDirections(result);currentLeg=result.routes[0].legs[0];currentStepIndex=0;
    document.getElementById('routeDistance').textContent=currentLeg.distance?.text||'—';document.getElementById('routeDuration').textContent=currentLeg.duration?.text||'—';document.getElementById('routeSummary').hidden=false;
  });
}
function startNavigation(){if(!currentLeg)return;is3d=true;document.body.classList.add('navigating');document.getElementById('maneuver').hidden=false;document.getElementById('mode3dButton').classList.add('active');map.setZoom(18);map.setTilt(60);userMarker?.setIcon(teslaIcon(lastHeading));updateManeuver()}
function updateManeuver(){
  if(!currentLeg?.steps?.length||!currentPosition)return;let step=currentLeg.steps[currentStepIndex];let distance=google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(currentPosition),step.end_location);
  if(distance<30&&currentStepIndex<currentLeg.steps.length-1){currentStepIndex++;step=currentLeg.steps[currentStepIndex];distance=google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(currentPosition),step.end_location)}
  document.getElementById('maneuverDistance').textContent=distance?`${Math.round(distance)} მ`:(step.distance?.text||'—');document.getElementById('maneuverText').textContent=step.instructions.replace(/<[^>]+>/g,' ');
  document.getElementById('maneuverArrow').textContent=/left/i.test(step.maneuver||'')?'←':/right/i.test(step.maneuver||'')?'→':'↑';
}
function toggleTheme(){darkMode=!darkMode;document.body.classList.toggle('dark',darkMode);createMap();document.getElementById('themeButton').textContent=darkMode?'☀':'☾'}
function toggle3d(){is3d=!is3d;if(is3d&&map.getZoom()<18)map.setZoom(18);map.setTilt(is3d?60:0);userMarker?.setIcon(teslaIcon(lastHeading));document.getElementById('mode3dButton').classList.toggle('active',is3d)}
function toggleTraffic(){trafficVisible=!trafficVisible;trafficLayer.setMap(trafficVisible?map:null);document.getElementById('trafficButton').classList.toggle('active',trafficVisible)}
function clearRoute(){directionsRenderer.set('directions',null);currentLeg=null;currentStepIndex=0;document.body.classList.remove('navigating');document.getElementById('routeSummary').hidden=true;document.getElementById('maneuver').hidden=true;document.getElementById('destination').value=''}
loadGoogleMaps();
