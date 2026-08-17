const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [] },
  center: [43.55, 42.1],
  zoom: 7,
  pitch: 0,
  bearing: 0
});

const $ = id => document.getElementById(id);

// CartoDB's dark_all tiles turned out to omit building footprints almost
// entirely and render road linework so faint that no amount of raster
// brightness/contrast tuning made them legible — the detail simply isn't in
// the source pixels. So "dark" mode instead reuses the fully-detailed
// "standard" OSM tiles (buildings, parks, water, roads all present) and gets
// its dark/navy look from a canvas-level CSS filter (invert + hue-rotate),
// the same trick long used to turn ordinary light maps into passable dark
// ones without losing any cartographic detail.
const RASTER_LAYERS = {
  standard: {
    tiles: ["a", "b", "c"].map(s => `https://${s}.tile.openstreetmap.org/{z}/{x}/{y}.png`),
    attribution: "© OpenStreetMap"
  },
  satellite: {
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    attribution: "© Esri — World Imagery"
  }
};
// Esri's "World_Transportation" reference layer is a transparent, roads-only
// overlay purpose-built to sit on top of World_Imagery satellite tiles — this
// is what gives satellite mode a road network without needing its own basemap.
const SATELLITE_ROADS = {
  tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"],
  attribution: "© Esri"
};
const NIGHT_FILTER_HUE = 210; // degrees; matches styles.css .night-invert filter

let activeLayerKey = null;
let layerPickedByUser = false;
function setBaseLayer(key) {
  const tileKey = key === "dark" ? "standard" : key;
  Object.keys(RASTER_LAYERS).forEach(k => {
    map.setLayoutProperty(`layer-${k}`, "visibility", k === tileKey ? "visible" : "none");
  });
  map.setLayoutProperty("layer-satellite-roads", "visibility", key === "satellite" ? "visible" : "none");
  $("map").classList.toggle("night-invert", key === "dark");
  activeLayerKey = key;
  if (routeLayerReady) applyRouteLineColor();
  document.querySelectorAll(".layer-option[data-layer]").forEach(button => {
    button.classList.toggle("active", button.dataset.layer === key);
  });
}

const chargers = [
  { name: "თბილისი Supercharger", lat: 41.7151, lng: 44.8271, power: "250 kW", type: "Supercharger" },
  { name: "გორი სწრაფი დამტენი", lat: 41.9842, lng: 44.1085, power: "120 kW", type: "DC სწრაფი" },
  { name: "ქუთაისი სწრაფი დამტენი", lat: 42.2679, lng: 42.7066, power: "150 kW", type: "DC სწრაფი" },
  { name: "ბათუმი Supercharger", lat: 41.6461, lng: 41.6405, power: "250 kW", type: "Supercharger" },
  { name: "თელავი სწრაფი დამტენი", lat: 41.9198, lng: 45.4732, power: "100 kW", type: "DC სწრაფი" }
];
let chargerMarkers = [];
let chargerVisible = true;

let destination = null;
let routeLayerReady = false;
let searchTimer = null;

// ----- ცოცხალი მანქანის მდებარეობა (GPS) + ამინდი -----
let vehicleMarker = null;
let followVehicle = true;
let lastKnownCoords = null;
let lastHeading = 0;
let weatherFetchedAt = 0;

// ----- ხმოვანი ნავიგაცია (მოსახვევების გამოცხადება) -----
let navSteps = [];
let navStepIndex = 0;
let navigationActive = false;
const TURN_ANNOUNCE_METERS = 200; // ამ მანძილიდან ვაცხადებთ მოახლოებულ მოსახვევს
const TURN_ARRIVED_METERS = 25;   // ამ მანძილში ვთვლით, რომ მოსახვევი გავიარეთ

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function maneuverPhrase(step) {
  const { type, modifier } = step.maneuver;
  if (type === "depart") return "დაიწყეთ მოძრაობა";
  if (type === "arrive") return "მიხვედით დანიშნულების ადგილას";
  if (type === "roundabout" || type === "rotary") return "შედით წრიულ მოძრაობაში";
  if (type === "merge") return "შეუერთდით";
  if (type === "fork") return modifier === "left" ? "გზაჩანგალზე დარჩით მარცხნივ" : "გზაჩანგალზე დარჩით მარჯვნივ";
  if (type === "turn" || type === "end of road" || type === "new name") {
    if (modifier === "uturn") return "შეატრიალეთ მანქანა";
    if (modifier === "sharp left") return "მკვეთრად მოუხვიეთ მარცხნივ";
    if (modifier === "sharp right") return "მკვეთრად მოუხვიეთ მარჯვნივ";
    if (modifier === "slight left") return "გაუხვიეთ ოდნავ მარცხნივ";
    if (modifier === "slight right") return "გაუხვიეთ ოდნავ მარჯვნივ";
    if (modifier === "left") return "მოუხვიეთ მარცხნივ";
    if (modifier === "right") return "მოუხვიეთ მარჯვნივ";
    if (modifier === "straight") return "განაგრძეთ სვლა";
  }
  return "განაგრძეთ სვლა";
}

