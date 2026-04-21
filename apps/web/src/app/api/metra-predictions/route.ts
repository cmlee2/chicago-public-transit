import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const METRA_SCHEDULE_BASE = "https://gtfsapi.metrarail.com/gtfs/schedule";
const METRA_API_TOKEN = process.env.METRA_API_TOKEN;
const CHICAGO_TZ = "America/Chicago";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    for (const candidate of Object.values(value)) {
      if (Array.isArray(candidate)) return candidate as T[];
    }
  }
  return [];
}

function chicagoDateParts(date: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    yyyymmdd: `${parts.year}${parts.month}${parts.day}`,
    weekday: parts.weekday.toLowerCase(),
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function parseGtfsTime(time: string, base: { year: number; month: number; day: number }) {
  const [hh, mm, ss] = time.split(":").map(Number);
  const dayOffset = Math.floor(hh / 24);
  const hour = hh % 24;
  return new Date(Date.UTC(base.year, base.month - 1, base.day + dayOffset, hour + 5, mm, ss || 0));
}

function isDowntownTerminal(name: string) {
  return /union station|millennium|ogilvie|lasalle/i.test(name);
}

async function fetchMetraScheduleJson(endpoint: string) {
  const urls = METRA_API_TOKEN
    ? [
        `${METRA_SCHEDULE_BASE}/${endpoint}?api_token=${METRA_API_TOKEN}`,
        `${METRA_SCHEDULE_BASE}/${endpoint}`,
      ]
    : [`${METRA_SCHEDULE_BASE}/${endpoint}`];

  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      continue;
    }
  }

  return null;
}

async function getActiveServiceIds(now: Date) {
  const [calendarJson, calendarDatesJson] = await Promise.all([
    fetchMetraScheduleJson("calendar"),
    fetchMetraScheduleJson("calendar_dates"),
  ]);

  const calendar = toArray<Record<string, string>>(calendarJson);
  const calendarDates = toArray<Record<string, string>>(calendarDatesJson);
  const { yyyymmdd, weekday } = chicagoDateParts(now);

  const active = new Set<string>();
  for (const row of calendar) {
    if (
      row.start_date <= yyyymmdd &&
      row.end_date >= yyyymmdd &&
      row[weekday] === "1"
    ) {
      active.add(row.service_id);
    }
  }

  for (const row of calendarDates) {
    if (row.date !== yyyymmdd) continue;
    if (row.exception_type === "1") active.add(row.service_id);
    if (row.exception_type === "2") active.delete(row.service_id);
  }

  return active;
}

async function getScheduledDepartures(stopId: string, routeId: string, stationName: string) {
  if (!isDowntownTerminal(stationName)) return [];

  const now = new Date();
  const services = await getActiveServiceIds(now);
  if (services.size === 0) return [];

  const tripsJson = await fetchMetraScheduleJson("trips");
  const trips = toArray<Record<string, string>>(tripsJson).filter(
    (trip) => trip.route_id === routeId && services.has(trip.service_id)
  );
  if (trips.length === 0) return [];

  const chicagoBase = chicagoDateParts(now);
  const departures = await Promise.all(
    trips.slice(0, 80).map(async (trip) => {
      const stopTimesJson = await fetchMetraScheduleJson(
        `stop_times/${encodeURIComponent(trip.trip_id)}`
      );
      const stopTimes = toArray<Record<string, string>>(stopTimesJson);
      const match = stopTimes.find((st) => st.stop_id === stopId);
      if (!match) return null;

      const departureTime = match.departure_time || match.arrival_time;
      if (!departureTime) return null;

      const eta = parseGtfsTime(departureTime, chicagoBase);
      if (eta.getTime() < now.getTime() - 60_000) return null;

      return {
        route: routeId,
        direction: "Outbound",
        destination: trip.trip_headsign || routeId,
        minutes: Math.max(0, Math.round((eta.getTime() - now.getTime()) / 60000)),
        vehicleId: trip.trip_short_name || trip.trip_id,
        isDelayed: false,
        type: "metra" as const,
      };
    })
  );

  return departures
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 10);
}

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get("stpid");
  const routeId = req.nextUrl.searchParams.get("route");
  const stationName = req.nextUrl.searchParams.get("stationName") ?? "";
  if (!stopId) {
    return NextResponse.json({ predictions: [], alerts: [] });
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ predictions: [], alerts: [] });
    }

    // Query arrivals table (populated by worker from GTFS-RT trip updates)
    const now = new Date().toISOString();
    // Query Metra arrivals (id starts with "metra-")
    let query = supabase
      .from("arrivals")
      .select("*")
      .eq("stop_id", stopId)
      .like("id", "metra-%")
      .gte("eta", now)
      .order("eta", { ascending: true })
      .limit(25);
    if (routeId) {
      query = query.eq("route", routeId);
    }
    const { data: arrivals } = await query;

    const predictions = (arrivals ?? []).map((a) => {
      const minutes = Math.max(0, Math.round((new Date(a.eta).getTime() - Date.now()) / 60000));
      // Extract train number from vehicle_id or trip id for display
      const trainNum = a.vehicle_id ?? "";
      return {
        route: a.route,
        direction: a.direction,
        destination: a.direction === "Inbound" ? "Chicago" : a.route,
        minutes,
        vehicleId: trainNum,
        isDelayed: a.is_delayed,
        type: "metra" as const,
      };
    });

    const scheduledPredictions =
      routeId && stationName ? await getScheduledDepartures(stopId, routeId, stationName) : [];

    const mergedPredictions = [...predictions];
    for (const scheduled of scheduledPredictions) {
      if (
        mergedPredictions.some(
          (existing) =>
            existing.route === scheduled.route &&
            existing.vehicleId === scheduled.vehicleId
        )
      ) {
        continue;
      }
      mergedPredictions.push(scheduled);
    }
    mergedPredictions.sort((a, b) => a.minutes - b.minutes);

    // Fetch alerts for this route
    const alerts: Array<{ header: string; description: string | null; route: string | null }> = [];
    if (routeId) {
      const { data: alertData } = await supabase
        .from("metra_alerts")
        .select("*")
        .or(`route_id.eq.${routeId},route_id.is.null`);

      if (alertData) {
        for (const a of alertData) {
          alerts.push({ header: a.header, description: a.description, route: a.route_id });
        }
      }
    }

    return NextResponse.json({ predictions: mergedPredictions.slice(0, 10), alerts });
  } catch (err) {
    console.error("Metra predictions error:", err);
    return NextResponse.json({ predictions: [], alerts: [] });
  }
}
