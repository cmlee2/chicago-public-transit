// ─── Database Row Types ──────────────────────────────────────────

export interface DbRoute {
  route_id: string;
  name: string;
  color: string;
  type: "bus" | "train" | "metra";
}

export interface DbStop {
  stop_id: string;
  name: string;
  lat: number;
  lng: number;
  type: "bus" | "train" | "metra";
  route_id: string;
}

export interface DbArrival {
  id: string;
  stop_id: string;
  route: string;
  direction: string;
  eta: string;
  vehicle_id: string | null;
  is_delayed: boolean;
  updated_at: string;
}

export interface DbUserFavorite {
  user_id: string;
  stop_id: string;
  created_at: string;
}

export interface DbVehicle {
  vehicle_id: string;
  route: string;
  lat: number;
  lng: number;
  heading: number | null;
  type: "bus" | "train" | "metra";
  destination: string | null;
  is_delayed: boolean;
  updated_at: string;
}

// ─── CTA Bus API Types ──────────────────────────────────────────

export interface CtaBusPrediction {
  tmstmp: string;
  typ: string;
  stpnm: string;
  stpid: string;
  vid: string;
  dstp: number;
  rt: string;
  rtdd: string;
  rtdir: string;
  des: string;
  prdtm: string;
  tablockid: string;
  tatripid: string;
  dly: boolean;
  prdctdn: string;
  zone: string;
}

export interface CtaBusPredictionsResponse {
  "bustime-response": {
    prd?: CtaBusPrediction[];
    error?: Array<{ msg: string }>;
  };
}

export interface CtaBusRoute {
  rt: string;
  rtnm: string;
  rtclr: string;
  rtdd: string;
}

export interface CtaBusRoutesResponse {
  "bustime-response": {
    routes?: CtaBusRoute[];
    error?: Array<{ msg: string }>;
  };
}

// ─── CTA Train API Types ────────────────────────────────────────

export interface CtaTrainEta {
  staId: string;
  stpId: string;
  staNm: string;
  stpDe: string;
  rn: string;
  rt: string;
  destSt: string;
  destNm: string;
  trDr: string;
  prdt: string;
  arrT: string;
  isApp: string;
  isSch: string;
  isDly: string;
  isFlt: string;
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

// ─── CTA Vehicle Position API Types ─────────────────────────────

export interface CtaBusVehicle {
  vid: string;
  tmstmp: string;
  lat: string;
  lon: string;
  hdg: string;
  pid: number;
  rt: string;
  des: string;
  pdist: number;
  dly: boolean;
  tatripid: string;
  tablockid: string;
  zone: string;
}

export interface CtaBusVehiclesResponse {
  "bustime-response": {
    vehicle?: CtaBusVehicle[];
    error?: Array<{ msg: string }>;
  };
}

export interface CtaTrainPosition {
  rn: string;
  destSt: string;
  destNm: string;
  trDr: string;
  nextStaId: string;
  nextStpId: string;
  nextStaNm: string;
  prdt: string;
  arrT: string;
  isApp: string;
  isDly: string;
  lat: string;
  lon: string;
  heading: string;
}

export interface CtaTrainRoutePositions {
  "@name": string;
  train: CtaTrainPosition[];
}

export interface CtaTrainPositionsResponse {
  ctatt: {
    tmst: string;
    errCd: string;
    errNm: string | null;
    route?: CtaTrainRoutePositions[];
  };
}