function maneuverIcon(step) {
  const { type, modifier } = step.maneuver;
  if (type === "arrive") return "●";
  if (type === "roundabout" || type === "rotary") return "↻";
  if (modifier === "uturn") return "↩";
  if (modifier === "sharp left") return "↙";
  if (modifier === "sharp right") return "↘";
  if (modifier === "slight left") return "↖";
  if (modifier === "slight right") return "↗";
  if (modifier === "left") return "←";
  if (modifier === "right") return "→";
  return "↑";
}

function describeManeuver(step) {
  const phrase = maneuverPhrase(step);
  if (step.maneuver.type === "arrive") return phrase;
  return step.name ? `${phrase} ${step.name}-ზე` : phrase;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ka-GE";
  speechSynthesis.speak(utterance);
}

function updateNextTurnUI() {
  const step = navSteps[navStepIndex];
  $("nextTurnText").textContent = step ? describeManeuver(step) : "";
  if (step) {
    $("turnBannerIcon").textContent = maneuverIcon(step);
    $("turnBannerText").textContent = maneuverPhrase(step);
    $("turnBannerStreet").textContent = step.name || "";
  }
}

function announceIfNeeded(lat, lon) {
  if (!navigationActive || navStepIndex >= navSteps.length) return;
  const step = navSteps[navStepIndex];
  const [stepLon, stepLat] = step.maneuver.location;
  const dist = haversineMeters(lat, lon, stepLat, stepLon);
  if (dist <= TURN_ARRIVED_METERS && navStepIndex < navSteps.length - 1) {
    navStepIndex++;
    updateNextTurnUI();
    speak(describeManeuver(navSteps[navStepIndex]));
  } else if (dist <= TURN_ANNOUNCE_METERS && !step.announced) {
    step.announced = true;
    speak(describeManeuver(step));
  }
}

function weatherEmoji(code) {
  if (code === 0) return "☀️";
  if ([1, 2, 3].includes(code)) return "⛅";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌤️";
}

async function fetchWeather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.current_weather) return;
    $("weatherIcon").textContent = weatherEmoji(data.current_weather.weathercode);
    $("weatherTemp").textContent = `${Math.round(data.current_weather.temperature)}°`;
    $("weatherChip").hidden = false;
    weatherFetchedAt = Date.now();
  } catch { /* ამინდის სერვისი დროებით მიუწვდომელია — ჩიპი უბრალოდ არ გამოჩნდება */ }
}

function onVehiclePosition(pos) {
  const { latitude, longitude, speed, heading } = pos.coords;
  lastKnownCoords = { lat: latitude, lon: longitude };
  if (heading !== null && !Number.isNaN(heading)) lastHeading = heading;
  if (!vehicleMarker) {
    const el = document.createElement("span");
    el.className = "vehicle-arrow";
    vehicleMarker = new maplibregl.Marker({ element: el, rotationAlignment: "viewport", pitchAlignment: "map" })
      .setLngLat([longitude, latitude])
      .addTo(map);
  } else {
    vehicleMarker.setLngLat([longitude, latitude]);
  }
  $("vehiclePulse").classList.add("connected");
  $("speedValue").textContent = Math.max(0, Math.round((speed || 0) * 3.6));
  if (followVehicle) {
    map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 16), bearing: lastHeading, pitch: 60, duration: 800 });
  }
  announceIfNeeded(latitude, longitude);
  if (Date.now() - weatherFetchedAt > 15 * 60 * 1000) fetchWeather(latitude, longitude);
}
function onVehicleError() {
  $("vehiclePulse").classList.remove("connected");
}

