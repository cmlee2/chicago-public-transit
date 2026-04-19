// ─── Transit Types ───────────────────────────────────────────────

export type TransitType = "bus" | "train";

// ─── Database Row Types ──────────────────────────────────────────

export interface DbRoute {
  route_id: string;
  name: string;
  color: string;
  type: TransitType;
}

export interface DbStop {
  stop_id: string;
  name: string;
  lat: number;
  lng: number;
  type: TransitType;
  route_id: string;
}

export interface DbArrival {
  id: string;
  stop_id: string;
  route: string;
  direction: string;
  eta: string; // ISO timestamp
  vehicle_id: string | null;
  is_delayed: boolean;
  updated_at: string;
}

export interface DbUserFavorite {
  user_id: string;
  stop_id: string;
  created_at: string;
}

// ─── CTA Bus Tracker API Types ───────────────────────────────────

export interface CtaBusPrediction {
  tmstmp: string; // yyyyMMdd HH:mm
  typ: "A" | "D"; // Arrival or Departure
  stpnm: string;
  stpid: string;
  vid: string;
  dstp: number; // distance to stop in feet
  rt: string; // route
  rtdd: string; // route direction
  rtdir: string; // direction (e.g., "Eastbound")
  des: string; // destination
  prdtm: string; // predicted time yyyyMMdd HH:mm
  tablockid: string;
  tatripid: string;
  dly: boolean;
  prdctdn: string; // countdown in minutes or "DUE"
  zone: string;
}

export interface CtaBusPredictionsResponse {
  "bustime-response": {
    prd?: CtaBusPrediction[];
    error?: Array<{ msg: string }>;
  };
}

// ─── CTA Train Tracker API Types ─────────────────────────────────

export interface CtaTrainEta {
  staId: string; // station ID
  stpId: string; // stop ID
  staNm: string; // station name
  stpDe: string; // stop description (e.g., "Service toward 95th")
  rn: string; // run number
  rt: string; // route code (e.g., "Red", "Blue")
  destSt: string; // destination station ID
  destNm: string; // destination name
  trDr: string; // direction code
  prdt: string; // prediction timestamp
  arrT: string; // arrival time
  isApp: "0" | "1"; // is approaching
  isSch: "0" | "1"; // is scheduled (vs live)
  isDly: "0" | "1"; // is delayed
  isFlt: "0" | "1"; // is fault
  flags: string | null;
  lat: string;
  lon: string;
  heading: string;
}

export interface CtaTrainArrivalsResponse {
  ctatt: {
    tmst: string;
    errCd: string;
    errNm: string | null;
    eta?: CtaTrainEta[];
  };
}
