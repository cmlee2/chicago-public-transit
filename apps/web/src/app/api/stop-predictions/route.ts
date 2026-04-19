import { NextRequest, NextResponse } from "next/server";

const CTA_BUS_API_BASE = "http://www.ctabustracker.com/bustime/api/v2";
const CTA_TRAIN_API_BASE = "http://lapi.transitchicago.com/api/1.0";
const BUS_API_KEY = process.env.CTA_BUS_API_KEY;
const TRAIN_API_KEY = process.env.CTA_TRAIN_API_KEY;

export interface Prediction {
  route: string;
  direction: string;
  destination: string;
  eta: string; // ISO timestamp
  minutes: number;
  vehicleId: string;
  isDelayed: boolean;
  type: "bus" | "train";
}

export async function GET(req: NextRequest) {
  const stpid = req.nextUrl.searchParams.get("stpid");
  const stopType = req.nextUrl.searchParams.get("type"); // "bus" or "train"
  if (!stpid || !stopType) {
    return NextResponse.json(
      { error: "Missing stpid or type param" },
      { status: 400 }
    );
  }

  try {
    const predictions: Prediction[] = [];

    if (stopType === "bus") {
      if (!BUS_API_KEY)
        return NextResponse.json({ predictions: [] });
      const url = `${CTA_BUS_API_BASE}/getpredictions?key=${BUS_API_KEY}&stpid=${stpid}&format=json&top=25`;
      const res = await fetch(url);
      const json = await res.json();
      const prd = json?.["bustime-response"]?.prd;
      if (prd) {
        const list = Array.isArray(prd) ? prd : [prd];
        const now = Date.now();
        for (const p of list) {
          const eta = parseBusTimestamp(p.prdtm);
          predictions.push({
            route: p.rt,
            direction: p.rtdir,
            destination: p.des,
            eta: eta.toISOString(),
            minutes: Math.max(
              0,
              Math.round((eta.getTime() - now) / 60000)
            ),
            vehicleId: p.vid,
            isDelayed: p.dly ?? false,
            type: "bus",
          });
        }
      }
    } else if (stopType === "train") {
      if (!TRAIN_API_KEY)
        return NextResponse.json({ predictions: [] });
      // CTA Train API accepts stpid directly
      const url = `${CTA_TRAIN_API_BASE}/ttarrivals.aspx?key=${TRAIN_API_KEY}&stpid=${stpid}&max=25&outputType=JSON`;
      const res = await fetch(url);
      const json = await res.json();
      const etas = json?.ctatt?.eta;
      if (etas && json.ctatt.errCd === "0") {
        const list = Array.isArray(etas) ? etas : [etas];
        const now = Date.now();
        for (const e of list) {
          const eta = new Date(e.arrT);
          predictions.push({
            route: e.rt,
            direction: e.stpDe,
            destination: e.destNm,
            eta: eta.toISOString(),
            minutes: Math.max(
              0,
              Math.round((eta.getTime() - now) / 60000)
            ),
            vehicleId: e.rn,
            isDelayed: e.isDly === "1",
            type: "train",
          });
        }
      }
    }

    // Sort by arrival time
    predictions.sort((a, b) => new Date(a.eta).getTime() - new Date(b.eta).getTime());

    return NextResponse.json({ predictions });
  } catch (err) {
    console.error("Stop predictions error:", err);
    return NextResponse.json({ predictions: [] });
  }
}

function parseBusTimestamp(ts: string): Date {
  // CTA bus format: "YYYYMMDD HH:mm"
  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);
  const time = ts.slice(9);
  return new Date(`${year}-${month}-${day}T${time}:00`);
}
