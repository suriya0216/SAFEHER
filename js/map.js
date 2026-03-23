/* ==========================================
   SAFEHER - Live Map JavaScript
   ========================================== */

const DEFAULT_CENTER = {
  lat: 13.0827,
  lng: 80.2707,
  label: "Chennai",
  shortLabel: "Chennai",
  mode: "default",
};

const HOTSPOTS = [
  {
    name: "Chromepet low-light stretch",
    lat: 12.9516,
    lng: 80.1406,
    radius: 850,
    severity: "danger",
    note: "Community reports mention low visibility after 10 PM.",
  },
  {
    name: "Pallavaram flyover underpass",
    lat: 12.9677,
    lng: 80.1499,
    radius: 720,
    severity: "danger",
    note: "Late-night waiting area with fewer patrol checks.",
  },
  {
    name: "Guindy junction caution zone",
    lat: 13.0071,
    lng: 80.2127,
    radius: 650,
    severity: "caution",
    note: "Heavy traffic and poor pickup visibility during rush hour.",
  },
  {
    name: "T Nagar market rush pocket",
    lat: 13.0415,
    lng: 80.2337,
    radius: 560,
    severity: "caution",
    note: "Crowded zone with frequent route slowdowns.",
  },
  {
    name: "Egmore station perimeter",
    lat: 13.0744,
    lng: 80.2619,
    radius: 600,
    severity: "caution",
    note: "High pickup congestion and reported tout activity.",
  },
];

const ROUTE_LABELS = [
  { name: "Route A - Safest", copy: "Best safety match" },
  { name: "Route B - Balanced", copy: "Balanced ETA and safety" },
  { name: "Route C - Backup", copy: "Use only if needed" },
];

const state = {
  map: null,
  currentLocation: null,
  currentLocationLabel: "",
  currentLocationLabelTs: 0,
  origin: null,
  destination: null,
  followLive: true,
  journeyActive: false,
  pickOnMap: false,
  geolocationWatchId: null,
  routeResults: [],
  routeLayers: [],
  selectedRouteIndex: 0,
  liveMarker: null,
  originMarker: null,
  destinationMarker: null,
  vehicleMarker: null,
  vehiclePosition: null,
  accuracyCircle: null,
  journeyAnimationFrame: null,
  journeyAnimationStart: 0,
  journeyProgressRatio: 0,
  journeyActiveRouteKey: "",
  suggestionDebounceTimers: { from: null, to: null },
  suggestionRequestIds: { from: 0, to: 0 },
};

const refs = {};

function $(id) {
  return document.getElementById(id);
}

function initMapPage() {
  refs.fromInp = $("fromInp");
  refs.toInp = $("toInp");
  refs.fromSuggestions = $("fromSuggestions");
  refs.toSuggestions = $("toSuggestions");
  refs.useLiveLocationBtn = $("useLiveLocationBtn");
  refs.pickOnMapBtn = $("pickOnMapBtn");
  refs.findRoutesBtn = $("findRoutesBtn");
  refs.clearRouteBtn = $("clearRouteBtn");
  refs.mapStatus = $("mapStatus");
  refs.routeCardsWrap = $("routeCardsWrap");
  refs.turnStepsWrap = $("turnStepsWrap");
  refs.turnStepsList = $("turnStepsList");
  refs.selectedRouteBadge = $("selectedRouteBadge");
  refs.followBtn = $("followBtn");
  refs.recenterBtn = $("recenterBtn");
  refs.journeyBtn = $("journeyBtn");
  refs.liveCoordsValue = $("liveCoordsValue");
  refs.etaValue = $("etaValue");
  refs.distanceValue = $("distanceValue");
  refs.speedValue = $("speedValue");

  if (typeof L === "undefined") {
    setStatus("Map library could not load. Check internet access and refresh the page.", "error");
    return;
  }

  createMap();
  bindEvents();
  renderHotspots();
  renderEmptyRoutes("Search a destination or tap the map to build a real route.");
  updateStats();
  updateToolButtons();
  bootstrapLocation();
}

function createMap() {
  state.map = L.map("liveMap", {
    zoomControl: false,
    preferCanvas: true,
  }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12);

  L.control.zoom({ position: "bottomright" }).addTo(state.map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);

  state.map.on("click", handleMapClick);
}

function bindEvents() {
  refs.useLiveLocationBtn.addEventListener("click", handleUseLiveLocation);
  refs.pickOnMapBtn.addEventListener("click", togglePickOnMap);
  refs.findRoutesBtn.addEventListener("click", findRoutes);
  refs.clearRouteBtn.addEventListener("click", clearRoute);
  refs.followBtn.addEventListener("click", toggleFollowMode);
  refs.recenterBtn.addEventListener("click", recenterMap);
  refs.journeyBtn.addEventListener("click", toggleJourney);

  bindSuggestionField(refs.fromInp, "from");
  bindSuggestionField(refs.toInp, "to");

  document.querySelectorAll(".map-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      refs.toInp.value = chip.dataset.destination || "";
      hideSuggestions("to");
      findRoutes();
    });
  });
}

function bindSuggestionField(input, kind) {
  input.addEventListener("keydown", handleInputSubmit);
  input.addEventListener("input", () => {
    if (kind === "from") {
      state.origin = null;
      updateOriginMarker();
    } else {
      state.destination = null;
      updateDestinationMarker();
    }
    queueSuggestions(kind, input.value);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) {
      queueSuggestions(kind, input.value, true);
    }
  });
  input.addEventListener("blur", () => {
    setTimeout(() => hideSuggestions(kind), 140);
  });
}

function handleInputSubmit(event) {
  const kind = event.currentTarget === refs.fromInp ? "from" : "to";

  if (event.key === "Escape") {
    hideSuggestions(kind);
    return;
  }

  if (event.key !== "Enter") return;

  event.preventDefault();
  const box = getSuggestionBox(kind);
  const firstSuggestion = box.querySelector(".map-suggestion[data-index]");
  if (!box.hidden && firstSuggestion) {
    firstSuggestion.click();
    return;
  }

  findRoutes();
}

function queueSuggestions(kind, query, immediate = false) {
  clearTimeout(state.suggestionDebounceTimers[kind]);
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    hideSuggestions(kind);
    return;
  }

  const run = () => loadSuggestions(kind, trimmed);
  if (immediate) {
    run();
    return;
  }

  state.suggestionDebounceTimers[kind] = setTimeout(run, 220);
}

