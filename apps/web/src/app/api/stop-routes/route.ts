import { NextRequest, NextResponse } from "next/server";

const CTA_BUS_API_BASE = "http://www.ctabustracker.com/bustime/api/v2";
const BUS_API_KEY = process.env.CTA_BUS_API_KEY;

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function GET(req: NextRequest) {
  const stpid = req.nextUrl.searchParams.get("stpid");
  if (!stpid) {
    return NextResponse.json({ error: "Missing stpid param" }, { status: 400 });
  }

  const cached = cache.get(stpid);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  if (!BUS_API_KEY) {
    return NextResponse.json({ error: "No API key configured" }, { status: 500 });
  }

  try {
    // Get predictions for this stop — tells us which routes serve it
    const url = `${CTA_BUS_API_BASE}/getpredictions?key=${BUS_API_KEY}&stpid=${stpid}&format=json&top=20`;
    const res = await fetch(url);
    const json = await res.json();

    const prd = json?.["bustime-response"]?.prd;
    if (!prd) {
      return NextResponse.json({ routes: [], predictions: [] });
    }

    const predictions = Array.isArray(prd) ? prd : [prd];

    // Extract unique routes
    const routeSet = new Map<string, { rt: string; rtdir: string; des: string }>();
    const predList: Array<{
      route: string;
      direction: string;
      destination: string;
      eta: string;
      minutes: string;
      delayed: boolean;
      vehicleId: string;
    }> = [];

    for (const p of predictions) {
      routeSet.set(p.rt, { rt: p.rt, rtdir: p.rtdir, des: p.des });
      predList.push({
        route: p.rt,
        direction: p.rtdir,
        destination: p.des,
        eta: p.prdtm,
        minutes: p.prdctdn,
        delayed: p.dly ?? false,
        vehicleId: p.vid,
      });
    }

    const result = {
      routes: Array.from(routeSet.values()),
      predictions: predList,
    };

    cache.set(stpid, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Stop routes fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
