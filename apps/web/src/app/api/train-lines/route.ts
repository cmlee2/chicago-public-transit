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

// CTA L Map analysis — which lines share each part of shared track:
//
// THE LOOP (elevated rectangle downtown):
//   North side (Lake St, lat~41.886, lng -87.631 to -87.628):
//     Brn, G, Org, Pink, P — all 5
//   East side (Wabash Ave, lng~-87.626, lat 41.886 down to 41.877):
//     Brn, G, Org, Pink, P — all 5
//   South side (Van Buren St, lat~41.877, lng -87.628 to -87.632):
//     Brn, Org, P — only 3 (Green exits east→south, Pink exits east→south)
//   West side (Wells St, lng~-87.634, lat 41.877 up to 41.883):
//     Brn, Org, P — only 3
//
// APPROACHES:
//   North approach: Merchandise Mart → Clark/Lake (lng~-87.631 to -87.634, lat >41.886):
//     Brn, P — Brown/Purple from north
//   West elevated approach: Clinton/Ashland area → Lake (lat~41.886, lng < -87.637):
//     G, Pink — Green/Pink from west (they merge onto north side of Loop)
//   South of Loop (lat < 41.876): varies, but Roosevelt area = G, Org on separate tracks

interface LineInfo { lineId: string; color: string }

const ALL_FIVE: LineInfo[] = [
  { lineId: "Brn", color: "#62361b" },
  { lineId: "G", color: "#009b3a" },
  { lineId: "Org", color: "#f9461c" },
  { lineId: "Pink", color: "#e27ea6" },
  { lineId: "P", color: "#522398" },
];

const SOUTH_WEST_LOOP: LineInfo[] = [
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

const GREEN_ORANGE: LineInfo[] = [
  { lineId: "G", color: "#009b3a" },
  { lineId: "Org", color: "#f9461c" },
];

// Loop bounds
const LOOP_NORTH = 41.886;
const LOOP_SOUTH = 41.877;
const LOOP_EAST = -87.626;
const LOOP_WEST = -87.634;

function getLoopLinesForSegment(coords: [number, number][]): LineInfo[] {
  const avgLat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const avgLng = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const minLat = Math.min(...coords.map((c) => c[0]));
  const maxLat = Math.max(...coords.map((c) => c[0]));
  const minLng = Math.min(...coords.map((c) => c[1]));
  const maxLng = Math.max(...coords.map((c) => c[1]));
  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;
  const isVertical = latRange > lngRange;

  // === WEST APPROACH (far west of Loop, Green + Pink elevated from Clinton) ===
  if (avgLng < -87.645) {
    return WEST_APPROACH;
  }

  // === NORTH APPROACH (Merchandise Mart area, north of Loop, Brown + Purple) ===
  if (avgLat > LOOP_NORTH + 0.001 && isVertical && avgLng > -87.636 && avgLng < -87.630) {
    return NORTH_APPROACH;
  }

  // === INSIDE THE LOOP RECTANGLE ===
  const inLoopLat = avgLat >= LOOP_SOUTH - 0.002 && avgLat <= LOOP_NORTH + 0.002;
  const inLoopLng = avgLng >= LOOP_WEST - 0.003 && avgLng <= LOOP_EAST + 0.003;

  if (inLoopLat && inLoopLng) {
    // North side: E-W, lat close to 41.886
    if (!isVertical && avgLat > 41.883) {
      // Check if this is the merge area where west approach meets the Loop
      if (minLng < -87.637) {
        return ALL_FIVE; // transition zone
      }
      return ALL_FIVE;
    }

    // East side: N-S, lng close to -87.626
    if (isVertical && avgLng > -87.629) {
      return ALL_FIVE;
    }

    // South side: E-W, lat close to 41.877
    if (!isVertical && avgLat < 41.879) {
      return SOUTH_WEST_LOOP;
    }

    // West side: N-S, lng close to -87.634
    if (isVertical && avgLng < -87.631) {
      return SOUTH_WEST_LOOP;
    }

    // Diagonal or ambiguous segments inside the Loop
    if (avgLat > 41.882) return ALL_FIVE;
    return SOUTH_WEST_LOOP;
  }

  // === SOUTH OF LOOP ===
  if (avgLat < LOOP_SOUTH - 0.001) {
    // Roosevelt area: Green + Orange share some track
    if (isVertical && avgLng > -87.628) {
      return GREEN_ORANGE;
    }
    // West of Loop going south: only Brn/Org/P
    return SOUTH_WEST_LOOP;
  }

  // === Default: all five ===
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

    // Individual lines
    for (const [legend, coordinates] of individualLines) {
      const mapping = LEGEND_MAP[legend];
      result.push({ lineId: mapping.lineId, color: mapping.color, coordinates, shared: false });
    }

    // Shared ML segments — assign correct lines per segment
    for (const coords of mlSegments) {
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