// ----- მისამართის ძებნა -----
const destInput = $("destInput");
const suggestions = $("suggestions");

let localNameIndex = [];
fetch("data/search-index.json").then(r => r.ok ? r.json() : []).then(list => localNameIndex = list).catch(() => {});

function searchLocalIndex(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return localNameIndex
    .filter(entry => entry.type === "settlement")
    .filter(entry => entry.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
    .slice(0, 5)
    .map(entry => ({ display_name: entry.name, lat: entry.lat, lon: entry.lon, source: "local" }));
}

function renderSuggestions(places) {
  suggestions.innerHTML = places.length
    ? places.map((p, i) => `<button data-index="${i}">${p.display_name}${p.source === "local" ? " <small>(საჯარო რეესტრი)</small>" : ""}</button>`).join("")
    : `<button disabled>ადგილი ვერ მოიძებნა</button>`;
  suggestions.hidden = false;
  suggestions.querySelectorAll("[data-index]").forEach(button => button.addEventListener("click", () => {
    const place = places[Number(button.dataset.index)];
    selectDestination({ lat: +place.lat, lon: +place.lon, name: place.display_name, boundingbox: place.boundingbox });
  }));
}

async function searchPlaces(query) {
  const localMatches = searchLocalIndex(query);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ge&accept-language=ka&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const remoteMatches = await response.json();
    renderSuggestions([...localMatches, ...remoteMatches]);
  } catch {
    renderSuggestions(localMatches);
  }
}

function hideSuggestions() { suggestions.hidden = true; }

function selectDestination(place) {
  destination = place;
  destInput.value = place.name.split(",")[0];
  $("searchClear").hidden = false;
  hideSuggestions();
  highlightDestination(place);
  planRoute();
}

destInput.addEventListener("input", () => {
  destination = null;
  $("searchClear").hidden = !destInput.value.trim();
  clearTimeout(searchTimer);
  if (destInput.value.trim().length < 2) return hideSuggestions();
  searchTimer = setTimeout(() => searchPlaces(destInput.value.trim()), 350);
});
$("searchClear").addEventListener("click", () => {
  destInput.value = "";
  $("searchClear").hidden = true;
  hideSuggestions();
  clearRoute();
  destInput.focus();
});

function showToast(message) {
  suggestions.innerHTML = `<button disabled>${message}</button>`;
  suggestions.hidden = false;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(hideSuggestions, 3000);
}

// მარშრუტს ჯერ ვითხოვთ ლოკალური route.php-სგან (NAPR-ის საგზაო ქსელზე
// აგებული საკუთარი routing), წარუმატებლობის ან "fallback" პასუხის
// შემთხვევაში კი — საჯარო OSRM API-სგან.
async function fetchRoute(start, end) {
  try {
    const localUrl = `route.php?start=${start.lat},${start.lon}&end=${end.lat},${end.lon}`;
    const localResponse = await fetch(localUrl);
    const localData = await localResponse.json();
    if (localData.code === "Ok" && !localData.fallback && localData.routes?.length) return localData;
  } catch { /* local routing unavailable — fall through to OSRM */ }

  const coords = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  return response.json();
}

function emptyRouteData() { return { type: "Feature", geometry: { type: "LineString", coordinates: [] } }; }
function emptyHighlightData() { return { type: "FeatureCollection", features: [] }; }

// მონიშნავს არჩეული მისამართის ზუსტ შენობას/ტერიტორიას რგოლით (Nominatim-ის
// boundingbox-იდან), რომ ცხადი იყოს ზუსტად რომელ ნაგებობაზეა საუბარი.
// ლოკალური ინდექსის დასახლებებს (bbox არ აქვთ) წრიული არეალით აღვნიშნავთ.
function highlightDestination(place) {
  if (!routeLayerReady) return;
  let minLon, minLat, maxLon, maxLat;
  if (place.boundingbox) {
    const [bLatMin, bLatMax, bLonMin, bLonMax] = place.boundingbox.map(Number);
    const padLat = Math.max((bLatMax - bLatMin) * 0.3, 0.00015);
    const padLon = Math.max((bLonMax - bLonMin) * 0.3, 0.00015);
    minLat = bLatMin - padLat; maxLat = bLatMax + padLat;
    minLon = bLonMin - padLon; maxLon = bLonMax + padLon;
  } else {
    const r = 0.00025; // ~25მ რადიუსი წერტილოვანი (ბოქსის გარეშე) შედეგისთვის
    minLat = place.lat - r; maxLat = place.lat + r;
    minLon = place.lon - r; maxLon = place.lon + r;
  }
  const feature = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]]
    }
  };
  map.getSource("destination-highlight").setData({ type: "FeatureCollection", features: [feature] });
  map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 120, maxZoom: 18, duration: 800 });
}

