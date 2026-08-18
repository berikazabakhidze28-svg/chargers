let map,autocomplete,directionsService,directionsRenderer,currentPosition,userMarker,currentLeg,watchId,currentStepIndex=0,hasInitialFocus=false;
let darkMode=false;
const defaultCenter={lat:41.7151,lng:44.8271};
const darkStyles=[{elementType:'geometry',stylers:[{color:'#152541'}]},{elementType:'labels.text.fill',stylers:[{color:'#ffffff'}]},{elementType:'labels.text.stroke',stylers:[{color:'#152541'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#3E5A77'}]},{featureType:'poi',elementType:'geometry',stylers:[{color:'#1B3B69'}]},{featureType:'transit',stylers:[{visibility:'off'}]}];
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
  map=new google.maps.Map(document.getElementById('map'),{center:defaultCenter,zoom:13,disableDefaultUI:true,gestureHandling:'greedy'});
  directionsService=new google.maps.DirectionsService();
  directionsRenderer=new google.maps.DirectionsRenderer({map,polylineOptions:{strokeColor:'#1a73e8',strokeWeight:8}});
  autocomplete=new google.maps.places.Autocomplete(document.getElementById('destination'),{componentRestrictions:{country:'ge'},fields:['geometry','formatted_address','name']});
  autocomplete.bindTo('bounds',map);
  autocomplete.addListener('place_changed',()=>{const place=autocomplete.getPlace();if(place.geometry?.location)buildRoute(place.geometry.location)});
  document.getElementById('routeForm').addEventListener('submit',event=>{event.preventDefault();const place=autocomplete.getPlace();if(place.geometry?.location)buildRoute(place.geometry.location);else message('აირჩიეთ მისამართი Google-ის შედეგებიდან')});
  document.getElementById('locateButton').addEventListener('click',()=>focusLocation());
  document.getElementById('themeButton').addEventListener('click',toggleTheme);
  document.getElementById('startRoute').addEventListener('click',startNavigation);
  document.getElementById('closeRoute').addEventListener('click',clearRoute);
  watchLocation();
};

function watchLocation(){
  if(!navigator.geolocation)return message('მდებარეობის სერვისი მიუწვდომელია');
  watchId=navigator.geolocation.watchPosition(position=>{
    currentPosition={lat:position.coords.latitude,lng:position.coords.longitude};
    document.getElementById('speedValue').textContent=Math.max(0,Math.round((position.coords.speed||0)*3.6));
    if(userMarker)userMarker.setPosition(currentPosition);else userMarker=new google.maps.Marker({map,position:currentPosition,title:'ჩემი მდებარეობა',icon:{path:google.maps.SymbolPath.FORWARD_CLOSED_ARROW,scale:7,fillColor:'#1a73e8',fillOpacity:1,strokeColor:'#fff',strokeWeight:2,rotation:position.coords.heading||0}});
    if(userMarker?.getIcon()){const icon=userMarker.getIcon();icon.rotation=position.coords.heading||0;userMarker.setIcon(icon)}
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
function startNavigation(){if(!currentLeg)return;document.body.classList.add('navigating');document.getElementById('maneuver').hidden=false;map.setZoom(18);map.setTilt(45);updateManeuver()}
function updateManeuver(){
  if(!currentLeg?.steps?.length||!currentPosition)return;let step=currentLeg.steps[currentStepIndex];let distance=google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(currentPosition),step.end_location);
  if(distance<30&&currentStepIndex<currentLeg.steps.length-1){currentStepIndex++;step=currentLeg.steps[currentStepIndex];distance=google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(currentPosition),step.end_location)}
  document.getElementById('maneuverDistance').textContent=distance?`${Math.round(distance)} მ`:(step.distance?.text||'—');document.getElementById('maneuverText').textContent=step.instructions.replace(/<[^>]+>/g,' ');
  document.getElementById('maneuverArrow').textContent=/left/i.test(step.maneuver||'')?'←':/right/i.test(step.maneuver||'')?'→':'↑';
}
function toggleTheme(){darkMode=!darkMode;map.setOptions({styles:darkMode?darkStyles:null});document.getElementById('themeButton').textContent=darkMode?'☀':'☾'}
function clearRoute(){directionsRenderer.set('directions',null);currentLeg=null;currentStepIndex=0;document.body.classList.remove('navigating');document.getElementById('routeSummary').hidden=true;document.getElementById('maneuver').hidden=true;document.getElementById('destination').value=''}
loadGoogleMaps();