async function loadSuggestions(kind, query) {
  const requestId = ++state.suggestionRequestIds[kind];

  try {
    const response = await apiGet(`/api/map/search?q=${encodeURIComponent(query)}&limit=5`);
    if (requestId !== state.suggestionRequestIds[kind]) return;
    renderSuggestions(kind, response.results || [], query);
  } catch (error) {
    if (requestId !== state.suggestionRequestIds[kind]) return;
    hideSuggestions(kind);
  }
}

function renderSuggestions(kind, results, query) {
  const box = getSuggestionBox(kind);

  if (!results.length) {
    box.hidden = false;
    box.innerHTML = `
      <div class="map-suggestion">
        <span class="map-suggestion-label">No matches found</span>
        <span class="map-suggestion-meta">Try a nearby area, landmark, or full address for "${escapeHtml(query)}".</span>
      </div>
    `;
    return;
  }

  box.innerHTML = results
    .map(
      (result, index) => `
        <button type="button" class="map-suggestion" data-index="${index}">
          <span class="map-suggestion-label">${escapeHtml(result.shortLabel || result.label)}</span>
          <span class="map-suggestion-meta">${escapeHtml(result.label)}</span>
        </button>
      `
    )
    .join("");

  box.hidden = false;
  box.querySelectorAll(".map-suggestion[data-index]").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      selectSuggestion(kind, results[parseInt(button.dataset.index, 10)]);
    });
  });
}

function selectSuggestion(kind, suggestion) {
  if (!suggestion) return;

  const payload = {
    lat: suggestion.lat,
    lng: suggestion.lng,
    label: suggestion.label,
    shortLabel: suggestion.shortLabel || suggestion.label,
    mode: "search",
  };

  if (kind === "from") {
    state.origin = payload;
    refs.fromInp.value = payload.shortLabel;
    updateOriginMarker();
  } else {
    state.destination = payload;
    refs.toInp.value = payload.shortLabel;
    updateDestinationMarker();
  }

  hideSuggestions(kind);
  state.map.flyTo([payload.lat, payload.lng], Math.max(state.map.getZoom(), 14), {
    animate: true,
    duration: 0.6,
  });
  setStatus(`${capitalize(kind)} location selected. Find routes when you are ready.`, "success");
  updateStats();
}

function hideSuggestions(kind) {
  const box = getSuggestionBox(kind);
  box.hidden = true;
  box.innerHTML = "";
}

function getSuggestionBox(kind) {
  return kind === "from" ? refs.fromSuggestions : refs.toSuggestions;
}

async function bootstrapLocation() {
  if (!navigator.geolocation) {
    state.origin = { ...DEFAULT_CENTER };
    refs.fromInp.value = DEFAULT_CENTER.shortLabel;
    setStatus("Geolocation is not available in this browser. You can still search routes manually.", "warn");
    updateStats();
    return;
  }

  setStatus("Allow location access to unlock live tracking and route follow mode.", "neutral");

  try {
    const position = await getSinglePosition();
    await handlePositionUpdate(position, true);
    setStatus("Live location connected. You can now search any destination.", "success");
  } catch (error) {
    state.origin = { ...DEFAULT_CENTER };
    refs.fromInp.value = DEFAULT_CENTER.shortLabel;
    setStatus("Location access was blocked. Manual route search is still available.", "warn");
  }

  startGeolocationWatch();
}

function getSinglePosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 4000,
    });
  });
}

function startGeolocationWatch() {
  if (!navigator.geolocation || state.geolocationWatchId !== null) return;

  state.geolocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      handlePositionUpdate(position, false).catch(() => {
        /* ignore background reverse-geocode failures */
      });
    },
    () => {
      if (!state.currentLocation) {
        setStatus("Live location could not be refreshed. You can keep using manual route search.", "warn");
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 4000,
    }
  );
}

async function handlePositionUpdate(position, firstFix) {
  const location = extractPosition(position);
  state.currentLocation = location;
  updateLiveMarker(location);

  if (!state.origin || state.origin.mode === "live") {
    state.origin = {
      lat: location.lat,
      lng: location.lng,
      label: state.currentLocationLabel || "My live location",
      shortLabel: state.currentLocationLabel || "My live location",
      mode: "live",
    };
    refs.fromInp.value = state.origin.shortLabel;
    updateOriginMarker();
  }

  if (state.followLive && !state.journeyActive) {
    state.map.setView([location.lat, location.lng], Math.max(state.map.getZoom(), 15), {
      animate: true,
    });
  }

  if (Date.now() - state.currentLocationLabelTs > 120000) {
    reverseLookupCurrentLocation(location).catch(() => {
      /* ignore */
    });
  }

  updateStats();
}

function extractPosition(position) {
  const coords = position.coords;
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy: coords.accuracy || 0,
    speedMetersPerSec:
      typeof coords.speed === "number" && !Number.isNaN(coords.speed) ? coords.speed : null,
  };
}

async function reverseLookupCurrentLocation(location) {
  const data = await apiGet(`/api/map/reverse?lat=${location.lat}&lng=${location.lng}`);
  if (!data.result) return;

  state.currentLocationLabel = data.result.shortLabel || data.result.label;
  state.currentLocationLabelTs = Date.now();

  if (!state.origin || state.origin.mode === "live") {
    state.origin = {
      lat: location.lat,
      lng: location.lng,
      label: data.result.label,
      shortLabel: data.result.shortLabel || data.result.label,
      mode: "live",
    };
    refs.fromInp.value = state.origin.shortLabel;
  }
}

function updateLiveMarker(location) {
  const latLng = [location.lat, location.lng];
  if (!state.liveMarker) {
    state.liveMarker = L.marker(latLng, {
      icon: buildSimpleMarkerIcon("live"),
      zIndexOffset: 900,
    }).addTo(state.map);
    state.liveMarker.bindPopup("<strong>Your live location</strong>");
  } else {
    state.liveMarker.setLatLng(latLng);
  }

  if (!state.accuracyCircle) {
    state.accuracyCircle = L.circle(latLng, {
      radius: Math.max(location.accuracy, 24),
      color: "rgba(0, 122, 255, 0.28)",
      fillColor: "rgba(0, 122, 255, 0.12)",
      fillOpacity: 1,
      weight: 1.5,
    }).addTo(state.map);
  } else {
    state.accuracyCircle.setLatLng(latLng);
    state.accuracyCircle.setRadius(Math.max(location.accuracy, 24));
  }
}

