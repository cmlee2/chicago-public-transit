import {
  CTA_BUS_API_BASE,
  CTA_TRAIN_API_BASE,
  TRAIN_LINES,
  type CtaBusVehiclesResponse,
  type CtaTrainPositionsResponse,
  type TrainLineId,
} from "@cpt/shared";
import { supabase } from "./supabase.js";

const BUS_API_KEY = process.env.CTA_BUS_API_KEY!;
const TRAIN_API_KEY = process.env.CTA_TRAIN_API_KEY!;

export async function pollBusVehicles() {
  try {
    // Get all active bus routes from the DB
    const { data: routes } = await supabase
      .from("routes")
      .select("route_id")
      .eq("type", "bus");

    if (!routes || routes.length === 0) return;

    // CTA API allows up to 10 routes per getvehicles request
    const routeIds = routes.map((r) => r.route_id);
    const chunks: string[][] = [];
    for (let i = 0; i < routeIds.length; i += 10) {
      chunks.push(routeIds.slice(i, i + 10));
    }

    const allRows: Array<{
      vehicle_id: string;
      route: string;
      lat: number;
      lng: number;
      heading: number;
      type: "bus";
      destination: string;
      is_delayed: boolean;
      updated_at: string;
    }> = [];

    for (const chunk of chunks) {
      try {
        const rt = chunk.join(",");
        const url = `${CTA_BUS_API_BASE}/getvehicles?key=${BUS_API_KEY}&rt=${rt}&format=json`;
        const res = await fetch(url);
        const data = (await res.json()) as CtaBusVehiclesResponse;

        const vehicles = data["bustime-response"].vehicle;
        if (!vehicles) continue;

        for (const v of vehicles) {
          allRows.push({
            vehicle_id: v.vid,
            route: v.rt,
            lat: parseFloat(v.lat),
            lng: parseFloat(v.lon),
            heading: parseInt(v.hdg, 10),
            type: "bus",
            destination: v.des,
            is_delayed: v.dly,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error("Bus vehicle chunk error:", err);
      }
    }

    if (allRows.length > 0) {
      // Upsert in batches of 500
      for (let i = 0; i < allRows.length; i += 500) {
        const batch = allRows.slice(i, i + 500);
        const { error } = await supabase.from("vehicles").upsert(batch, {
          onConflict: "vehicle_id,type",
        });
        if (error) console.error("Bus vehicle upsert error:", error.message);
      }
      console.log(`Upserted ${allRows.length} bus vehicle positions`);
    }
  } catch (err) {
    console.error("Bus vehicle polling error:", err);
  }
}

export async function pollTrainVehicles() {
  try {
    const lineIds = Object.keys(TRAIN_LINES) as TrainLineId[];
    const allRows: Array<{
      vehicle_id: string;
      route: string;
      lat: number;
      lng: number;
      heading: number;
      type: "train";
      destination: string;
      is_delayed: boolean;
      updated_at: string;
    }> = [];

    for (const line of lineIds) {
      try {
        const url = `${CTA_TRAIN_API_BASE}/ttpositions.aspx?key=${TRAIN_API_KEY}&rt=${line}&outputType=JSON`;
        const res = await fetch(url);
        const data = (await res.json()) as CtaTrainPositionsResponse;

        if (data.ctatt.errCd !== "0" || !data.ctatt.route) continue;

        // API returns route[].train[] — each route has a train array
        for (const routeGroup of data.ctatt.route) {
          const trains = routeGroup.train;
          if (!trains) continue;
          // Handle single train (API returns object) vs multiple (array)
          const trainList = Array.isArray(trains) ? trains : [trains];
          for (const t of trainList) {
            const lat = parseFloat(t.lat);
            const lng = parseFloat(t.lon);
            if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;

            allRows.push({
              vehicle_id: t.rn,
              route: line,
              lat,
              lng,
              heading: parseInt(t.heading, 10) || 0,
              type: "train",
              destination: t.destNm,
              is_delayed: t.isDly === "1",
              updated_at: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error(`Train vehicle error for line ${line}:`, err);
      }
    }

    if (allRows.length > 0) {
      const { error } = await supabase.from("vehicles").upsert(allRows, {
        onConflict: "vehicle_id,type",
      });
      if (error) console.error("Train vehicle upsert error:", error.message);
      else console.log(`Upserted ${allRows.length} train vehicle positions`);
    }
  } catch (err) {
    console.error("Train vehicle polling error:", err);
  }
}

export async function cleanStaleVehicles() {
  // Remove vehicles not updated in the last 3 minutes (they've gone out of service)
  const cutoff = new Date(Date.now() - 3 * 60_000).toISOString();
  const { error } = await supabase
    .from("vehicles")
    .delete()
    .lt("updated_at", cutoff);
  if (error) console.error("Vehicle cleanup error:", error.message);
}
