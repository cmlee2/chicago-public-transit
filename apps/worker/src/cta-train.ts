import {
  CTA_TRAIN_API_BASE,
  type CtaTrainArrivalsResponse,
} from "@cpt/shared";
import { supabase } from "./supabase.js";

const API_KEY = process.env.CTA_TRAIN_API_KEY!;

export async function pollTrainArrivals(stationIds: string[]) {
  if (stationIds.length === 0) return;

  // CTA Train API: one station per request
  for (const stationId of stationIds) {
    try {
      const url = `${CTA_TRAIN_API_BASE}/ttarrivals.aspx?key=${API_KEY}&mapid=${stationId}&outputType=JSON`;
      const res = await fetch(url);
      const data: CtaTrainArrivalsResponse = await res.json();

      if (data.ctatt.errCd !== "0" || !data.ctatt.eta) continue;

      const rows = data.ctatt.eta.map((e) => ({
        id: `train-${e.rn}-${e.stpId}-${e.arrT}`,
        stop_id: e.stpId,
        route: e.rt,
        direction: e.stpDe,
        eta: parseCTATrainTimestamp(e.arrT),
        vehicle_id: e.rn,
        is_delayed: e.isDly === "1",
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await supabase.from("arrivals").upsert(rows, {
          onConflict: "id",
        });
        if (error) console.error("Train upsert error:", error.message);
        else
          console.log(
            `Upserted ${rows.length} train arrivals for station ${stationId}`
          );
      }
    } catch (err) {
      console.error(`Train polling error for station ${stationId}:`, err);
    }
  }
}

// CTA Train timestamps are in format "YYYY-MM-DDTHH:mm:ss"
function parseCTATrainTimestamp(ts: string): string {
  return new Date(ts).toISOString();
}
