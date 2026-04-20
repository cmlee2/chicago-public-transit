import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Metra line colors
const LINE_COLORS: Record<string, string> = {
  "BNSF": "#f58220",
  "ME": "#eb3a34",
  "RI": "#bd2f2b",
  "SWS": "#2e3192",
  "HC": "#795427",
  "UP-N": "#0d5e38",
  "UP-NW": "#1e4d8c",
  "UP-W": "#f0c318",
  "MD-N": "#ef8a17",
  "MD-W": "#ef8a17",
  "NCS": "#5c2d82",
};

interface MetraLineSegment {
  lineId: string;
  color: string;
  coordinates: [number, number][][];
}

let cached: { data: MetraLineSegment[]; ts: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function GET() {
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );

    const { data: stops } = await supabase
      .from("stops")
      .select("*")
      .eq("type", "metra")
      .order("stop_id");

    if (!stops || stops.length === 0) {
      return NextResponse.json([]);
    }

    // Group stops by route
    const routeStops = new Map<string, Array<{ lat: number; lng: number; name: string }>>();
    for (const stop of stops) {
      const existing = routeStops.get(stop.route_id) ?? [];
      existing.push({ lat: stop.lat, lng: stop.lng, name: stop.name });
      routeStops.set(stop.route_id, existing);
    }

    // For each route, sort stops by latitude (north-south lines) or longitude
    // to approximate the route order, then create a polyline
    const result: MetraLineSegment[] = [];
    for (const [routeId, stopsArr] of routeStops) {
      const color = LINE_COLORS[routeId] ?? "#888";

      // Determine primary direction: if latitude range > longitude range, it's N-S
      const lats = stopsArr.map((s) => s.lat);
      const lngs = stopsArr.map((s) => s.lng);
      const latRange = Math.max(...lats) - Math.min(...lats);
      const lngRange = Math.max(...lngs) - Math.min(...lngs);

      // Sort by the dominant axis
      if (latRange > lngRange) {
        stopsArr.sort((a, b) => b.lat - a.lat); // North to south
      } else {
        stopsArr.sort((a, b) => a.lng - b.lng); // West to east
      }

      const coords: [number, number][] = stopsArr.map((s) => [s.lat, s.lng]);

      result.push({
        lineId: routeId,
        color,
        coordinates: [coords],
      });
    }

    cached = { data: result, ts: Date.now() };
    return NextResponse.json(result);
  } catch (err) {
    console.error("Metra lines error:", err);
    return NextResponse.json([]);
  }
}