function clearHighlight() {
  if (routeLayerReady) map.getSource("destination-highlight").setData(emptyHighlightData());
}

function clearRoute() {
  if (routeLayerReady) map.getSource("route").setData(emptyRouteData());
  clearHighlight();
  stopNavigation();
  destination = null;
  $("routeSheet").hidden = true;
}

function stopNavigation() {
  navigationActive = false;
  navSteps = [];
  navStepIndex = 0;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  $("routeSheet").classList.remove("active");
  $("turnBanner").hidden = true;
  $("searchBar").hidden = false;
}

function startNavigation() {
  if (!navSteps.length) return;
  navigationActive = true;
  followVehicle = true;
  $("locateButton").classList.add("active");
  $("routeSheet").classList.add("active");
  $("searchBar").hidden = true;
  $("turnBanner").hidden = false;
  navSteps[0].announced = true;
  updateNextTurnUI();
  speak(describeManeuver(navSteps[0]));
  // მაშინვე გავამახვილოთ მიმდინარე პოზიციაზე — followVehicle-ის ეფექტისთვის
  // შემდეგი GPS-განახლების ლოდინი არ არის საჭირო.
  if (vehicleMarker) {
    const { lng, lat } = vehicleMarker.getLngLat();
    map.easeTo({ center: [lng, lat], zoom: 17, bearing: lastHeading, pitch: 60, duration: 1000 });
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos =>
      map.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 17, pitch: 60, duration: 1000 })
    );
  }
}
$("goButton").addEventListener("click", startNavigation);