function updateOriginMarker() {
  if (!state.origin || state.origin.mode === "live") {
    if (state.originMarker) {
      state.map.removeLayer(state.originMarker);
      state.originMarker = null;
    }
    return;
  }

  const latLng = [state.origin.lat, state.origin.lng];
  if (!state.originMarker) {
    state.originMarker = L.marker(latLng, {
      icon: buildSimpleMarkerIcon("origin"),
      zIndexOffset: 700,
    }).addTo(state.map);
  } else {
    state.originMarker.setLatLng(latLng);
  }

  state.originMarker.bindPopup(`<strong>Start</strong><br>${escapeHtml(state.origin.label)}`);
}

function updateDestinationMarker() {
  if (!state.destination) {
    if (state.destinationMarker) {
      state.map.removeLayer(state.destinationMarker);
      state.destinationMarker = null;
    }
    return;
  }

  const latLng = [state.destination.lat, state.destination.lng];
  if (!state.destinationMarker) {
    state.destinationMarker = L.marker(latLng, {
      icon: buildSimpleMarkerIcon("destination"),
      zIndexOffset: 800,
    }).addTo(state.map);
  } else {
    state.destinationMarker.setLatLng(latLng);
  }

  state.destinationMarker.bindPopup(`<strong>Destination</strong><br>${escapeHtml(state.destination.label)}`);
}

function buildSimpleMarkerIcon(kind) {
  return L.divIcon({
    className: "",
    html: `<div class="safeher-marker ${kind}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function buildVehicleMarkerIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div class="vehicle-shell" style="--car-rotate:0deg">
        <div class="vehicle-glow"></div>
        <div class="vehicle-shadow"></div>
        <div class="vehicle-arrow"></div>
        <div class="vehicle-body">
          <span class="vehicle-wheel front-left"></span>
          <span class="vehicle-wheel front-right"></span>
          <span class="vehicle-wheel rear-left"></span>
          <span class="vehicle-wheel rear-right"></span>
        </div>
        <div class="vehicle-label">Trip car</div>
      </div>
    `,
    iconSize: [72, 72],
    iconAnchor: [36, 36],
  });
}

function renderHotspots() {
  HOTSPOTS.forEach((spot) => {
    const color = spot.severity === "danger" ? "#ff2d55" : "#ff9f0a";
    L.circle([spot.lat, spot.lng], {
      radius: spot.radius,
      color,
      weight: 1.2,
      fillColor: color,
      fillOpacity: spot.severity === "danger" ? 0.12 : 0.09,
    })
      .addTo(state.map)
      .bindPopup(
        `<div class="hotspot-popup"><strong>${escapeHtml(spot.name)}</strong><br>${escapeHtml(spot.note)}</div>`
      );
  });
}

function setStatus(message, tone) {
  refs.mapStatus.className = `map-status ${tone}`;
  refs.mapStatus.textContent = message;
}

function togglePickOnMap() {
  state.pickOnMap = !state.pickOnMap;
  hideSuggestions("to");
  updateToolButtons();

  state.map.getContainer().style.cursor = state.pickOnMap ? "crosshair" : "";
  if (state.pickOnMap) {
    setStatus("Tap anywhere on the map to pin a destination.", "neutral");
  } else {
    setStatus("Map pin mode cancelled.", "neutral");
  }
}

async function handleMapClick(event) {
  if (!state.pickOnMap) return;

  state.pickOnMap = false;
  state.destination = {
    lat: event.latlng.lat,
    lng: event.latlng.lng,
    label: `Pinned destination (${event.latlng.lat.toFixed(4)}, ${event.latlng.lng.toFixed(4)})`,
    shortLabel: "Pinned destination",
    mode: "map",
  };

  refs.toInp.value = state.destination.shortLabel;
  hideSuggestions("to");
  updateDestinationMarker();
  updateToolButtons();
  state.map.getContainer().style.cursor = "";
  setStatus("Destination pinned. Reverse lookup in progress...", "success");

  try {
    const data = await apiGet(`/api/map/reverse?lat=${state.destination.lat}&lng=${state.destination.lng}`);
    if (data.result) {
      state.destination.label = data.result.label;
      state.destination.shortLabel = data.result.shortLabel || data.result.label;
      refs.toInp.value = state.destination.shortLabel;
      updateDestinationMarker();
      setStatus("Destination pinned on the map. Find routes when ready.", "success");
    }
  } catch (error) {
    setStatus("Destination pinned. Reverse lookup failed, but route search will still work.", "warn");
  }
}

async function handleUseLiveLocation() {
  hideSuggestions("from");
  if (state.currentLocation) {
    state.origin = {
      lat: state.currentLocation.lat,
      lng: state.currentLocation.lng,
      label: state.currentLocationLabel || "My live location",
      shortLabel: state.currentLocationLabel || "My live location",
      mode: "live",
    };
    refs.fromInp.value = state.origin.shortLabel;
    updateOriginMarker();
    recenterMap();
    setStatus("Origin reset to your live location.", "success");
    updateStats();
    return;
  }

  try {
    setStatus("Waiting for the browser to share your live location...", "neutral");
    const position = await getSinglePosition();
    await handlePositionUpdate(position, true);
    setStatus("Live location connected and ready to use as origin.", "success");
  } catch (error) {
    setStatus("Location permission is required for live tracking. You can still enter the origin manually.", "warn");
  }
}

