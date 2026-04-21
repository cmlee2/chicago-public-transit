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

function parseBusTimestamp(ts: string): Date {
  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);
  const time = ts.slice(9);
  return new Date(`${month}/${day}/${year} ${time}:00`);
}

function parseTrainTimestamp(ts: string): Date {
  return new Date(ts);
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "bus";
  const vid = req.nextUrl.searchParams.get("vid");
  if (!vid) {
    return NextResponse.json({ predictions: [] });
  }

  try {
    const nowMs = chicagoNow().getTime();

    if (type === "train") {
      if (!TRAIN_API_KEY) return NextResponse.json({ predictions: [] });

      const url = `${CTA_TRAIN_API_BASE}/ttfollow.aspx?key=${TRAIN_API_KEY}&runnumber=${vid}&outputType=JSON`;
      const res = await fetch(url);
      const json = await res.json();
      const etas = json?.ctatt?.eta;
      if (!etas || json?.ctatt?.errCd !== "0") {
        return NextResponse.json({ predictions: [] });
      }

      const list = Array.isArray(etas) ? etas : [etas];
      const predictions = list.map((p: {
        staNm: string; stpId: string; rt: string; stpDe: string; destNm: string;
        arrT: string; isDly: string;
      }) => {
        const eta = parseTrainTimestamp(p.arrT);
        return {
          stopName: p.staNm,
          stopId: p.stpId,
          route: p.rt,
          direction: p.stpDe,
          destination: p.destNm,
          minutes: Math.max(0, Math.round((eta.getTime() - nowMs) / 60000)),
          delayed: p.isDly === "1",
        };
      });

      return NextResponse.json({
        predictions,
        direction: predictions[0]?.direction ?? "",
        destination: predictions[0]?.destination ?? "",
        route: predictions[0]?.route ?? "",
      });
    }

    if (!BUS_API_KEY) return NextResponse.json({ predictions: [] });

    const url = `${CTA_BUS_API_BASE}/getpredictions?key=${BUS_API_KEY}&vid=${vid}&format=json&top=10`;
    const res = await fetch(url);
    const json = await res.json();
    const prd = json?.["bustime-response"]?.prd;
    if (!prd) return NextResponse.json({ predictions: [] });

    const list = Array.isArray(prd) ? prd : [prd];
    const predictions = list.map((p: {
      stpnm: string; stpid: string; rt: string; rtdir: string; des: string;
      prdtm: string; vid: string; dly: boolean; prdctdn: string;
    }) => {
      const eta = parseBusTimestamp(p.prdtm);
      return {
        stopName: p.stpnm,
        stopId: p.stpid,
        route: p.rt,
        direction: p.rtdir,
        destination: p.des,
        minutes: Math.max(0, Math.round((eta.getTime() - nowMs) / 60000)),
        delayed: p.dly ?? false,
      };
    });

    return NextResponse.json({
      predictions,
      direction: predictions[0]?.direction ?? "",
      destination: predictions[0]?.destination ?? "",
      route: predictions[0]?.route ?? "",
    });
  } catch {
    return NextResponse.json({ predictions: [] });
  }
}