// route.php-ს ადგილობრივ NAPR გრაფს არ აქვს მოსახვევების (maneuver) მონაცემები —
// ხმოვანი ნავიგაციისთვის ყოველთვის ცალკე ვითხოვთ OSRM-ის საფეხურებს, მიუხედავად
// იმისა, თუ საიდან აშენდა ეკრანზე ნაჩვენები მარშრუტის ხაზი.
async function fetchNavSteps(start, end) {
  try {
    const coords = `${start.lon},${start.lat};${end.lon},${end.lat}`;
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=true`);
    const data = await response.json();
    return data.routes?.[0]?.legs?.[0]?.steps ?? [];
  } catch {
    return [];
  }
}

function boundsOfCoordinates(coords) {
  return coords.reduce(
    (b, [lng, lat]) => [[Math.min(b[0][0], lng), Math.min(b[0][1], lat)], [Math.max(b[1][0], lng), Math.max(b[1][1], lat)]],
    [[coords[0][0], coords[0][1]], [coords[0][0], coords[0][1]]]
  );
}

// The route line is drawn on the same WebGL canvas as the base tiles, so the
// night-mode invert()/hue-rotate() canvas filter (see styles.css
// #map.night-invert) would tint it too. To keep the route showing our actual
// --accent color on screen, feed the layer the color that becomes --accent
// *after* that filter is applied — i.e. run the filter's math backwards.
function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function rotateHue([r, g, b], deg) {
  const rad = (deg * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const m = [
    [.213 + cos * .787 - sin * .213, .715 - cos * .715 - sin * .715, .072 - cos * .072 + sin * .928],
    [.213 - cos * .213 + sin * .143, .715 + cos * .285 + sin * .140, .072 - cos * .072 - sin * .283],
    [.213 - cos * .213 - sin * .787, .715 - cos * .715 + sin * .715, .072 + cos * .928 + sin * .072]
  ];
  return [
    r * m[0][0] + g * m[0][1] + b * m[0][2],
    r * m[1][0] + g * m[1][1] + b * m[1][2],
    r * m[2][0] + g * m[2][1] + b * m[2][2]
  ];
}
function preCompensateForNightFilter(hex) {
  const undone = rotateHue(hexToRgb(hex), -NIGHT_FILTER_HUE);
  return rgbToHex(255 - undone[0], 255 - undone[1], 255 - undone[2]);
}
function applyRouteLineColor() {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const color = activeLayerKey === "dark" ? preCompensateForNightFilter(accent) : accent;
  map.setPaintProperty("route-line", "line-color", color);
  map.setPaintProperty("destination-highlight-line", "line-color", color);
  map.setPaintProperty("destination-highlight-fill", "fill-color", color);
}

async function planRoute() {
  if (!destination) return;
  const start = vehicleMarker
    ? { lat: vehicleMarker.getLngLat().lat, lon: vehicleMarker.getLngLat().lng }
    : (lastKnownCoords || { lat: 41.7151, lon: 44.8271 });
  $("loading").hidden = false;
  try {
    const data = await fetchRoute(start, destination);
    if (!data.routes?.length) throw new Error();
    const route = data.routes[0];
    map.getSource("route").setData({ type: "Feature", geometry: route.geometry });
    applyRouteLineColor();
    map.fitBounds(boundsOfCoordinates(route.geometry.coordinates), { padding: 80 });

    const km = route.distance / 1000;
    const hours = Math.floor(route.duration / 3600);
    const minutes = Math.round((route.duration % 3600) / 60);
    $("distanceValue").textContent = `${Math.round(km)} კმ`;
    $("durationValue").textContent = hours ? `${hours}სთ ${minutes}წთ` : `${minutes} წთ`;
    const arrivalClock = new Date(Date.now() + route.duration * 1000);
    $("arrivalClockValue").textContent = arrivalClock.toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" });
    $("routeSheetTitle").textContent = destination.name.split(",")[0];
    stopNavigation();
    $("routeSheet").hidden = false;
    fetchNavSteps(start, destination).then(steps => { navSteps = steps; navStepIndex = 0; });
  } catch {
    showToast("მარშრუტის აგება ვერ მოხერხდა. სცადეთ თავიდან.");
  } finally {
    $("loading").hidden = true;
  }
}

$("endNavButton").addEventListener("click", () => {
  clearRoute();
  destInput.value = "";
  $("searchClear").hidden = true;
});

$("locateButton").addEventListener("click", event => {
  followVehicle = !followVehicle;
  event.currentTarget.classList.toggle("active", followVehicle);
  if (followVehicle) {
    if (vehicleMarker) map.easeTo({ center: vehicleMarker.getLngLat(), zoom: 16, bearing: lastHeading, pitch: 60, duration: 800 });
    else if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => map.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14 }));
  } else {
    map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  }
});
$("locateButton").classList.toggle("active", followVehicle);

$("chargerButton").addEventListener("click", event => {
  chargerVisible = !chargerVisible;
  chargerMarkers.forEach(m => chargerVisible ? m.addTo(map) : m.remove());
  event.currentTarget.classList.toggle("active", chargerVisible);
});
$("layerButton").addEventListener("click", event => {
  event.stopPropagation();
  const menu = $("layerMenu");
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  $("layerButton").setAttribute("aria-expanded", String(willOpen));
});
document.querySelectorAll(".layer-option[data-layer]").forEach(button => {
  button.addEventListener("click", () => {
    setBaseLayer(button.dataset.layer);
    layerPickedByUser = true;
    $("layerMenu").hidden = true;
    $("layerButton").setAttribute("aria-expanded", "false");
  });
});

$("colorButton").addEventListener("click", event => {
  event.stopPropagation();
  const menu = $("colorMenu");
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  $("colorButton").setAttribute("aria-expanded", String(willOpen));
});
document.querySelectorAll(".color-swatch[data-color]").forEach(button => {
  button.addEventListener("click", () => {
    const color = button.dataset.color;
    document.documentElement.style.setProperty("--vehicle-color", color);
    localStorage.setItem("vehicleColor", color);
    document.querySelectorAll(".color-swatch").forEach(b => b.classList.toggle("active", b === button));
    $("colorMenu").hidden = true;
    $("colorButton").setAttribute("aria-expanded", "false");
  });
});
const savedVehicleColor = localStorage.getItem("vehicleColor");
if (savedVehicleColor) {
  document.documentElement.style.setProperty("--vehicle-color", savedVehicleColor);
  document.querySelectorAll(".color-swatch").forEach(b => b.classList.toggle("active", b.dataset.color === savedVehicleColor));
}

const markerSizeSlider = $("markerSizeSlider");
const VEHICLE_SIZE_MIN = +markerSizeSlider.min;
const VEHICLE_SIZE_MAX = +markerSizeSlider.max;
function setVehicleSize(px) {
  const clamped = Math.max(VEHICLE_SIZE_MIN, Math.min(VEHICLE_SIZE_MAX, px));
  document.documentElement.style.setProperty("--vehicle-size", `${clamped}px`);
  localStorage.setItem("vehicleSize", clamped);
  markerSizeSlider.value = clamped;
}
markerSizeSlider.addEventListener("input", () => setVehicleSize(+markerSizeSlider.value));
$("markerSizeInc").addEventListener("click", () => setVehicleSize(+markerSizeSlider.value + 4));
$("markerSizeDec").addEventListener("click", () => setVehicleSize(+markerSizeSlider.value - 4));
const savedVehicleSize = localStorage.getItem("vehicleSize");
if (savedVehicleSize) setVehicleSize(+savedVehicleSize);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  document.querySelector('meta[name="theme-color"]').content = theme === "light" ? "#efe7d8" : "#0f1613";
  if (!layerPickedByUser) setBaseLayer(theme === "light" ? "standard" : "dark");
  else if (routeLayerReady) applyRouteLineColor();
}
$("themeToggle").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

document.addEventListener("click", event => {
  if (!suggestions.contains(event.target) && event.target !== destInput) hideSuggestions();
  if (!event.target.closest("#layerMenu")) {
    $("layerMenu").hidden = true;
    $("layerButton").setAttribute("aria-expanded", "false");
  }
  if (!event.target.closest("#colorMenu")) {
    $("colorMenu").hidden = true;
    $("colorButton").setAttribute("aria-expanded", "false");
  }
});

map.on("load", () => {
  Object.entries(RASTER_LAYERS).forEach(([key, layer]) => {
    map.addSource(`src-${key}`, { type: "raster", tiles: layer.tiles, tileSize: 256, attribution: layer.attribution });
    map.addLayer({ id: `layer-${key}`, type: "raster", source: `src-${key}`, layout: { visibility: "none" }, paint: layer.paint || {} });
  });
  map.addSource("src-satellite-roads", { type: "raster", tiles: SATELLITE_ROADS.tiles, tileSize: 256, attribution: SATELLITE_ROADS.attribution });
  map.addLayer({ id: "layer-satellite-roads", type: "raster", source: "src-satellite-roads", layout: { visibility: "none" } });
  setBaseLayer(document.documentElement.dataset.theme === "light" ? "standard" : "dark");

  map.addSource("route", { type: "geojson", data: emptyRouteData() });
  map.addLayer({
    id: "route-line", type: "line", source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), "line-width": 6, "line-opacity": .92 }
  });

  map.addSource("destination-highlight", { type: "geojson", data: emptyHighlightData() });
  map.addLayer({
    id: "destination-highlight-fill", type: "fill", source: "destination-highlight",
    paint: { "fill-color": getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), "fill-opacity": .12 }
  });
  map.addLayer({
    id: "destination-highlight-line", type: "line", source: "destination-highlight",
    layout: { "line-join": "round" },
    paint: { "line-color": getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), "line-width": 3, "line-dasharray": [2, 1] }
  });
  routeLayerReady = true;

  chargerMarkers = chargers.map(charger => {
    const el = document.createElement("span");
    el.className = "charger-icon";
    el.textContent = "⚡";
    const popup = new maplibregl.Popup({ offset: 16 }).setHTML(`<b>${charger.name}</b><br>${charger.type} · ${charger.power}`);
    return new maplibregl.Marker({ element: el }).setLngLat([charger.lng, charger.lat]).setPopup(popup).addTo(map);
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => map.jumpTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
    navigator.geolocation.watchPosition(onVehiclePosition, onVehicleError, { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });
  }
});
