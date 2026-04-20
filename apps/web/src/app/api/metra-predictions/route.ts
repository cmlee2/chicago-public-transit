import { NextRequest, NextResponse } from "next/server";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const METRA_API_BASE = "https://gtfspublic.metrarr.com/gtfs/public";
const API_TOKEN = process.env.METRA_API_TOKEN;
const CHICAGO_TZ = "America/Chicago";

function chicagoNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: CHICAGO_TZ }));
}

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get("stpid");
  if (!stopId || !API_TOKEN) {
    return NextResponse.json({ predictions: [], alerts: [] });
  }

  try {
    // Fetch trip updates
    const res = await fetch(`${METRA_API_BASE}/tripupdates?api_token=${API_TOKEN}`);
    if (!res.ok) return NextResponse.json({ predictions: [], alerts: [] });
    const buffer = await res.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    const nowMs = chicagoNow().getTime();
    const predictions: Array<{
      route: string;
      direction: string;
      destination: string;
      minutes: number;
      vehicleId: string;
      isDelayed: boolean;
      type: "metra";
      stopName: string;
    }> = [];

    for (const entity of feed.entity) {
      const tu = entity.tripUpdate;
      if (!tu?.stopTimeUpdate || !tu.trip) continue;

      for (const stu of tu.stopTimeUpdate) {
        if (stu.stopId !== stopId) continue;

        const arrivalTime = stu.arrival?.time || stu.departure?.time;
        if (!arrivalTime) continue;

        const etaMs = Number(arrivalTime) * 1000;
        const minutes = Math.max(0, Math.round((etaMs - nowMs) / 60000));

        // Skip arrivals more than 2 hours away or already passed
        if (minutes > 120 || etaMs < nowMs - 60000) continue;

        const delay = stu.arrival?.delay || stu.departure?.delay || 0;

        predictions.push({
          route: tu.trip.routeId || "",
          direction: tu.trip.directionId === 0 ? "Outbound" : "Inbound",
          destination: tu.trip.tripId?.split("_")[1] || "",
          minutes,
          vehicleId: tu.vehicle?.id || "",
          isDelayed: delay > 300, // > 5 min delay
          type: "metra",
          stopName: stopId,
        });
      }
    }

    predictions.sort((a, b) => a.minutes - b.minutes);

    // Also fetch alerts for this stop's route
    const alertRes = await fetch(`${METRA_API_BASE}/alerts?api_token=${API_TOKEN}`);
    const alertBuffer = await alertRes.arrayBuffer();
    const alertFeed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(alertBuffer));

    const alerts: Array<{ header: string; description: string | null; route: string | null }> = [];

    // Get route for this stop from predictions, or from query
    const routeId = req.nextUrl.searchParams.get("route") || predictions[0]?.route;

    for (const entity of alertFeed.entity) {
      const alert = entity.alert;
      if (!alert) continue;

      const affectsRoute = alert.informedEntity?.some(
        (ie) => ie.routeId === routeId || !ie.routeId
      );
      if (!affectsRoute) continue;

      alerts.push({
        header: alert.headerText?.translation?.[0]?.text || "Alert",
        description: alert.descriptionText?.translation?.[0]?.text || null,
        route: alert.informedEntity?.[0]?.routeId || null,
      });
    }

    return NextResponse.json({ predictions, alerts });
  } catch (err) {
    console.error("Metra predictions error:", err);
    return NextResponse.json({ predictions: [], alerts: [] });
  }
}
