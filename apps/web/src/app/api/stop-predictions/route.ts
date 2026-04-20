import { NextRequest, NextResponse } from "next/server";

const CTA_BUS_API_BASE = "http://www.ctabustracker.com/bustime/api/v2";
const CTA_TRAIN_API_BASE = "http://lapi.transitchicago.com/api/1.0";
const BUS_API_KEY = process.env.CTA_BUS_API_KEY;
const TRAIN_API_KEY = process.env.CTA_TRAIN_API_KEY;

const CHICAGO_TZ = "America/Chicago";

function chicagoNow(): Date {
  const chicagoStr = new Date().toLocaleString("en-US", { timeZone: CHICAGO_TZ });
  return new Date(chicagoStr);
}

function parseBusTimestamp(ts: string): { chicagoDate: Date } {
  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);
  const time = ts.slice(9);
  const chicagoDate = new Date(`${month}/${day}/${year} ${time}:00`);
  return { chicagoDate };
}

function parseTrainTimestamp(ts: string): { chicagoDate: Date } {
  const [datePart, timePart] = ts.split("T");
  const [year, month, day] = datePart.split("-");
  const chicagoDate = new Date(`${month}/${day}/${year} ${timePart}`);
  return { chicagoDate };
}

export interface Prediction {
  route: string;
  direction: string;
  destination: string;
  eta: string;
  minutes: number;
  vehicleId: string;
  isDelayed: boolean;
  type: string;
}

export async function GET(req: NextRequest) {
  const stpid = req.nextUrl.searchParams.get("stpid");
  const stopType = req.nextUrl.searchParams.get("type");
  if (!stpid || !stopType) {
    return NextResponse.json({ error: "Missing stpid or type param" }, { status: 400 });
  }

  try {
    const predictions: Prediction[] = [];
    const now = chicagoNow();
    const nowMs = now.getTime();

    if (stopType === "bus") {
      if (!BUS_API_KEY) return NextResponse.json({ predictions: [] });
      const url = `${CTA_BUS_API_BASE}/getpredictions?key=${BUS_API_KEY}&stpid=${stpid}&format=json&top=25`;
      const res = await fetch(url);
      const json = await res.json();
      const prd = json?.["bustime-response"]?.prd;
      if (prd) {
        const list = Array.isArray(prd) ? prd : [prd];
        for (const p of list) {
          const { chicagoDate } = parseBusTimestamp(p.prdtm);
          const minutes = Math.max(0, Math.round((chicagoDate.getTime() - nowMs) / 60000));
          predictions.push({
            route: p.rt, direction: p.rtdir, destination: p.des,
            eta: chicagoDate.toISOString(), minutes,
            vehicleId: p.vid, isDelayed: p.dly ?? false, type: "bus",
          });
        }
      }
    } else if (stopType === "train") {
      if (!TRAIN_API_KEY) return NextResponse.json({ predictions: [] });
      const url = `${CTA_TRAIN_API_BASE}/ttarrivals.aspx?key=${TRAIN_API_KEY}&stpid=${stpid}&max=25&outputType=JSON`;
      const res = await fetch(url);
      const json = await res.json();
      const etas = json?.ctatt?.eta;
      if (etas && json.ctatt.errCd === "0") {
        const list = Array.isArray(etas) ? etas : [etas];
        for (const e of list) {
          const { chicagoDate } = parseTrainTimestamp(e.arrT);
          const minutes = Math.max(0, Math.round((chicagoDate.getTime() - nowMs) / 60000));
          predictions.push({
            route: e.rt, direction: e.stpDe, destination: e.destNm,
            eta: chicagoDate.toISOString(), minutes,
            vehicleId: e.rn, isDelayed: e.isDly === "1", type: "train",
          });
        }
      }
    } else if (stopType === "metra") {
      // Proxy to the dedicated Metra predictions API (which handles protobuf)
      const route = req.nextUrl.searchParams.get("route") || "";
      const baseUrl = req.nextUrl.origin;
      const metraRes = await fetch(`${baseUrl}/api/metra-predictions?stpid=${stpid}&route=${route}`);
      const metraData = await metraRes.json();
      for (const p of metraData.predictions ?? []) {
        predictions.push({
          route: p.route, direction: p.direction, destination: p.destination,
          eta: "", minutes: p.minutes,
          vehicleId: p.vehicleId || "", isDelayed: p.isDelayed ?? false, type: "metra",
        });
      }
    }

    predictions.sort((a, b) => a.minutes - b.minutes);
    return NextResponse.json({ predictions });
  } catch (err) {
    console.error("Stop predictions error:", err);
    return NextResponse.json({ predictions: [] });
  }
}
