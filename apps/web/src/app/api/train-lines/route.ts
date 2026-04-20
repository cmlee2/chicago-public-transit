import { NextResponse } from "next/server";

const CHICAGO_DATA_URL =
  "https://data.cityofchicago.org/resource/xbyr-jnvx.geojson";

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

// Which lines share which part of the Loop/shared track
// Based on actual CTA L map:
// - North side (Lake St, ~41.885): Brn, G, Org, Pink, P
// - East side (Wabash, ~-87.626): Brn, G, Org, Pink, P
// - South side (Van Buren, ~41.877): Brn, Org, P (Green/Pink exit before south)
// - West side (Wells, ~-87.634): Brn, Org, P (Green/Pink exit before west)
// - Approaches west of Loop (Clinton/Halsted area): G, Pink only
// - South of Loop (Roosevelt+): G, Org (separate tracks, not shared)

interface LineInfo { lineId: string; color: string }

const ALL_LOOP = [
  { lineId: "Brn", color: "#62361b" },
  { lineId: "G", color: "#009b3a" },
  { lineId: "Org", color: "#f9461c" },
  { lineId: "Pink", color: "#e27ea6" },
  { lineId: "P", color: "#522398" },
];

const SOUTH_WEST_LOOP = [
  { lineId: "Brn", color: "#62361b" },
  { lineId: "Org", color: "#f9461c" },
  { lineId: "P", color: "#522398" },
];

const WEST_APPROACH = [
  { lineId: "G", color: "#009b3a" },
  { lineId: "Pink", color: "#e27ea6" },
];

function getLoopLinesForSegment(coords: [number, number][]): LineInfo[] {
  // coords are [lat, lng]
  const avgLat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const avgLng = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const latRange = Math.max(...coords.map((c) => c[0])) - Math.min(...coords.map((c) => c[0]));
  const lngRange = Math.max(...coords.map((c) => c[1])) - Math.min(...coords.map((c) => c[1]));
  const isVertical = latRange > lngRange;

  // West approach (far west of the Loop, lng < -87.645)
  if (avgLng < -87.645) {
    return WEST_APPROACH;
  }

  // South of Loop (lat < 41.876)
  if (avgLat < 41.876) {
    // South segments: only lines that go south
    if (isVertical) {
      // N-S segment south of loop — could be east side (Wabash) extension or Roosevelt approach
      if (avgLng > -87.628) {
        // East side extending south — Green/Orange
        return [
          { lineId: "G", color: "#009b3a" },
          { lineId: "Org", color: "#f9461c" },
        ];
      }
      return SOUTH_WEST_LOOP;
    }
    // E-W south of loop
    return SOUTH_WEST_LOOP;
  }

  // North side of Loop (lat > 41.884, E-W)
  if (avgLat > 41.884 && !isVertical) {
    return ALL_LOOP;
  }

  // East side of Loop (lng > -87.629, N-S)
  if (avgLng > -87.629 && isVertical) {
    return ALL_LOOP;
  }

  // West side of Loop (lng around -87.634, N-S)
  if (isVertical && avgLng < -87.631) {
    return SOUTH_WEST_LOOP;
  }

  // South side of Loop (lat < 41.879, E-W)
  if (avgLat < 41.879 && !isVertical) {
    return SOUTH_WEST_LOOP;
  }

  // Default: all lines
  return ALL_LOOP;
}

export interface TrainLineSegment {
  lineId: string;
  color: string;
  coordinates: [number, number][][];
  shared?: boolean;
  offsetIndex?: number;
  totalShared?: number;
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

    // Collect all coords per feature (preserving feature boundaries for ML)
    const individualLines = new Map<string, [number, number][][]>();
    const mlFeatureCoords: [number, number][][] = [];

    for (const feature of geojson.features) {
      const legend: string = feature.properties?.legend ?? "";
      if (!LEGEND_MAP[legend] && legend !== "ML") continue;

      const geom = feature.geometry;
      if (!geom) continue;

      const featureCoords: [number, number][][] = [];
      if (geom.type === "MultiLineString") {
        for (const line of geom.coordinates) {
          featureCoords.push(line.map((c: number[]) => [c[1], c[0]] as [number, number]));
        }
      } else if (geom.type === "LineString") {
        featureCoords.push(geom.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]));
      }

      if (legend === "ML") {
        // Keep each ML feature's coords separate for per-segment line assignment
        for (const coords of featureCoords) {
          mlFeatureCoords.push(coords);
        }
      } else {
        const existing = individualLines.get(legend) ?? [];
        existing.push(...featureCoords);
        individualLines.set(legend, existing);
      }
    }

    const result: TrainLineSegment[] = [];

    // Individual line segments (non-shared)
    for (const [legend, coordinates] of individualLines) {
      const mapping = LEGEND_MAP[legend];
      result.push({ lineId: mapping.lineId, color: mapping.color, coordinates, shared: false });
    }

    // ML segments — assign correct lines per segment based on geography
    for (const coords of mlFeatureCoords) {
      const lines = getLoopLinesForSegment(coords);
      for (let i = 0; i < lines.length; i++) {
        result.push({
          lineId: lines[i].lineId,
          color: lines[i].color,
          coordinates: [coords],
          shared: true,
          offsetIndex: i,
          totalShared: lines.length,
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