async function findRoutes() {
  try {
    hideSuggestions("from");
    hideSuggestions("to");
    setStatus("Resolving your origin and destination...", "neutral");

    const origin = await resolveOrigin();
    const destination = await resolveDestination();
    state.origin = origin;
    state.destination = destination;

    refs.fromInp.value = origin.shortLabel || origin.label;
    refs.toInp.value = destination.shortLabel || destination.label;

    updateOriginMarker();
    updateDestinationMarker();

    setStatus("Fetching real route options and safety overlays...", "neutral");
    const routes = await fetchRouteCandidates(origin, destination);

    if (!routes.length) {
      throw new Error("No drivable route could be created for this trip.");
    }

    state.routeResults = routes;
    state.selectedRouteIndex = 0;
    state.journeyProgressRatio = 0;
    state.journeyActiveRouteKey = routes[0].routeKey;
    state.journeyActive = false;
    cancelJourneyAnimation();
    updateToolButtons();
    drawRoutes();
    selectRoute(0, true);
    setStatus(`Found ${routes.length} live route option${routes.length > 1 ? "s" : ""}.`, "success");
  } catch (error) {
    resetRouteState(false);
    refs.turnStepsWrap.hidden = true;
    renderEmptyRoutes(error.message || "Could not fetch routes right now.");
    setStatus(error.message || "Could not fetch routes right now.", "error");
    updateStats();
  }
}

async function resolveOrigin() {
  const query = refs.fromInp.value.trim();

  if ((!query || isLiveLocationQuery(query)) && state.currentLocation) {
    return {
      lat: state.currentLocation.lat,
      lng: state.currentLocation.lng,
      label: state.currentLocationLabel || "My live location",
      shortLabel: state.currentLocationLabel || "My live location",
      mode: "live",
    };
  }

  if (!query) {
    return { ...DEFAULT_CENTER };
  }

  if (state.origin && query === state.origin.shortLabel) {
    return state.origin;
  }

  return geocodeText(query, true);
}

async function resolveDestination() {
  const query = refs.toInp.value.trim();

  if (!query && state.destination) {
    return state.destination;
  }

  if (!query) {
    throw new Error("Enter or pin a destination first.");
  }

  if (state.destination && query === state.destination.shortLabel) {
    return state.destination;
  }

  return geocodeText(query, false);
}

function isLiveLocationQuery(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === "my live location" || normalized === "my location" || normalized === "current location";
}

async function geocodeText(text, allowLiveFallback) {
  if (allowLiveFallback && isLiveLocationQuery(text) && state.currentLocation) {
    return {
      lat: state.currentLocation.lat,
      lng: state.currentLocation.lng,
      label: state.currentLocationLabel || "My live location",
      shortLabel: state.currentLocationLabel || "My live location",
      mode: "live",
    };
  }

  const response = await apiGet(`/api/map/search?q=${encodeURIComponent(text)}&limit=1`);
  if (!response.results || !response.results.length) {
    throw new Error(`Location not found for "${text}".`);
  }

  const first = response.results[0];
  return {
    lat: first.lat,
    lng: first.lng,
    label: first.label,
    shortLabel: first.shortLabel || first.label,
    mode: "search",
  };
}

async function fetchRouteCandidates(origin, destination) {
  const pointSets = buildCandidatePointSets(origin, destination);
  const responses = await Promise.allSettled(
    pointSets.map((candidate) =>
      requestRoute(candidate.points).then((route) => decorateRoute(route, candidate))
    )
  );
  const uniqueRoutes = [];
  const seen = new Set();

  responses.forEach((result) => {
    if (result.status !== "fulfilled" || !result.value) {
      return;
    }

    const route = result.value;
    const signature = `${Math.round(route.distance / 100)}-${Math.round(route.duration / 30)}-${route.geometry.coordinates.length}`;
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);
    uniqueRoutes.push(decorateRoute(route));
  });

  uniqueRoutes.sort((left, right) => {
    if (right.safety.score !== left.safety.score) {
      return right.safety.score - left.safety.score;
    }
    return left.duration - right.duration;
  });

  return uniqueRoutes.slice(0, 3).map((route, index) => ({
    ...route,
    label: buildRouteLabel(route, index),
  }));
}

function buildCandidatePointSets(origin, destination) {
  const candidates = [
    {
      points: [origin, destination],
      routeBias: "balanced",
      intent: "direct",
    },
  ];

  const safeDetour = buildSafeDetourCandidate(origin, destination);
  if (safeDetour) {
    candidates.push(safeDetour);
  }

  const dangerDetour = buildDangerRouteCandidate(origin, destination);
  if (dangerDetour) {
    candidates.push(dangerDetour);
  }

  if (candidates.length < 3) {
    const backupDetour = buildBackupDetourCandidate(origin, destination);
    if (backupDetour) {
      candidates.push(backupDetour);
    }
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const signature = candidate.points
      .map((point) => `${Number(point.lng).toFixed(4)},${Number(point.lat).toFixed(4)}`)
      .join(";");
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  }).slice(0, 3);
}

function buildSafeDetourCandidate(origin, destination) {
  const tripDistance = haversineMeters(origin, destination);
  if (tripDistance < 1200) return null;

  const hotspotInfo = getJourneyHotspotCandidates(origin, destination, "danger")[0] ||
    getJourneyHotspotCandidates(origin, destination)[0];
  const offsetMeters = clamp(Math.round(tripDistance * 0.18), 900, 2200);
  let sideSign = 1;

  if (hotspotInfo) {
    sideSign = getPointSideOfJourney(hotspotInfo.spot, origin, destination) >= 0 ? -1 : 1;
  }

  const waypointA = buildOffsetWaypoint(origin, destination, 0.34, sideSign, offsetMeters);
  const waypointB = buildOffsetWaypoint(origin, destination, 0.66, sideSign, Math.round(offsetMeters * 0.82));
  if (!waypointA || !waypointB) return null;

  return {
    points: [origin, waypointA, waypointB, destination],
    routeBias: "safe",
    intent: "safer",
  };
}

function buildDangerRouteCandidate(origin, destination) {
  const tripDistance = haversineMeters(origin, destination);
  const dangerHotspots = getJourneyHotspotCandidates(origin, destination, "danger");
  const eligible = dangerHotspots
    .filter((item) => item.corridorDistance <= Math.max(1800, tripDistance * 0.22) || item.addedDistance <= Math.max(2500, tripDistance * 0.8))
    .slice(0, tripDistance > 6000 ? 2 : 1);

  if (eligible.length) {
    return {
      points: [origin, ...eligible.map((item) => ({ lat: item.spot.lat, lng: item.spot.lng })), destination],
      routeBias: "danger",
      intent: "danger",
      hotspotNames: eligible.map((item) => item.spot.name),
    };
  }

  if (tripDistance < 1500) return null;

  const waypointA = buildOffsetWaypoint(origin, destination, 0.42, 1, clamp(Math.round(tripDistance * 0.11), 700, 1400));
  const waypointB = buildOffsetWaypoint(origin, destination, 0.68, -1, clamp(Math.round(tripDistance * 0.1), 600, 1200));
  if (!waypointA || !waypointB) return null;

  return {
    points: [origin, waypointA, waypointB, destination],
    routeBias: "danger",
    intent: "danger",
    hotspotNames: [],
  };
}

