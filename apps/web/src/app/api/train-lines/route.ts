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

// From the official CTA L system diagram:
//
// LOOP (the elevated rectangle):
//   Brown: full outer loop (CCW) - north→west→south→east
//   Purple: full outer loop (CCW) - same as Brown
//   Orange: full inner loop (CW) - enters south, north→east→south→west
//   Green: enters west at Clinton, north side, east side, exits south
//   Pink: enters west at Clinton, north side, east side, exits south
//
// So:
//   North (Lake St) + East (Wabash): ALL 5 = Brn, G, Org, Pink, P
//   South (Van Buren) + West (Wells): ONLY 3 = Brn, Org, P
//   West approach from Clinton: G, Pink
//   North approach from Merch Mart: Brn, P
//   South exit toward Roosevelt: G, Org (separate from Loop)

interface LineInfo { lineId: string; color: string }

const ALL_FIVE: LineInfo[] = [
  { lineId: "Brn", color: "#62361b" },
  { lineId: "G", color: "#009b3a" },
  { lineId: "Org", color: "#f9461c" },
  { lineId: "Pink", color: "#e27ea6" },
  { lineId: "P", color: "#522398" },
];

const LOOP_ONLY_THREE: LineInfo[] = [
  { lineId: "Brn", color: "#62361b" },
  { lineId: "Org", color: "#f9461c" },
  { lineId: "P", color: "#522398" },
];

const NORTH_APPROACH: LineInfo[] = [
  { lineId: "Brn", color: "#62361b" },
  { lineId: "P", color: "#522398" },
];

const WEST_APPROACH: LineInfo[] = [
  { lineId: "G", color: "#009b3a" },
  { lineId: "Pink", color: "#e27ea6" },
];

const GREEN_PINK_SOUTH_EXIT: LineInfo[] = [
  { lineId: "G", color: "#009b3a" },
  { lineId: "Pink", color: "#e27ea6" },
];

const GREEN_ORANGE_SOUTH: LineInfo[] = [
  { lineId: "G", color: "#009b3a" },
  { lineId: "Org", color: "#f9461c" },
];

function classifyMLSegment(coords: [number, number][]): LineInfo[] {
  const avgLat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const avgLng = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const minLat = Math.min(...coords.map((c) => c[0]));
  const maxLat = Math.max(...coords.map((c) => c[0]));
  const latRange = maxLat - minLat;
  const lngRange = Math.max(...coords.map((c) => c[1])) - Math.min(...coords.map((c) => c[1]));
  const isVertical = latRange > lngRange;

  // ── West approach: Green + Pink from Clinton/Ashland (lng west of -87.637) ──
  if (avgLng < -87.637) {
    return WEST_APPROACH;
  }

  // ── North approach: Brn + Purple from Merchandise Mart (north of Loop, vertical) ──
  // Merch Mart is at lat ~41.889, the Loop north edge is ~41.886
  if (isVertical && avgLat > 41.886 && avgLng > -87.636 && avgLng < -87.630) {
    return NORTH_APPROACH;
  }

  // ── South of the Loop (lat < 41.876) ──
  if (avgLat < 41.876) {
    // Vertical segments south of Loop along Wabash (lng ~ -87.626):
    // This is Green + Pink exiting south from east side of Loop
    if (isVertical && avgLng > -87.628) {
      // Far south (below Roosevelt ~41.867) = Green + Orange (separate lines)
      if (avgLat < 41.867) {
        return GREEN_ORANGE_SOUTH;
      }
      // Between Loop and Roosevelt = Green + Pink exit
      return GREEN_PINK_SOUTH_EXIT;
    }
    // Horizontal or west segments south of Loop
    return LOOP_ONLY_THREE;
  }

  // ── The Loop rectangle itself (lat 41.876-41.886, lng -87.634 to -87.626) ──

  // North side: horizontal, lat > 41.884
  if (!isVertical && avgLat > 41.884) {
    return ALL_FIVE;
  }

  // East side: vertical, lng > -87.628, AND within Loop latitude range
  if (isVertical && avgLng > -87.628 && minLat >= 41.876) {
    return ALL_FIVE;
  }

  // South side: horizontal, lat < 41.878
  if (!isVertical && avgLat < 41.878) {
    return LOOP_ONLY_THREE;
  }

  // West side: vertical, lng < -87.632, within Loop latitude range
  if (isVertical && avgLng < -87.632 && minLat >= 41.876) {
    return LOOP_ONLY_THREE;
  }

  // Fallback for ambiguous segments in the middle of the Loop
  return ALL_FIVE;
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

    const individualLines = new Map<string, [number, number][][]>();
    const mlSegments: [number, number][][] = [];

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
        for (const coords of featureCoords) mlSegments.push(coords);
      } else {
        const existing = individualLines.get(legend) ?? [];
        existing.push(...featureCoords);
        individualLines.set(legend, existing);
      }
    }

    const result: TrainLineSegment[] = [];

    for (const [legend, coordinates] of individualLines) {
      const mapping = LEGEND_MAP[legend];
      result.push({ lineId: mapping.lineId, color: mapping.color, coordinates, shared: false });
    }

    for (const coords of mlSegments) {
      const lines = classifyMLSegment(coords);
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
