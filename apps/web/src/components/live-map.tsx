"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/lib/supabase";
import { CHICAGO_CENTER, TRAIN_LINES } from "@cpt/shared";
import type { DbVehicle, DbStop, TrainLineId } from "@cpt/shared";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────

interface RoutePattern {
  pid: number;
  direction: string;
  points: Array<{ lat: number; lng: number; type: string; stopId?: string; stopName?: string }>;
}

interface StopPrediction {
  route: string;
  direction: string;
  destination: string;
  minutes: number;
  delayed: boolean;
  type: "bus" | "train";
}

interface ActiveStopInfo {
  stopIds: string[];
  name: string;
  lat: number;
  lng: number;
  stopType: "bus" | "train";
  predictions: StopPrediction[];
  routePatterns: Array<{ route: string; color: string; patterns: RoutePattern[] }>;
}

interface TrainLineSegment {
  lineId: string;
  color: string;
  coordinates: [number, number][][];
  shared?: boolean;
  offsetIndex?: number;
  totalShared?: number;
}

// A merged train station (multiple stops at same location)
interface TrainStation {
  key: string; // lat,lng rounded
  name: string; // station name (without direction)
  lat: number;
  lng: number;
  lines: { lineId: string; color: string }[];
  stopIds: string[];
}

const BUS_ROUTE_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

// ─── Offset utility for rainbow parallel lines ──────────────────

function offsetPolyline(
  coords: [number, number][],
  offsetIndex: number,
  totalLines: number
): [number, number][] {
  if (coords.length < 2) return coords;
  const centerOffset = (totalLines - 1) / 2;
  const shift = (offsetIndex - centerOffset) * 0.00012;
  return coords.map((point, i) => {
    const prev = coords[Math.max(0, i - 1)];
    const next = coords[Math.min(coords.length - 1, i + 1)];
    const dlat = next[0] - prev[0];
    const dlng = next[1] - prev[1];
    const len = Math.sqrt(dlat * dlat + dlng * dlng);
    if (len === 0) return point;
    const perpLat = -dlng / len;
    const perpLng = dlat / len;
    return [point[0] + perpLat * shift, point[1] + perpLng * shift] as [number, number];
  });
}

// ─── Custom Icons ───────────────────────────────────────────────