function buildBackupDetourCandidate(origin, destination) {
  const tripDistance = haversineMeters(origin, destination);
  if (tripDistance < 1000) return null;

  const waypoint = buildOffsetWaypoint(origin, destination, 0.5, -1, clamp(Math.round(tripDistance * 0.12), 700, 1600));
  if (!waypoint) return null;

  return {
    points: [origin, waypoint, destination],
    routeBias: "backup",
    intent: "backup",
  };
}

function getJourneyHotspotCandidates(origin, destination, severity) {
  const tripDistance = haversineMeters(origin, destination);
  return HOTSPOTS
    .filter((spot) => !severity || spot.severity === severity)
    .map((spot) => ({
      spot,
      corridorDistance: distancePointToSegmentMeters(spot, origin, destination),
      addedDistance: haversineMeters(origin, spot) + haversineMeters(spot, destination) - tripDistance,
    }))
    .sort((left, right) => {
      if (left.corridorDistance !== right.corridorDistance) {
        return left.corridorDistance - right.corridorDistance;
      }
      return left.addedDistance - right.addedDistance;
    });
}

function buildOffsetWaypoint(origin, destination, ratio, sideSign, offsetMeters) {
  const base = {
    lat: origin.lat + (destination.lat - origin.lat) * ratio,
    lng: origin.lng + (destination.lng - origin.lng) * ratio,
  };

  const latScale = 111320;
  const lngScale = Math.max(18000, Math.cos((base.lat * Math.PI) / 180) * 111320);
  const vectorX = (destination.lng - origin.lng) * lngScale;
  const vectorY = (destination.lat - origin.lat) * latScale;
  const vectorLength = Math.hypot(vectorX, vectorY);
  if (!vectorLength) return null;

  const normalX = (-vectorY / vectorLength) * sideSign;
  const normalY = (vectorX / vectorLength) * sideSign;
  return {
    lat: base.lat + (normalY * offsetMeters) / latScale,
    lng: base.lng + (normalX * offsetMeters) / lngScale,
  };
}

function distancePointToSegmentMeters(point, start, end) {
  const referenceLat = ((start.lat + end.lat + point.lat) / 3) * (Math.PI / 180);
  const lngScale = Math.cos(referenceLat) * 111320;
  const latScale = 111320;

  const ax = start.lng * lngScale;
  const ay = start.lat * latScale;
  const bx = end.lng * lngScale;
  const by = end.lat * latScale;
  const px = point.lng * lngScale;
  const py = point.lat * latScale;

  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSq = abx * abx + aby * aby;
  if (!abLengthSq) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = clamp(((px - ax) * abx + (py - ay) * aby) / abLengthSq, 0, 1);
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  return Math.hypot(px - closestX, py - closestY);
}

function getPointSideOfJourney(point, start, end) {
  return (end.lng - start.lng) * (point.lat - start.lat) - (end.lat - start.lat) * (point.lng - start.lng);
}

function buildRouteLabel(route, index) {
  const letter = String.fromCharCode(65 + index);

  if (route.safety.status === "danger") {
    return {
      name: `Route ${letter} - Danger`,
      copy: "High-risk corridor",
    };
  }

  if (route.intent === "safer" || index === 0) {
    return {
      name: `Route ${letter} - Safest`,
      copy: "Best safety match",
    };
  }

  if (route.safety.status === "caution" || route.intent === "backup") {
    return {
      name: `Route ${letter} - Caution`,
      copy: "Near monitored zones",
    };
  }

  if (route.intent === "danger") {
    return {
      name: `Route ${letter} - Risk Check`,
      copy: "Higher-risk comparison",
    };
  }

  return {
    name: `Route ${letter} - Alternate`,
    copy: "Live route option",
  };
}

