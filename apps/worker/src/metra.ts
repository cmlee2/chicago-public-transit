import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { supabase } from "./supabase.js";

const METRA_API_BASE = "https://gtfspublic.metrarr.com/gtfs/public";
const API_TOKEN = process.env.METRA_API_TOKEN!;

function metraUrl(endpoint: string) {
  return `${METRA_API_BASE}/${endpoint}?api_token=${API_TOKEN}`;
}

async function fetchProtobuf(endpoint: string) {
  const res = await fetch(metraUrl(endpoint));
  if (!res.ok) throw new Error(`Metra API ${endpoint}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(buffer)
  );
}

// ─── Vehicle Positions ──────────────────────────────────────────

export async function pollMetraVehicles() {
  try {
    const feed = await fetchProtobuf("positions");
    const rows: Array<{
      vehicle_id: string;
      route: string;
      lat: number;
      lng: number;
      heading: number;
      type: "metra";
      destination: string;
      is_delayed: boolean;
      updated_at: string;
    }> = [];

    for (const entity of feed.entity) {
      const vp = entity.vehicle;
      if (!vp?.position || !vp.trip) continue;
      const lat = vp.position.latitude;
      const lng = vp.position.longitude;
      if (!lat || !lng) continue;

      rows.push({
        vehicle_id: `metra-${vp.vehicle?.id || entity.id}`,
        route: vp.trip.routeId || "",
        lat,
        lng,
        heading: Math.round(vp.position.bearing || 0),
        type: "metra",
        destination: vp.trip.tripId?.split("_")[1] || "",
        is_delayed: false,
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("vehicles").upsert(rows, {
        onConflict: "vehicle_id,type",
      });
      if (error) console.error("Metra vehicle upsert error:", error.message);
      else console.log(`Upserted ${rows.length} Metra vehicle positions`);
    }
  } catch (err) {
    console.error("Metra vehicle polling error:", err);
  }
}

// ─── Trip Updates → Arrivals ─────────────────────────────────────

export async function pollMetraArrivals() {
  try {
    const feed = await fetchProtobuf("tripupdates");
    const rows: Array<{
      id: string;
      stop_id: string;
      route: string;
      direction: string;
      eta: string;
      vehicle_id: string | null;
      is_delayed: boolean;
      updated_at: string;
    }> = [];

    const now = Date.now();

    for (const entity of feed.entity) {
      const tu = entity.tripUpdate;
      if (!tu?.stopTimeUpdate || !tu.trip) continue;

      const routeId = tu.trip.routeId || "";
      const tripId = tu.trip.tripId || "";
      const vehicleId = tu.vehicle?.id || null;
      const direction = tu.trip.directionId === 0 ? "Outbound" : "Inbound";

      for (const stu of tu.stopTimeUpdate) {
        const arrivalTime = stu.arrival?.time || stu.departure?.time;
        if (!arrivalTime || !stu.stopId) continue;

        const etaMs = Number(arrivalTime) * 1000;
        // Skip past arrivals and far-future ones
        if (etaMs < now - 60_000 || etaMs > now + 3 * 60 * 60_000) continue;

        const delay = Number(stu.arrival?.delay || stu.departure?.delay || 0);

        rows.push({
          id: `metra-${tripId}-${stu.stopId}`,
          stop_id: stu.stopId,
          route: routeId,
          direction,
          eta: new Date(etaMs).toISOString(),
          vehicle_id: vehicleId,
          is_delayed: delay > 300,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (rows.length > 0) {
      // Upsert in batches
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase.from("arrivals").upsert(batch, {
          onConflict: "id",
        });
        if (error) console.error("Metra arrival upsert error:", error.message);
      }
      console.log(`Upserted ${rows.length} Metra arrival predictions`);
    }
  } catch (err) {
    console.error("Metra arrivals polling error:", err);
  }
}

// ─── Service Alerts ─────────────────────────────────────────────

export async function pollMetraAlerts() {
  try {
    const feed = await fetchProtobuf("alerts");
    const rows: Array<{
      id: string;
      route_id: string | null;
      header: string;
      description: string | null;
      cause: string | null;
      effect: string | null;
      active_from: string | null;
      active_until: string | null;
      updated_at: string;
    }> = [];

    for (const entity of feed.entity) {
      const alert = entity.alert;
      if (!alert) continue;

      // Get affected route
      let routeId: string | null = null;
      if (alert.informedEntity && alert.informedEntity.length > 0) {
        routeId = alert.informedEntity[0].routeId || null;
      }

      const header =
        alert.headerText?.translation?.[0]?.text || "Service Alert";
      const description =
        alert.descriptionText?.translation?.[0]?.text || null;

      // Map GTFS-RT cause/effect enums to strings
      const causeMap: Record<number, string> = {
        1: "OTHER_CAUSE", 2: "TECHNICAL_PROBLEM", 3: "STRIKE",
        4: "DEMONSTRATION", 5: "ACCIDENT", 6: "HOLIDAY",
        7: "WEATHER", 8: "MAINTENANCE", 9: "CONSTRUCTION",
        10: "POLICE_ACTIVITY", 11: "MEDICAL_EMERGENCY",
      };
      const effectMap: Record<number, string> = {
        1: "NO_SERVICE", 2: "REDUCED_SERVICE", 3: "SIGNIFICANT_DELAYS",
        4: "DETOUR", 5: "ADDITIONAL_SERVICE", 6: "MODIFIED_SERVICE",
        7: "OTHER_EFFECT", 8: "UNKNOWN_EFFECT", 9: "STOP_MOVED",
      };

      let activeFrom: string | null = null;
      let activeUntil: string | null = null;
      if (alert.activePeriod && alert.activePeriod.length > 0) {
        const period = alert.activePeriod[0];
        if (period.start)
          activeFrom = new Date(
            Number(period.start) * 1000
          ).toISOString();
        if (period.end)
          activeUntil = new Date(
            Number(period.end) * 1000
          ).toISOString();
      }

      rows.push({
        id: entity.id,
        route_id: routeId,
        header,
        description,
        cause: causeMap[alert.cause as number] || null,
        effect: effectMap[alert.effect as number] || null,
        active_from: activeFrom,
        active_until: activeUntil,
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      // Clear old alerts and insert new
      await supabase.from("metra_alerts").delete().neq("id", "");
      const { error } = await supabase.from("metra_alerts").upsert(rows, {
        onConflict: "id",
      });
      if (error) console.error("Metra alert upsert error:", error.message);
      else console.log(`Upserted ${rows.length} Metra alerts`);
    }
  } catch (err) {
    console.error("Metra alert polling error:", err);
  }
}

export async function cleanStaleMetraVehicles() {
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { error } = await supabase
    .from("vehicles")
    .delete()
    .eq("type", "metra")
    .lt("updated_at", cutoff);
  if (error) console.error("Metra vehicle cleanup error:", error.message);
}
