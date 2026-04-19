import {
  CTA_BUS_API_BASE,
  type CtaBusPredictionsResponse,
} from "@cpt/shared";
import { supabase } from "./supabase.js";

const API_KEY = process.env.CTA_BUS_API_KEY!;

export async function pollBusArrivals(stopIds: string[]) {
  if (stopIds.length === 0) return;

  // CTA Bus API allows up to 10 stops per request
  const chunks: string[][] = [];
  for (let i = 0; i < stopIds.length; i += 10) {
    chunks.push(stopIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    try {
      const stpids = chunk.join(",");
      const url = `${CTA_BUS_API_BASE}/getpredictions?key=${API_KEY}&stpid=${stpids}&format=json`;
      const res = await fetch(url);
      const data: CtaBusPredictionsResponse = await res.json();

      const predictions = data["bustime-response"].prd;
      if (!predictions) continue;

      const rows = predictions.map((p) => ({
        id: `bus-${p.vid}-${p.stpid}-${p.prdtm}`,
        stop_id: p.stpid,
        route: p.rt,
        direction: p.rtdir,
        eta: parseCTATimestamp(p.prdtm),
        vehicle_id: p.vid,
        is_delayed: p.dly,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await supabase.from("arrivals").upsert(rows, {
          onConflict: "id",
        });
        if (error) console.error("Bus upsert error:", error.message);
        else console.log(`Upserted ${rows.length} bus arrivals`);
      }
    } catch (err) {
      console.error("Bus polling error:", err);
    }
  }
}

// CTA timestamps are in format "YYYYMMDD HH:mm"
function parseCTATimestamp(ts: string): string {
  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);
  const time = ts.slice(9);
  return new Date(`${year}-${month}-${day}T${time}:00`).toISOString();
}
