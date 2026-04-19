import { NextRequest, NextResponse } from "next/server";

const CTA_BUS_API_BASE = "http://www.ctabustracker.com/bustime/api/v2";
const BUS_API_KEY = process.env.CTA_BUS_API_KEY;

export async function GET(req: NextRequest) {
  const vid = req.nextUrl.searchParams.get("vid");
  if (!vid || !BUS_API_KEY) {
    return NextResponse.json({ predictions: [] });
  }

  try {
    const url = `${CTA_BUS_API_BASE}/getpredictions?key=${BUS_API_KEY}&vid=${vid}&format=json&top=10`;
    const res = await fetch(url);
    const json = await res.json();
    const prd = json?.["bustime-response"]?.prd;
    if (!prd) return NextResponse.json({ predictions: [] });

    const list = Array.isArray(prd) ? prd : [prd];
    const now = Date.now();
    const predictions = list.map((p: {
      stpnm: string; stpid: string; rt: string; rtdir: string; des: string;
      prdtm: string; vid: string; dly: boolean; prdctdn: string;
    }) => {
      const year = p.prdtm.slice(0, 4);
      const month = p.prdtm.slice(4, 6);
      const day = p.prdtm.slice(6, 8);
      const time = p.prdtm.slice(9);
      const eta = new Date(`${year}-${month}-${day}T${time}:00`);
      return {
        stopName: p.stpnm,
        stopId: p.stpid,
        route: p.rt,
        direction: p.rtdir,
        destination: p.des,
        minutes: Math.max(0, Math.round((eta.getTime() - now) / 60000)),
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
