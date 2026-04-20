import cron from "node-cron";
import { pollBusArrivals } from "./cta-bus.js";
import { pollTrainArrivals } from "./cta-train.js";
import { pollBusVehicles, pollTrainVehicles, cleanStaleVehicles } from "./vehicles.js";
import { seedBusStops } from "./seed-bus-stops.js";
import { pollMetraVehicles, pollMetraAlerts, cleanStaleMetraVehicles } from "./metra.js";
import { checkAndNotify } from "./notify.js";
import { supabase } from "./supabase.js";
import {
  BUS_POLL_INTERVAL,
  TRAIN_POLL_INTERVAL,
  VEHICLE_POLL_INTERVAL,
  ROUTE_CACHE_INTERVAL,
} from "@cpt/shared";

async function getActiveStopIds(
  type: "bus" | "train"
): Promise<string[]> {
  // Get stop IDs that have favorites (to avoid polling everything)
  const { data } = await supabase
    .from("user_favorites")
    .select("stop_id, stops!inner(type)")
    .eq("stops.type", type);

  if (!data) return [];
  return [...new Set(data.map((d) => d.stop_id))];
}

async function getActiveStationIds(): Promise<string[]> {
  // For trains, we need station IDs (parent stops)
  // The CTA Train API uses mapid (station ID), but our stops table has stop IDs
  // For now, return unique stop IDs — adjust when station mapping is added
  return getActiveStopIds("train");
}

async function cacheRoutes() {
  try {
    console.log("Caching route data...");
    // Bus routes are fetched from CTA API
    const busApiKey = process.env.CTA_BUS_API_KEY;
    if (busApiKey) {
      const res = await fetch(
        `http://www.ctabustracker.com/bustime/api/v2/getroutes?key=${busApiKey}&format=json`
      );
      const data = (await res.json()) as { "bustime-response"?: { routes?: Array<{ rt: string; rtnm: string; rtclr: string }> } };
      const routes = data?.["bustime-response"]?.routes;
      if (routes && Array.isArray(routes)) {
        const rows = routes.map(
          (r: { rt: string; rtnm: string; rtclr: string }) => ({
            route_id: r.rt,
            name: r.rtnm,
            color: r.rtclr || "#888888",
            type: "bus" as const,
          })
        );
        const { error } = await supabase
          .from("routes")
          .upsert(rows, { onConflict: "route_id" });
        if (error) console.error("Route cache error:", error.message);
        else console.log(`Cached ${rows.length} bus routes`);
      }
    }
  } catch (err) {
    console.error("Route caching error:", err);
  }
}

async function pollBus() {
  const stopIds = await getActiveStopIds("bus");
  if (stopIds.length > 0) {
    console.log(`Polling ${stopIds.length} bus stops...`);
    await pollBusArrivals(stopIds);
  }
}

async function pollTrain() {
  const stationIds = await getActiveStationIds();
  if (stationIds.length > 0) {
    console.log(`Polling ${stationIds.length} train stations...`);
    await pollTrainArrivals(stationIds);
  }
}

async function cleanStaleArrivals() {
  // Remove arrivals that have passed
  const { error } = await supabase
    .from("arrivals")
    .delete()
    .lt("eta", new Date().toISOString());
  if (error) console.error("Cleanup error:", error.message);
}

// ─── Start ────────────────────────────────────────────────────────

console.log("Worker starting...");

// Initial cache, then seed bus stops after routes are cached
cacheRoutes().then(() => {
  // Check if bus stops exist already
  supabase
    .from("stops")
    .select("stop_id", { count: "exact", head: true })
    .eq("type", "bus")
    .then(({ count }) => {
      if (!count || count < 100) {
        console.log("Bus stops not seeded yet, seeding...");
        seedBusStops();
      } else {
        console.log(`${count} bus stops already in DB, skipping seed`);
      }
    });
});

// Poll bus arrivals every 30s
setInterval(pollBus, BUS_POLL_INTERVAL);

// Poll train arrivals every 30s
setInterval(pollTrain, TRAIN_POLL_INTERVAL);

// Poll vehicle positions every 15s
setInterval(pollBusVehicles, VEHICLE_POLL_INTERVAL);
setInterval(pollTrainVehicles, VEHICLE_POLL_INTERVAL);

// Cache routes every hour
setInterval(cacheRoutes, ROUTE_CACHE_INTERVAL);

// Check notifications every minute
cron.schedule("* * * * *", checkAndNotify);

// Clean stale arrivals every 5 minutes
cron.schedule("*/5 * * * *", cleanStaleArrivals);

// Clean stale vehicles every 3 minutes
cron.schedule("*/3 * * * *", cleanStaleVehicles);

// Metra polling every 30s (vehicle positions + alerts every 2 min)
if (process.env.METRA_API_TOKEN) {
  setInterval(pollMetraVehicles, 30_000);
  setInterval(pollMetraAlerts, 2 * 60_000);
  cron.schedule("*/5 * * * *", cleanStaleMetraVehicles);
  pollMetraVehicles();
  pollMetraAlerts();
  console.log("Metra polling enabled");
} else {
  console.log("METRA_API_TOKEN not set, skipping Metra polling");
}

// Run initial CTA polls
pollBus();
pollTrain();
pollBusVehicles();
pollTrainVehicles();

console.log("Worker running. Polling CTA + Metra APIs...");
