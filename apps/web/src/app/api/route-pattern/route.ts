import { NextRequest, NextResponse } from "next/server";

const CTA_BUS_API_BASE = "http://www.ctabustracker.com/bustime/api/v2";
const BUS_API_KEY = process.env.CTA_BUS_API_KEY;

// In-memory cache: route patterns rarely change
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(req: NextRequest) {
  const rt = req.nextUrl.searchParams.get("rt");
  if (!rt) {
    return NextResponse.json({ error: "Missing rt param" }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(rt);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  if (!BUS_API_KEY) {
    return NextResponse.json({ error: "No API key configured" }, { status: 500 });
  }

  try {
    const url = `${CTA_BUS_API_BASE}/getpatterns?key=${BUS_API_KEY}&rt=${rt}&format=json`;
    const res = await fetch(url);
    const json = await res.json();

    const patterns = json?.["bustime-response"]?.ptr;
    if (!patterns) {
      return NextResponse.json({ patterns: [] });
    }

    // Normalize to array
    const patternList = Array.isArray(patterns) ? patterns : [patterns];

    // Extract just the lat/lng points for each pattern
    const result = patternList.map(
      (p: { pid: number; ln: number; rtdir: string; pt: Array<{ lat: number; lon: number; typ: string; stpid?: string; stpnm?: string }> }) => ({
        pid: p.pid,
        direction: p.rtdir,
        points: p.pt.map((pt) => ({
          lat: pt.lat,
          lng: pt.lon,
          type: pt.typ,
          stopId: pt.stpid,
          stopName: pt.stpnm,
        })),
      })
    );

    cache.set(rt, { data: { patterns: result }, ts: Date.now() });
    return NextResponse.json({ patterns: result });
  } catch (err) {
    console.error("Pattern fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch pattern" }, { status: 500 });
  }
}