function dedupeSafetyTags(tags) {
  const seen = new Set();
  return tags.filter((tag) => {
    const key = `${tag.severity}:${String(tag.label || "").toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function requestRoute(points) {
  const coords = points.map((point) => `${point.lng},${point.lat}`).join(";");
  const response = await apiGet(`/api/map/route?coords=${encodeURIComponent(coords)}`);
  return response.route;
}

function decorateRoute(route, candidateMeta = {}) {
  const pathMeta = buildPathMeta(route.geometry.coordinates || []);
  const safety = evaluateRouteSafety(route, candidateMeta);
  return {
    ...route,
    ...candidateMeta,
    ...pathMeta,
    safety,
    distanceText: formatDistance(route.distance),
    durationText: formatDuration(route.duration),
    scoreText: `${safety.score}/100`,
  };
}

function buildPathMeta(coordinates) {
  const pathPoints = coordinates.map((coordinate) => ({
    lng: coordinate[0],
    lat: coordinate[1],
  }));

  const cumulativeDistances = [0];
  let totalDistance = 0;

  for (let index = 1; index < pathPoints.length; index += 1) {
    totalDistance += haversineMeters(pathPoints[index - 1], pathPoints[index]);
    cumulativeDistances.push(totalDistance);
  }

  const first = pathPoints[0] || DEFAULT_CENTER;
  const last = pathPoints[pathPoints.length - 1] || DEFAULT_CENTER;

  return {
    pathPoints,
    cumulativeDistances,
    routeKey: `${first.lat.toFixed(5)}:${first.lng.toFixed(5)}-${last.lat.toFixed(5)}:${last.lng.toFixed(5)}-${Math.round(totalDistance)}`,
  };
}

function evaluateRouteSafety(route, candidateMeta = {}) {
  const coordinates = route.geometry && Array.isArray(route.geometry.coordinates) ? route.geometry.coordinates : [];
  const sampleEvery = Math.max(1, Math.floor(coordinates.length / 80));
  let score = 92;
  const hits = [];

  HOTSPOTS.forEach((spot) => {
    let minDistance = Infinity;
    for (let index = 0; index < coordinates.length; index += sampleEvery) {
      const coord = coordinates[index];
      const meters = haversineMeters(
        { lat: coord[1], lng: coord[0] },
        { lat: spot.lat, lng: spot.lng }
      );
      if (meters < minDistance) {
        minDistance = meters;
      }
    }

    if (minDistance <= spot.radius) {
      score -= spot.severity === "danger" ? 24 : 12;
      hits.push({ label: spot.name, severity: spot.severity });
      return;
    }

    if (minDistance <= spot.radius * 1.6) {
      score -= spot.severity === "danger" ? 10 : 5;
      hits.push({ label: `Near ${spot.name}`, severity: "caution" });
    }
  });

  if (route.distance > 25000) score -= 4;
  if (route.duration > 3000) score -= 5;

  if (candidateMeta.routeBias === "safe") {
    score += hits.some((hit) => hit.severity === "danger") ? 0 : 5;
  } else if (candidateMeta.routeBias === "danger") {
    score -= 18;
  } else if (candidateMeta.routeBias === "backup") {
    score -= 4;
  }

  score = clamp(Math.round(score), 28, 97);
  const status = score >= 78 ? "safe" : score >= 55 ? "caution" : "danger";
  let note =
    hits.length === 0
      ? "Low hotspot overlap"
      : `${hits.length} safety hotspot${hits.length > 1 ? "s" : ""} on or near the route`;

  let tags = hits.length
    ? hits.slice(0, 3)
    : [
        { label: "Low hotspot overlap", severity: "safe" },
        { label: route.duration < 1800 ? "Fast arrival" : "Steady route", severity: "safe" },
      ];

  if (candidateMeta.routeBias === "safe") {
    tags.unshift({ label: "Detours away from danger pockets", severity: "safe" });
    if (!hits.length) {
      note = "Avoids nearby danger hotspots with a safer detour";
    }
  }

  if (candidateMeta.routeBias === "danger") {
    const dangerTags = Array.isArray(candidateMeta.hotspotNames) && candidateMeta.hotspotNames.length
      ? candidateMeta.hotspotNames.slice(0, 2).map((name) => ({ label: `Via ${name}`, severity: "danger" }))
      : [{ label: "High-risk corridor", severity: "danger" }];
    tags = [...dangerTags, ...tags];
    note = "Passes through a higher-risk corridor and reported danger pockets";
  }

  if (candidateMeta.routeBias === "backup" && !hits.length) {
    tags.unshift({ label: "Alternate live route", severity: "caution" });
    note = "Alternate route with a moderate safety buffer";
  }

  tags = dedupeSafetyTags(tags).slice(0, 4);

  return {
    score,
    status,
    color: status === "safe" ? "#34c759" : status === "caution" ? "#ff9f0a" : "#ff2d55",
    note,
    tags,
  };
}

function getRouteLayerStyle(route, isSelected) {
  return {
    color: route.safety.color,
    weight: isSelected ? 6 : route.safety.status === "danger" ? 5 : 4,
    opacity: isSelected ? 0.95 : route.safety.status === "danger" ? 0.76 : route.safety.status === "caution" ? 0.58 : 0.42,
    dashArray: route.safety.status === "danger" ? "14 10" : route.safety.status === "caution" ? "10 7" : null,
    lineCap: "round",
    lineJoin: "round",
  };
}

function drawRoutes() {
  clearRenderedRoutes();

  state.routeResults.forEach((route, index) => {
    const layer = L.geoJSON(route.geometry, {
      style: getRouteLayerStyle(route, index === state.selectedRouteIndex),
    }).addTo(state.map);

    layer.on("click", () => selectRoute(index, false));
    state.routeLayers.push(layer);
  });
}

function selectRoute(index, fitBounds) {
  const selectedRoute = state.routeResults[index];
  if (!selectedRoute) return;

  const previousKey = state.journeyActiveRouteKey;
  state.selectedRouteIndex = index;
  if (previousKey !== selectedRoute.routeKey) {
    state.journeyProgressRatio = 0;
  }
  state.journeyActiveRouteKey = selectedRoute.routeKey;
  updateRouteStyles();
  renderRouteCards();
  renderRouteSteps();
  syncVehicleMarkerToRoute();
  updateStats();

  if (state.journeyActive) {
    startJourneyAnimation(false);
  }

  if (fitBounds && state.routeLayers[index]) {
    state.map.fitBounds(state.routeLayers[index].getBounds(), {
      padding: [60, 60],
      animate: true,
    });
  }
}

function updateRouteStyles() {
  state.routeLayers.forEach((layer, index) => {
    const route = state.routeResults[index];
    layer.setStyle(getRouteLayerStyle(route, index === state.selectedRouteIndex));
  });
}

function renderRouteCards() {
  if (!state.routeResults.length) {
    renderEmptyRoutes("Search a destination to show live route options.");
    return;
  }

  refs.routeCardsWrap.innerHTML = state.routeResults
    .map((route, index) => {
      const activeClass = index === state.selectedRouteIndex ? " active" : "";
      const badgeTone = route.safety.status;
      const routeTags = route.safety.tags
        .map(
          (tag) =>
            `<span class="route-hit-tag ${escapeHtml(tag.severity)}">${escapeHtml(tag.label)}</span>`
        )
        .join("");

      return `
        <div class="route-card${activeClass}" data-route-index="${index}">
          <div class="route-card-top">
            <div>
              <div class="route-card-name">${escapeHtml(route.label.name)}</div>
              <div class="route-card-copy">${escapeHtml(route.label.copy)} - ${escapeHtml(route.safety.note)}</div>
            </div>
            <span class="route-badge ${badgeTone}">${escapeHtml(route.safety.status)}</span>
          </div>
          <div class="route-metric-grid">
            <div class="route-metric"><div class="route-metric-label">ETA</div><div class="route-metric-value">${escapeHtml(route.durationText)}</div></div>
            <div class="route-metric"><div class="route-metric-label">Distance</div><div class="route-metric-value">${escapeHtml(route.distanceText)}</div></div>
            <div class="route-metric"><div class="route-metric-label">Safety</div><div class="route-metric-value">${escapeHtml(route.scoreText)}</div></div>
          </div>
          <div class="route-hit-tags">${routeTags}</div>
        </div>
      `;
    })
    .join("");

  refs.routeCardsWrap.querySelectorAll(".route-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectRoute(parseInt(card.dataset.routeIndex, 10), true);
    });
  });
}

function renderRouteSteps() {
  const route = state.routeResults[state.selectedRouteIndex];
  if (!route || !route.steps || !route.steps.length) {
    refs.turnStepsWrap.hidden = true;
    refs.turnStepsList.innerHTML = "";
    return;
  }

  refs.turnStepsWrap.hidden = false;
  refs.selectedRouteBadge.textContent = route.label.name;

  refs.turnStepsList.innerHTML = route.steps.slice(0, 8).map((step, index) => {
    const text = formatStepInstruction(step);
    const meta = `${formatDistance(step.distance || 0)} - ${formatDuration(step.duration || 0)}`;
    return `
      <div class="turn-step">
        <div class="turn-step-num">${index + 1}</div>
        <div>
          <div class="turn-step-text">${escapeHtml(text)}</div>
          <div class="turn-step-meta">${escapeHtml(meta)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function formatStepInstruction(step) {
  const maneuver = step.maneuver || {};
  const type = maneuver.type || "continue";
  const modifier = maneuver.modifier ? maneuver.modifier.replace(/_/g, " ") : "";
  const road = step.name ? ` on ${step.name}` : "";

  if (type === "depart") return `Head out${road}`;
  if (type === "arrive") return "Arrive at your destination";
  if (type === "turn") return `Turn ${modifier || "ahead"}${road}`.trim();
  if (type === "merge") return `Merge ${modifier || ""}${road}`.trim();
  if (type === "fork") return `Keep ${modifier || "ahead"}${road}`.trim();
  if (type === "roundabout") return `Take the roundabout${road}`.trim();
  if (type === "new name") return `Continue${road}`;
  if (type === "end of road") return `At the end of the road, turn ${modifier || "ahead"}${road}`.trim();
  if (type === "continue") return `Continue${road}`;
  return `${capitalize(type)} ${modifier}`.trim() + road;
}

function renderEmptyRoutes(message) {
  refs.routeCardsWrap.innerHTML = `<div class="route-empty">${escapeHtml(message)}</div>`;
}

function clearRoute() {
  refs.toInp.value = "";
  state.destination = null;
  hideSuggestions("to");
  resetRouteState(true);
  renderEmptyRoutes("Destination cleared. Search again or pin a new point on the map.");
  refs.turnStepsWrap.hidden = true;
  updateDestinationMarker();
  setStatus("Route cleared. The live map is still active.", "neutral");
  updateStats();
}

function resetRouteState(keepDestination) {
  clearRenderedRoutes();
  cancelJourneyAnimation();
  removeVehicleMarker();
  state.routeResults = [];
  state.selectedRouteIndex = 0;
  state.journeyActive = false;
  state.journeyProgressRatio = 0;
  state.journeyActiveRouteKey = "";
  state.vehiclePosition = null;
  if (!keepDestination) {
    state.destination = null;
    updateDestinationMarker();
  }
  updateToolButtons();
}

function clearRenderedRoutes() {
  state.routeLayers.forEach((layer) => state.map.removeLayer(layer));
  state.routeLayers = [];
}

function syncVehicleMarkerToRoute() {
  const route = state.routeResults[state.selectedRouteIndex];
  if (!route) {
    removeVehicleMarker();
    return;
  }

  const pose = getPointAlongRoute(route, clamp(state.journeyProgressRatio, 0, 1));
  if (!pose) {
    removeVehicleMarker();
    return;
  }

  ensureVehicleMarker();
  const label =
    state.journeyActive
      ? state.journeyProgressRatio >= 1
        ? "Arrived"
        : formatDistance(route.distance * (1 - state.journeyProgressRatio))
      : "Trip car";

  setVehiclePose(pose, label);
}

function ensureVehicleMarker() {
  if (state.vehicleMarker) return;

  state.vehicleMarker = L.marker([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], {
    icon: buildVehicleMarkerIcon(),
    zIndexOffset: 950,
  }).addTo(state.map);
}

function setVehiclePose(pose, label) {
  state.vehiclePosition = { lat: pose.lat, lng: pose.lng, bearing: pose.bearing };
  state.vehicleMarker.setLatLng([pose.lat, pose.lng]);

  const element = state.vehicleMarker.getElement();
  if (!element) return;

  const shell = element.querySelector(".vehicle-shell");
  const chip = element.querySelector(".vehicle-label");
  if (shell) {
    shell.style.setProperty("--car-rotate", `${pose.bearing}deg`);
  }
  if (chip) {
    chip.textContent = label;
  }
}

function removeVehicleMarker() {
  if (state.vehicleMarker) {
    state.map.removeLayer(state.vehicleMarker);
    state.vehicleMarker = null;
  }
  state.vehiclePosition = null;
}

function getPointAlongRoute(route, ratio) {
  const points = route.pathPoints || [];
  const cumulative = route.cumulativeDistances || [];

  if (!points.length) return null;
  if (points.length === 1) {
    return { lat: points[0].lat, lng: points[0].lng, bearing: 0 };
  }

  const total = cumulative[cumulative.length - 1] || route.distance || 1;
  const target = total * clamp(ratio, 0, 1);

  for (let index = 1; index < cumulative.length; index += 1) {
    if (target <= cumulative[index]) {
      const previousDistance = cumulative[index - 1];
      const segmentDistance = cumulative[index] - previousDistance || 1;
      const segmentRatio = (target - previousDistance) / segmentDistance;
      const from = points[index - 1];
      const to = points[index];
      return {
        ...interpolatePoint(from, to, segmentRatio),
        bearing: calculateBearing(from, to),
      };
    }
  }

  return {
    lat: points[points.length - 1].lat,
    lng: points[points.length - 1].lng,
    bearing: calculateBearing(points[points.length - 2], points[points.length - 1]),
  };
}

function interpolatePoint(from, to, ratio) {
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lng: from.lng + (to.lng - from.lng) * ratio,
  };
}

function calculateBearing(from, to) {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const deltaLng = ((to.lng - from.lng) * Math.PI) / 180;

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function toggleFollowMode() {
  state.followLive = !state.followLive;
  updateToolButtons();

  if (state.followLive) {
    recenterMap();
    setStatus("Follow mode is on. The map will keep tracking your live trip.", "success");
  } else {
    setStatus("Follow mode is off. You can freely inspect the map.", "neutral");
  }
}

function recenterMap() {
  const selectedLayer = state.routeLayers[state.selectedRouteIndex];

  if (state.vehiclePosition) {
    state.map.setView([state.vehiclePosition.lat, state.vehiclePosition.lng], Math.max(state.map.getZoom(), 15), {
      animate: true,
    });
    return;
  }

  if (selectedLayer) {
    state.map.fitBounds(selectedLayer.getBounds(), {
      padding: [60, 60],
      animate: true,
    });
    return;
  }

  if (state.currentLocation) {
    state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 15, { animate: true });
    return;
  }

  state.map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12, { animate: true });
}

function toggleJourney() {
  const route = state.routeResults[state.selectedRouteIndex];
  if (!route) {
    setStatus("Find a route first, then start the journey tracker.", "warn");
    return;
  }

  if (state.journeyActive) {
    state.journeyActive = false;
    cancelJourneyAnimation();
    updateToolButtons();
    updateStats();
    setStatus("Journey paused. The 3D car stays on the last tracked position.", "neutral");
    return;
  }

  if (state.journeyActiveRouteKey !== route.routeKey || state.journeyProgressRatio >= 1) {
    state.journeyProgressRatio = 0;
  }

  state.journeyActive = true;
  state.journeyActiveRouteKey = route.routeKey;
  updateToolButtons();
  setStatus("Journey started. The 3D car is now moving along the selected route.", "success");
  startJourneyAnimation(false);
}

function startJourneyAnimation(resetProgress) {
  const route = state.routeResults[state.selectedRouteIndex];
  if (!route) return;

  cancelJourneyAnimation();

  if (resetProgress || state.journeyProgressRatio >= 1) {
    state.journeyProgressRatio = 0;
  }

  state.journeyActiveRouteKey = route.routeKey;
  syncVehicleMarkerToRoute();

  const durationMs = getJourneyAnimationDuration(route);
  state.journeyAnimationStart = performance.now() - state.journeyProgressRatio * durationMs;

  const animate = (timestamp) => {
    if (!state.journeyActive) return;

    state.journeyProgressRatio = clamp((timestamp - state.journeyAnimationStart) / durationMs, 0, 1);
    syncVehicleMarkerToRoute();
    updateStats();

    if (state.followLive && state.vehiclePosition) {
      state.map.panTo([state.vehiclePosition.lat, state.vehiclePosition.lng], {
        animate: true,
        duration: 0.3,
      });
    }

    if (state.journeyProgressRatio >= 1) {
      state.journeyActive = false;
      cancelJourneyAnimation();
      updateToolButtons();
      updateStats();
      setStatus("Journey completed. The 3D car reached the destination.", "success");
      return;
    }

    state.journeyAnimationFrame = requestAnimationFrame(animate);
  };

  state.journeyAnimationFrame = requestAnimationFrame(animate);
}

function cancelJourneyAnimation() {
  if (state.journeyAnimationFrame !== null) {
    cancelAnimationFrame(state.journeyAnimationFrame);
    state.journeyAnimationFrame = null;
  }
}

function getJourneyAnimationDuration(route) {
  const simulatedSeconds = clamp(route.duration / 12, 45, 150);
  return simulatedSeconds * 1000;
}

function updateToolButtons() {
  refs.followBtn.textContent = state.followLive ? "Following live" : "Follow live";
  refs.followBtn.classList.toggle("primary", state.followLive);
  refs.journeyBtn.textContent = state.journeyActive ? "Pause journey" : "Start journey";
  refs.pickOnMapBtn.textContent = state.pickOnMap ? "Tap map now" : "Pick on map";
}

function updateStats() {
  const selectedRoute = state.routeResults[state.selectedRouteIndex];
  const livePoint = state.vehiclePosition || state.currentLocation;

  refs.liveCoordsValue.textContent = livePoint
    ? `${livePoint.lat.toFixed(5)}, ${livePoint.lng.toFixed(5)}`
    : "Waiting...";

  if (!selectedRoute) {
    refs.etaValue.textContent = "-";
    refs.distanceValue.textContent = "-";
    refs.speedValue.textContent =
      state.currentLocation && state.currentLocation.speedMetersPerSec !== null
        ? `${Math.round(state.currentLocation.speedMetersPerSec * 3.6)} km/h`
        : "-";
    return;
  }

  const remainingRatio = clamp(1 - state.journeyProgressRatio, 0, 1);

  if (state.vehiclePosition) {
    refs.distanceValue.textContent =
      remainingRatio <= 0 ? "0 m" : formatDistance(selectedRoute.distance * remainingRatio);
    refs.etaValue.textContent =
      remainingRatio <= 0 ? "Arrived" : formatDuration(selectedRoute.duration * remainingRatio);

    if (state.journeyActive) {
      const simulatedSpeedKmh = Math.round(
        (selectedRoute.distance / (getJourneyAnimationDuration(selectedRoute) / 1000)) * 3.6
      );
      refs.speedValue.textContent = `${simulatedSpeedKmh} km/h`;
    } else if (state.journeyProgressRatio >= 1) {
      refs.speedValue.textContent = "Arrived";
    } else {
      refs.speedValue.textContent = "Parked";
    }
    return;
  }

  refs.distanceValue.textContent = selectedRoute.distanceText;
  refs.etaValue.textContent = selectedRoute.durationText;
  refs.speedValue.textContent =
    state.currentLocation && state.currentLocation.speedMetersPerSec !== null
      ? `${Math.round(state.currentLocation.speedMetersPerSec * 3.6)} km/h`
      : "-";
}

async function apiGet(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("Map service returned an invalid response.");
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || "Map request failed.");
  }

  return data;
}

function haversineMeters(pointA, pointB) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(pointB.lat - pointA.lat);
  const dLng = toRad(pointB.lng - pointA.lng);
  const lat1 = toRad(pointA.lat);
  const lat2 = toRad(pointB.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.max(1, Math.round(meters))} m`;
  }
  return `${(meters / 1000).toFixed(meters > 10000 ? 0 : 1)} km`;
}

function formatDuration(seconds) {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

document.addEventListener("DOMContentLoaded", initMapPage);
