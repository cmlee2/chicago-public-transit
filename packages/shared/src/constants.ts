// ─── CTA API Base URLs ──────────────────────────────────────────

export const CTA_BUS_API_BASE = "http://www.ctabustracker.com/bustime/api/v2";
export const CTA_TRAIN_API_BASE = "http://lapi.transitchicago.com/api/1.0";

// ─── Polling Intervals (ms) ─────────────────────────────────────

export const BUS_POLL_INTERVAL = 30_000;
export const TRAIN_POLL_INTERVAL = 30_000;
export const VEHICLE_POLL_INTERVAL = 15_000; // 15s for smoother map updates
export const ROUTE_CACHE_INTERVAL = 60 * 60 * 1000; // 1 hour

// Chicago center coordinates
export const CHICAGO_CENTER = { lat: 41.8781, lng: -87.6298 } as const;

// ─── Train Line Colors ──────────────────────────────────────────

export const TRAIN_LINES = {
  Red: { name: "Red Line", color: "#c60c30" },
  Blue: { name: "Blue Line", color: "#00a1de" },
  Brn: { name: "Brown Line", color: "#62361b" },
  G: { name: "Green Line", color: "#009b3a" },
  Org: { name: "Orange Line", color: "#f9461c" },
  P: { name: "Purple Line", color: "#522398" },
  Pink: { name: "Pink Line", color: "#e27ea6" },
  Y: { name: "Yellow Line", color: "#f9e300" },
} as const;

export type TrainLineId = keyof typeof TRAIN_LINES;

// ─── Metra Line Colors ──────────────────────────────────────────

export const METRA_LINES = {
  "BNSF": { name: "BNSF Railway", color: "#f58220" },
  "ME": { name: "Metra Electric", color: "#eb3a34" },
  "RI": { name: "Rock Island", color: "#bd2f2b" },
  "SWS": { name: "SouthWest Service", color: "#2e3192" },
  "HC": { name: "Heritage Corridor", color: "#795427" },
  "UP-N": { name: "UP North", color: "#0d5e38" },
  "UP-NW": { name: "UP Northwest", color: "#1e4d8c" },
  "UP-W": { name: "UP West", color: "#f0c318" },
  "MD-N": { name: "Milwaukee North", color: "#ef8a17" },
  "MD-W": { name: "Milwaukee West", color: "#ef8a17" },
  "NCS": { name: "North Central", color: "#5c2d82" },
} as const;

export type MetraLineId = keyof typeof METRA_LINES;
