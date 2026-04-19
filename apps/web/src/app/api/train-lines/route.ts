import { NextResponse } from "next/server";

const CHICAGO_DATA_URL =
  "https://data.cityofchicago.org/resource/xbyr-jnvx.geojson";

// Legend code → our line ID + color
const LEGEND_MAP: Record<string, { lineId: string; color: string }> = {
  RD: { lineId: "Red", color: "#c60c30" },
  BL: { lineId: "Blue", color: "#00a1de" },
  BR: { lineId: "Brn", color: "#62361b" },
  GR: { lineId: "G", color: "#009b3a" },
  OR: { lineId: "Org", color: "#f9461c" },
  PR: { lineId: "P", color: "#522398" },
  PK: { lineId: "Pink", color: "#e27ea6" },
  YL: { lineId: "Y", color: "#f9e300" },
};

// Lines that share the Loop elevated tracks (ML segments)
const LOOP_LINES = [
  { lineId: "Brn", color: "#62361b" },
  { lineId: "G", color: "#009b3a" },
  { lineId: "Org", color: "#f9461c" },
  { lineId: "Pink", color: "#e27ea6" },
  { lineId: "P", color: "#522398" },
];

export interface TrainLineSegment {
  lineId: string;
  color: string;
  coordinates: [number, number][][];
  shared?: boolean; // true for Loop shared segments
  offsetIndex?: number; // position in the rainbow for shared segments
  totalShared?: number; // total lines sharing this segment
}

let cached: { data: TrainLineSegment[]; ts: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function GET() {
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const res = await fetch(CHICAGO_DATA_URL);
    const geojson = await res.json();

    const grouped = new Map<string, [number, number][][]>();

    for (const feature of geojson.features) {
      const legend: string = feature.properties?.legend ?? "";
      if (!LEGEND_MAP[legend] && legend !== "ML") continue;

      const geom = feature.geometry;
      if (!geom) continue;

      const existing = grouped.get(legend) ?? [];

      if (geom.type === "MultiLineString") {
        for (const line of geom.coordinates) {
          existing.push(
            line.map((c: number[]) => [c[1], c[0]] as [number, number])
          );
        }
      } else if (geom.type === "LineString") {
        existing.push(
          geom.coordinates.map(
            (c: number[]) => [c[1], c[0]] as [number, number]
          )
        );
      }

      grouped.set(legend, existing);
    }

    const result: TrainLineSegment[] = [];

    // Add individual line segments
    for (const [legend, coordinates] of grouped) {
      if (legend === "ML") continue; // handle Loop separately
      const mapping = LEGEND_MAP[legend];
      result.push({
        lineId: mapping.lineId,
        color: mapping.color,
        coordinates,
        shared: false,
      });
    }

    // Expand Loop (ML) segments — one entry per line that uses the Loop,
    // each with an offsetIndex so the frontend can render them side-by-side
    const loopCoords = grouped.get("ML") ?? [];
    if (loopCoords.length > 0) {
      for (let i = 0; i < LOOP_LINES.length; i++) {
        const line = LOOP_LINES[i];
        result.push({
          lineId: line.lineId,
          color: line.color,
          coordinates: loopCoords,
          shared: true,
          offsetIndex: i,
          totalShared: LOOP_LINES.length,
        });
      }
    }

    cached = { data: result, ts: Date.now() };
    return NextResponse.json(result);
  } catch (err) {
    console.error("Train lines fetch error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