function createBusVehicleIcon(active: boolean = false) {
  const size = active ? 18 : 14;
  const ring = active ? "box-shadow:0 0 0 2px #facc15,0 2px 6px rgba(0,0,0,0.5);" : "box-shadow:0 1px 4px rgba(0,0,0,0.5);";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:4px;background:#1d4ed8;display:flex;align-items:center;justify-content:center;${ring}">
      <svg width="${size - 4}" height="${size - 4}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="7.5" cy="20" r="1.5"/><circle cx="16.5" cy="20" r="1.5"/><path d="M5.5 17h13"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createTrainVehicleIcon(color: string, active: boolean = false) {
  const size = active ? 18 : 14;
  const ring = active ? "box-shadow:0 0 0 2px #facc15,0 2px 6px rgba(0,0,0,0.5);" : "box-shadow:0 1px 4px rgba(0,0,0,0.5);";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;${ring}">
      <svg width="${size - 4}" height="${size - 4}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 10h16"/><path d="m9 19-2 3"/><path d="m17 22-2-3"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 2px #3b82f6, 0 2px 8px rgba(59,130,246,0.5);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Train station icon — BIGGER than vehicles, shows line colors as stripes
function createTrainStationIcon(lines: { color: string }[], isActive: boolean) {
  const size = isActive ? 28 : 22;
  const glow = isActive ? "box-shadow:0 0 10px 4px rgba(255,255,255,0.4);" : "box-shadow:0 2px 6px rgba(0,0,0,0.5);";
  // Create colored stripe bar for multiple lines
  const stripes = lines
    .map((l) => l.color)
    .map((c, i) => {
      const pct1 = (i / lines.length) * 100;
      const pct2 = ((i + 1) / lines.length) * 100;
      return `${c} ${pct1}%, ${c} ${pct2}%`;
    })
    .join(", ");
  const bg = lines.length === 1 ? lines[0].color : `linear-gradient(90deg, ${stripes})`;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid white;${glow}display:flex;align-items:center;justify-content:center;">
      <svg width="${size - 10}" height="${size - 10}" viewBox="0 0 24 24" fill="white" opacity="0.9">
        <path d="M12 2C8 2 4 3.5 4 6v9c0 1.66 1.34 3 3 3l-1.5 1.5v.5h1.5l2-2h6l2 2h1.5v-.5L17 18c1.66 0 3-1.34 3-3V6c0-2.5-4-4-8-4zM7.5 15c-.83 0-1.5-.67-1.5-1.5S6.67 12 7.5 12s1.5.67 1.5 1.5S8.33 15 7.5 15zm3.5-5H6V7h5v3zm2 0V7h5v3h-5zm3.5 5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Bus stop icon
function createBusStopIcon(isActive: boolean) {
  const size = isActive ? 16 : 12;
  const glow = isActive ? "box-shadow:0 0 8px 3px #3b82f6;" : "box-shadow:0 1px 3px rgba(0,0,0,0.4);";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#6b7280;border:2px solid white;${glow}opacity:0.9;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ─── Dynamic Tile Layer ─────────────────────────────────────────

function DynamicTileLayer({ url, attribution }: { url: string; attribution: string }) {
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);
  useEffect(() => {
    if (layerRef.current) map.removeLayer(layerRef.current);
    const layer = L.tileLayer(url, { attribution, maxZoom: 19 });
    layer.addTo(map);
    layerRef.current = layer;
    return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
  }, [url, attribution, map]);
  return null;
}

// ─── Map Setup ──────────────────────────────────────────────────

function MapSetup({
  onBoundsChange,
  userLocation,
}: {
  onBoundsChange: (bounds: L.LatLngBounds) => void;
  userLocation: [number, number] | null;
}) {
  const map = useMap();
  const hasCentered = useRef(false);
  useEffect(() => {
    if (userLocation && !hasCentered.current) {
      map.setView(userLocation, 14);
      hasCentered.current = true;
    }
  }, [userLocation, map]);
  useEffect(() => { onBoundsChange(map.getBounds()); }, [map, onBoundsChange]);
  useMapEvents({ moveend: () => onBoundsChange(map.getBounds()) });
  return null;
}

// ─── Pattern Cache ──────────────────────────────────────────────

const patternCache = new Map<string, RoutePattern[]>();
async function fetchBusPattern(route: string): Promise<RoutePattern[]> {
  const key = `bus-${route}`;
  if (patternCache.has(key)) return patternCache.get(key)!;
  try {
    const res = await fetch(`/api/route-pattern?rt=${route}`);
    const data = await res.json();
    const patterns = data.patterns ?? [];
    patternCache.set(key, patterns);
    return patterns;
  } catch { return []; }
}

// ─── Train Line Geometry ────────────────────────────────────────

let trainLineGeoCache: TrainLineSegment[] | null = null;
async function fetchTrainLineGeometry(): Promise<TrainLineSegment[]> {
  if (trainLineGeoCache) return trainLineGeoCache;
  try {
    const res = await fetch("/api/train-lines");
    trainLineGeoCache = await res.json();
    return trainLineGeoCache!;
  } catch { return []; }
}

function getTrainLineSegments(allSegments: TrainLineSegment[], lineId: string): [number, number][][] {
  return allSegments
    .filter((s) => s.lineId === lineId)
    .flatMap((s) => s.coordinates);
}

// ─── Main Component ─────────────────────────────────────────────

interface VehicleStopPrediction {
  stopName: string;
  stopId: string;
  route: string;
  direction: string;
  destination: string;
  minutes: number;
  delayed: boolean;
}

export default function LiveMap() {
  const [vehicles, setVehicles] = useState<DbVehicle[]>([]);
  const [trainStops, setTrainStops] = useState<DbStop[]>([]);
  const [busStopsInView, setBusStopsInView] = useState<DbStop[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<{
    vehicleId: string; type: "bus" | "train"; route: string;
    direction: string; destination: string; stops: VehicleStopPrediction[];
  } | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [showBuses, setShowBuses] = useState(true);
  const [showTrains, setShowTrains] = useState(true);
  const [showBusStops, setShowBusStops] = useState(true);
  const [showTrainStops, setShowTrainStops] = useState(true);
  const [activeVehicleRoute, setActiveVehicleRoute] = useState<{
    route: string; type: "bus" | "train"; patterns: RoutePattern[]; color: string;
  } | null>(null);
  const [activeStop, setActiveStop] = useState<ActiveStopInfo | null>(null);
  const [loadingStop, setLoadingStop] = useState(false);
  const [trainLineGeo, setTrainLineGeo] = useState<TrainLineSegment[]>([]);
  const [favoriteStopIds, setFavoriteStopIds] = useState<Set<string>>(new Set());
  const { userId } = useAuth();
  const vehicleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load user's favorites
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_favorites")
      .select("stop_id")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data) setFavoriteStopIds(new Set(data.map((f) => f.stop_id)));
      });
  }, [userId]);

  async function toggleFavorite(stopId: string) {
    if (!userId) return;
    const isFav = favoriteStopIds.has(stopId);
    if (isFav) {
      await supabase.from("user_favorites").delete().eq("user_id", userId).eq("stop_id", stopId);
      setFavoriteStopIds((prev) => { const n = new Set(prev); n.delete(stopId); return n; });
    } else {
      await supabase.from("user_favorites").insert({ user_id: userId, stop_id: stopId });
      setFavoriteStopIds((prev) => new Set(prev).add(stopId));
    }
  }

  // ─── Load ALL train stops once (only 300) ───────────────────
  useEffect(() => {
    supabase.from("stops").select("*").eq("type", "train").then(({ data }) => {
      if (data) setTrainStops(data);
    });
  }, []);

  // ─── Merge train stops into stations (same lat/lng = same station) ──
  const trainStations = useMemo<TrainStation[]>(() => {
    const map = new Map<string, TrainStation>();
    for (const stop of trainStops) {
      // Round to 3 decimal places (~100m) to merge nearby stops at same station
      const key = `${stop.lat.toFixed(3)},${stop.lng.toFixed(3)}`;
      const existing = map.get(key);
      const lineId = stop.route_id;
      const color = TRAIN_LINES[lineId as TrainLineId]?.color ?? "#888";
      if (existing) {
        if (!existing.stopIds.includes(stop.stop_id)) existing.stopIds.push(stop.stop_id);
        if (!existing.lines.find((l) => l.lineId === lineId)) {
          existing.lines.push({ lineId, color });
        }
      } else {
        // Strip direction from name for cleaner display
        const cleanName = stop.name.replace(/\s*\(.*\)$/, "");
        map.set(key, {
          key,
          name: cleanName,
          lat: stop.lat,
          lng: stop.lng,
          lines: [{ lineId, color }],
          stopIds: [stop.stop_id],
        });
      }
    }
    return [...map.values()];
  }, [trainStops]);

  // ─── Load train line geometry ───────────────────────────────
  useEffect(() => { fetchTrainLineGeometry().then(setTrainLineGeo); }, []);

  // ─── User location ──────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setUserLocation([CHICAGO_CENTER.lat, CHICAGO_CENTER.lng]); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => setUserLocation([CHICAGO_CENTER.lat, CHICAGO_CENTER.lng]),
      { enableHighAccuracy: true }
    );
  }, []);

  // ─── Load bus stops in viewport ─────────────────────────────
  const handleBoundsChange = useCallback(async (bounds: L.LatLngBounds) => {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const { data } = await supabase
      .from("stops")
      .select("*")
      .eq("type", "bus")
      .gte("lat", sw.lat)
      .lte("lat", ne.lat)
      .gte("lng", sw.lng)
      .lte("lng", ne.lng)
      .limit(300);
    if (data) setBusStopsInView(data);
  }, []);

  // ─── Fetch vehicles ─────────────────────────────────────────
  const fetchVehicles = useCallback(async () => {
    const { data } = await supabase.from("vehicles").select("*");
    if (data) setVehicles(data);
  }, []);

  useEffect(() => {
    fetchVehicles();
    vehicleTimerRef.current = setInterval(fetchVehicles, 10_000);
    return () => { if (vehicleTimerRef.current) clearInterval(vehicleTimerRef.current); };
  }, [fetchVehicles]);

  // ─── Realtime vehicle updates ───────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("vehicles-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { vehicle_id: string; type: string };
          setVehicles((prev) => prev.filter((v) => !(v.vehicle_id === old.vehicle_id && v.type === old.type)));
        } else {
          const vehicle = payload.new as DbVehicle;
          setVehicles((prev) => {
            const idx = prev.findIndex((v) => v.vehicle_id === vehicle.vehicle_id && v.type === vehicle.type);
            if (idx >= 0) { const u = [...prev]; u[idx] = vehicle; return u; }
            return [...prev, vehicle];
          });
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── Vehicle click ──────────────────────────────────────────
  async function handleVehicleClick(vehicle: DbVehicle) {
    setActiveStop(null);
    const routeKey = `${vehicle.type}-${vehicle.route}`;
    if (activeVehicleRoute && `${activeVehicleRoute.type}-${activeVehicleRoute.route}` === routeKey) {
      setActiveVehicleRoute(null); setSelectedVehicle(null); return;
    }

    // Fetch upcoming stops for this vehicle (bus only — CTA API supports vid query)
    if (vehicle.type === "bus") {
      const patterns = await fetchBusPattern(vehicle.route);
      setActiveVehicleRoute({ route: vehicle.route, type: "bus", patterns, color: "#3b82f6" });
      // Fetch this bus's upcoming stops
      try {
        const res = await fetch(`/api/vehicle-predictions?vid=${vehicle.vehicle_id}`);
        const data = await res.json();
        setSelectedVehicle({
          vehicleId: vehicle.vehicle_id, type: "bus", route: data.route ?? vehicle.route,
          direction: data.direction ?? "", destination: data.destination ?? vehicle.destination ?? "",
          stops: data.predictions ?? [],
        });
      } catch {
        setSelectedVehicle({
          vehicleId: vehicle.vehicle_id, type: "bus", route: vehicle.route,
          direction: "", destination: vehicle.destination ?? "", stops: [],
        });
      }
    } else {
      const lineColor = TRAIN_LINES[vehicle.route as TrainLineId]?.color ?? "#888";
      const allGeo = await fetchTrainLineGeometry();
      const segments = getTrainLineSegments(allGeo, vehicle.route);
      const patterns: RoutePattern[] = segments.map((coords, i) => ({
        pid: i, direction: "", points: coords.map(([lat, lng]) => ({ lat, lng, type: "W" })),
      }));
      setActiveVehicleRoute({ route: vehicle.route, type: "train", patterns, color: lineColor });
      setSelectedVehicle({
        vehicleId: vehicle.vehicle_id, type: "train", route: vehicle.route,
        direction: "", destination: vehicle.destination ?? "", stops: [],
      });
    }
  }

  // ─── Train station click — fetch predictions for ALL platforms ──
  async function handleTrainStationClick(station: TrainStation) {
    setActiveVehicleRoute(null);
    if (activeStop && activeStop.stopIds.join() === station.stopIds.join()) { setActiveStop(null); return; }
    setLoadingStop(true);

    // Fetch predictions for each stop_id at this station, merge & sort
    const allPredictions: StopPrediction[] = [];
    const fetches = station.stopIds.map(async (stpid) => {
      try {
        const res = await fetch(`/api/stop-predictions?stpid=${stpid}&type=train`);
        const data = await res.json();
        return (data.predictions ?? []) as Array<{
          route: string; direction: string; destination: string; minutes: number; isDelayed: boolean; type: string;
        }>;
      } catch { return []; }
    });
    const results = await Promise.all(fetches);
    for (const preds of results) {
      for (const p of preds) {
        // Deduplicate by route+destination+minutes
        if (!allPredictions.find((x) => x.route === p.route && x.destination === p.destination && x.minutes === p.minutes)) {
          allPredictions.push({
            route: p.route, direction: p.direction, destination: p.destination,
            minutes: p.minutes, delayed: p.isDelayed, type: "train",
          });
        }
      }
    }
    allPredictions.sort((a, b) => a.minutes - b.minutes);

    // Get route patterns for highlighting
    const uniqueRoutes = [...new Set(allPredictions.map((p) => p.route))];
    for (const line of station.lines) {
      if (!uniqueRoutes.includes(line.lineId)) uniqueRoutes.push(line.lineId);
    }
    const allGeo = await fetchTrainLineGeometry();
    const routePatterns = uniqueRoutes.map((rt) => ({
      route: rt,
      color: TRAIN_LINES[rt as TrainLineId]?.color ?? "#888",
      patterns: getTrainLineSegments(allGeo, rt).map((coords, j) => ({
        pid: j, direction: "", points: coords.map(([lat, lng]) => ({ lat, lng, type: "W" })),
      })),
    }));

    setActiveStop({
      stopIds: station.stopIds, name: station.name, lat: station.lat, lng: station.lng,
      stopType: "train", predictions: allPredictions, routePatterns,
    });
    setLoadingStop(false);
  }

  // ─── Bus stop click ─────────────────────────────────────────
  async function handleBusStopClick(stop: DbStop) {
    setActiveVehicleRoute(null);
    if (activeStop && activeStop.stopIds[0] === stop.stop_id) { setActiveStop(null); return; }
    setLoadingStop(true);
    try {
      const res = await fetch(`/api/stop-predictions?stpid=${stop.stop_id}&type=bus`);
      const data = await res.json();
      const predictions: StopPrediction[] = (data.predictions ?? []).map(
        (p: { route: string; direction: string; destination: string; minutes: number; isDelayed: boolean; type: string }) => ({
          route: p.route, direction: p.direction, destination: p.destination,
          minutes: p.minutes, delayed: p.isDelayed, type: "bus",
        })
      );
      const uniqueRoutes = [...new Set(predictions.map((p) => p.route))];
      const routePatterns = await Promise.all(
        uniqueRoutes.slice(0, 5).map(async (rt, i) => ({
          route: rt, color: BUS_ROUTE_COLORS[i % BUS_ROUTE_COLORS.length],
          patterns: await fetchBusPattern(rt),
        }))
      );
      setActiveStop({
        stopIds: [stop.stop_id], name: stop.name, lat: stop.lat, lng: stop.lng,
        stopType: "bus", predictions, routePatterns,
      });
    } catch {
      setActiveStop({ stopIds: [stop.stop_id], name: stop.name, lat: stop.lat, lng: stop.lng, stopType: "bus", predictions: [], routePatterns: [] });
    }
    setLoadingStop(false);
  }

  // ─── Map style ───────────────────────────────────────────────
  const [mapStyle, setMapStyle] = useState<"dark" | "light" | "satellite">("dark");

  const TILE_LAYERS = {
    dark: {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    },
    light: {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    },
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: '&copy; Esri',
    },
  };

  const currentTile = TILE_LAYERS[mapStyle];

  // ─── Derived ────────────────────────────────────────────────
  const center: [number, number] = userLocation ?? [CHICAGO_CENTER.lat, CHICAGO_CENTER.lng];
  const filteredVehicles = vehicles.filter((v) => {
    if (v.type === "bus" && !showBuses) return false;
    if (v.type === "train" && !showTrains) return false;
    return true;
  });

  // ─── Render prediction popup content ────────────────────────
  function renderPredictions(info: ActiveStopInfo) {
    return (
      <div className="text-xs min-w-[220px] max-w-[280px]">
        <p className="font-bold text-sm">{info.name}</p>
        {/* Line badges */}
        <div className="flex flex-wrap gap-1 mt-1">
          {info.routePatterns.map((rp) => (
            <span key={rp.route} className="rounded px-1.5 py-0.5 text-white text-[10px] font-bold" style={{ backgroundColor: rp.color }}>
              {info.stopType === "train" ? (TRAIN_LINES[rp.route as TrainLineId]?.name ?? rp.route) : `Rt ${rp.route}`}
            </span>
          ))}
        </div>

        {/* Predictions */}
        {info.predictions.length > 0 ? (
          <div className="mt-2 border-t pt-2 space-y-1.5">
            {info.predictions.slice(0, 8).map((p, i) => {
              const routeColor = p.type === "train"
                ? (TRAIN_LINES[p.route as TrainLineId]?.color ?? "#888")
                : (info.routePatterns.find((rp) => rp.route === p.route)?.color ?? "#1d4ed8");
              return (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block rounded px-1 py-0.5 text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: routeColor }}>
                      {p.route}
                    </span>
                    <span className="text-gray-600 truncate text-[11px]">{p.destination}</span>
                  </div>
                  <span className={`font-bold text-xs shrink-0 ${
                    p.delayed ? "text-red-500" : p.minutes <= 1 ? "text-green-600" : p.minutes <= 5 ? "text-yellow-600" : "text-gray-800"
                  }`}>
                    {p.minutes === 0 ? "Due" : `${p.minutes}m`}
                  </span>
                </div>
              );
            })}
          </div>
        ) : loadingStop ? (
          <p className="mt-2 text-gray-400 italic text-[11px]">Loading arrivals...</p>
        ) : (
          <p className="mt-2 text-gray-400 italic text-[11px]">No upcoming arrivals</p>
        )}

        {/* Favorite button — one per stop (uses first stop_id for stations) */}
        {userId && (() => {
          const sid = info.stopIds[0];
          const isFav = favoriteStopIds.has(sid);
          return (
            <div className="mt-2 border-t pt-2">
              <button onClick={(e) => { e.stopPropagation(); toggleFavorite(sid); }}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold border transition-colors ${isFav ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-500" : "border-white/20 text-white/50 hover:border-white/40 hover:text-white/70"}`}>
                {isFav ? "★ Favorited" : "☆ Favorite this stop"}
              </button>
            </div>
          );
        })()}

        <Link href={`/stops/${info.stopIds[0]}`} className="block mt-2 text-blue-500 underline text-[11px]">
          Full details →
        </Link>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={13} className="h-full w-full" zoomControl={false}>
        <DynamicTileLayer url={currentTile.url} attribution={currentTile.attribution} />
        <MapSetup onBoundsChange={handleBoundsChange} userLocation={userLocation} />

        {/* ── Train lines — rainbow parallel for shared segments ── */}
        {showTrains && trainLineGeo.map((segment) =>
          segment.coordinates.map((coords, i) => {
            const positions = segment.shared && segment.offsetIndex !== undefined && segment.totalShared
              ? offsetPolyline(coords, segment.offsetIndex, segment.totalShared) : coords;
            return (
              <Polyline key={`tl-${segment.lineId}-${segment.shared ? "s" : "o"}-${i}`} positions={positions}
                pathOptions={{
                  color: segment.color,
                  weight: segment.shared ? 4 : 5,
                  opacity: 0.85,
                }} />
            );
          })
        )}

        {/* ── Active stop route highlights ── */}
        {activeStop?.routePatterns.map((rp) =>
          rp.patterns.map((pattern, i) => (
            <Polyline key={`sr-${rp.route}-${pattern.pid}-${i}`}
              positions={pattern.points.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{ color: rp.color, weight: 5, opacity: 0.9 }} />
          ))
        )}

        {/* ── Active vehicle route ── */}
        {activeVehicleRoute?.patterns.map((pattern, i) => (
          <Polyline key={`vr-${activeVehicleRoute.route}-${pattern.pid}-${i}`}
            positions={pattern.points.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: activeVehicleRoute.color, weight: 5, opacity: 0.9 }} />
        ))}

        {/* ── User location ── */}
        {userLocation && (
          <>
            <Circle center={userLocation} radius={400} pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.08, weight: 1 }} />
            <Marker position={userLocation} icon={userIcon}><Popup>You are here</Popup></Marker>
          </>
        )}

        {/* ── Train stations (merged, always visible) ── */}
        {showTrainStops && trainStations.map((station) => {
          const isActive = activeStop?.stopIds.join() === station.stopIds.join();
          return (
            <Marker key={station.key} position={[station.lat, station.lng]}
              icon={createTrainStationIcon(station.lines, isActive)}
              zIndexOffset={100}
              eventHandlers={{ click: () => handleTrainStationClick(station) }}>
              <Popup>{isActive && activeStop ? renderPredictions(activeStop) : (
                <div className="text-xs">
                  <p className="font-bold text-sm">{station.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {station.lines.map((l) => (
                      <span key={l.lineId} className="rounded px-1.5 py-0.5 text-white text-[10px] font-bold" style={{ backgroundColor: l.color }}>
                        {TRAIN_LINES[l.lineId as TrainLineId]?.name ?? l.lineId}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-gray-400 text-[11px]">Click to see arrivals</p>
                </div>
              )}</Popup>
            </Marker>
          );
        })}

        {/* ── Bus stops (viewport) ── */}
        {showBusStops && busStopsInView.map((stop) => {
          const isActive = activeStop?.stopIds[0] === stop.stop_id;
          return (
            <Marker key={stop.stop_id} position={[stop.lat, stop.lng]}
              icon={createBusStopIcon(isActive)}
              eventHandlers={{ click: () => handleBusStopClick(stop) }}>
              <Popup>{isActive && activeStop ? renderPredictions(activeStop) : (
                <div className="text-xs">
                  <p className="font-semibold text-sm">{stop.name}</p>
                  <p className="text-gray-500">Bus · {stop.route_id}</p>
                  <p className="mt-1 text-gray-400 text-[11px]">Click to see arrivals</p>
                </div>
              )}</Popup>
            </Marker>
          );
        })}

        {/* ── Vehicles ── */}
        {filteredVehicles.map((v) => {
          const isActive = activeVehicleRoute?.route === v.route && activeVehicleRoute?.type === v.type;
          const isSelected = selectedVehicle?.vehicleId === v.vehicle_id && selectedVehicle?.type === v.type;
          const icon = v.type === "train"
            ? createTrainVehicleIcon(TRAIN_LINES[v.route as TrainLineId]?.color ?? "#888", isActive)
            : createBusVehicleIcon(isActive);
          const routeColor = v.type === "train" ? (TRAIN_LINES[v.route as TrainLineId]?.color ?? "#888") : "#1d4ed8";
          return (
            <Marker key={`${v.type}-${v.vehicle_id}`} position={[v.lat, v.lng]} icon={icon}
              eventHandlers={{ click: () => handleVehicleClick(v) }}>
              <Popup>
                <div className="text-xs min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="rounded px-1.5 py-0.5 text-white text-[10px] font-bold" style={{ backgroundColor: routeColor }}>
                      {v.route}
                    </span>
                    <p className="font-bold text-sm">
                      {v.type === "train" ? (TRAIN_LINES[v.route as TrainLineId]?.name ?? v.route) : `Bus ${v.route}`}
                    </p>
                  </div>
                  <p className="text-gray-500 mt-0.5">
                    #{v.vehicle_id} → {v.destination}
                    {isSelected && selectedVehicle.direction && (
                      <span className="ml-1 font-medium text-gray-700">({selectedVehicle.direction})</span>
                    )}
                  </p>
                  {v.is_delayed && <p className="text-red-500 font-medium">Delayed</p>}

                  {/* Upcoming stops for this vehicle */}
                  {isSelected && selectedVehicle.stops.length > 0 && (
                    <div className="mt-2 border-t pt-2">
                      <p className="font-semibold text-gray-700 mb-1 text-[11px]">Upcoming stops:</p>
                      <div className="space-y-1">
                        {selectedVehicle.stops.map((s, i) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <span className="text-gray-600 truncate text-[11px]">{s.stopName}</span>
                            <span className={`font-bold text-[11px] shrink-0 ${
                              s.minutes <= 1 ? "text-green-600" : s.minutes <= 5 ? "text-yellow-600" : "text-gray-800"
                            }`}>
                              {s.minutes === 0 ? "Due" : `${s.minutes}m`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* ── Controls ── */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        {/* Map style switcher */}
        <div className="map-control p-2">
          <p className="text-[9px] font-bold tracking-[0.15em] text-white/40 uppercase mb-1.5 px-1">Map Style</p>
          <div className="flex gap-1">
            {(["dark", "light", "satellite"] as const).map((style) => (
              <button key={style} onClick={() => setMapStyle(style)}
                className={`px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase rounded transition-all ${
                  mapStyle === style
                    ? "bg-[#00a1de] text-white shadow-[0_0_8px_rgba(0,161,222,0.4)]"
                    : "text-white/50 hover:text-white hover:bg-white/10"
                }`}>
                {style}
              </button>
            ))}
          </div>
        </div>

        {/* Layer toggles */}
        <div className="map-control p-3">
          <p className="text-[9px] font-bold tracking-[0.15em] text-white/40 uppercase mb-2">Layers</p>
          {[
            { key: "buses", label: "Buses", checked: showBuses, onChange: setShowBuses, color: "#1d4ed8" },
            { key: "trains", label: "Trains", checked: showTrains, onChange: setShowTrains, color: "#c60c30" },
            { key: "busStops", label: "Bus Stops", checked: showBusStops, onChange: setShowBusStops, color: "#6b7280" },
            { key: "trainStops", label: "Train Stops", checked: showTrainStops, onChange: setShowTrainStops, color: "#f59e0b" },
          ].map((toggle) => (
            <label key={toggle.key} className="flex items-center gap-2 py-0.5 cursor-pointer group">
              <div className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center transition-colors ${
                toggle.checked ? "border-transparent" : "border-white/30 group-hover:border-white/50"
              }`} style={toggle.checked ? { backgroundColor: toggle.color } : undefined}>
                {toggle.checked && (
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
              <input type="checkbox" checked={toggle.checked} onChange={(e) => toggle.onChange(e.target.checked)} className="sr-only" />
              <span className="text-[11px] font-medium text-white/70 group-hover:text-white transition-colors">{toggle.label}</span>
            </label>
          ))}
        </div>

        {/* Active route/stop info */}
        {activeVehicleRoute && (
          <div className="map-control p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: activeVehicleRoute.color }} />
                <p className="text-[11px] text-white font-semibold tracking-wide">
                  {activeVehicleRoute.type === "train" ? TRAIN_LINES[activeVehicleRoute.route as TrainLineId]?.name : `Route ${activeVehicleRoute.route}`}
                </p>
              </div>
              <button onClick={() => { setActiveVehicleRoute(null); setSelectedVehicle(null); }} className="text-white/30 hover:text-white text-xs transition-colors">✕</button>
            </div>
          </div>
        )}

        {activeStop && (
          <div className="map-control p-3 max-w-[220px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-white font-semibold truncate">{activeStop.name}</p>
              <button onClick={() => setActiveStop(null)} className="text-white/30 hover:text-white text-xs shrink-0 transition-colors">✕</button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {activeStop.routePatterns.map((rp) => (
                <span key={rp.route} className="route-badge" style={{ backgroundColor: rp.color }}>{rp.route}</span>
              ))}
            </div>
          </div>
        )}

        {/* Status bar */}
        <div className="map-control px-3 py-2 flex items-center gap-2">
          <span className="status-dot live" />
          <p className="text-[10px] text-white/40 font-medium tracking-wide">
            <span className="departure-board text-white/60">{filteredVehicles.length}</span> vehicles ·{" "}
            <span className="departure-board text-white/60">{trainStations.length}</span> stations
          </p>
        </div>
      </div>
    </div>
  );
}
