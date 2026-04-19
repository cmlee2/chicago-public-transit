// CTA Train Line Colors
export const TRAIN_LINES = {
  Red: { color: "#c60c30", name: "Red Line" },
  Blue: { color: "#00a1de", name: "Blue Line" },
  Brn: { color: "#62361b", name: "Brown Line" },
  G: { color: "#009b3a", name: "Green Line" },
  Org: { color: "#f9461c", name: "Orange Line" },
  P: { color: "#522398", name: "Purple Line" },
  Pink: { color: "#e27ea6", name: "Pink Line" },
  Y: { color: "#f9e300", name: "Yellow Line" },
} as const;

export type TrainLineCode = keyof typeof TRAIN_LINES;

// CTA API Base URLs
export const CTA_BUS_API_BASE = "http://www.ctabustracker.com/bustime/api/v2";
export const CTA_TRAIN_API_BASE = "http://lapi.transitchicago.com/api/1.0";

// Polling intervals (ms)
export const BUS_POLL_INTERVAL = 30_000;
export const TRAIN_POLL_INTERVAL = 30_000;
export const ROUTE_CACHE_INTERVAL = 3_600_000; // 1 hour
