import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get("stpid");
  const routeId = req.nextUrl.searchParams.get("route");
  if (!stopId) {
    return NextResponse.json({ predictions: [], alerts: [] });
  }

  try {
    // Get Metra vehicles on this route to show as "predictions"
    // Since Metra doesn't have a simple stop-level prediction API like CTA,
    // we show vehicles currently on the line heading toward this stop
    const predictions: Array<{
      route: string;
      direction: string;
      destination: string;
      minutes: number;
      vehicleId: string;
      isDelayed: boolean;
      type: "metra";
    }> = [];

    if (routeId) {
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("*")
        .eq("type", "metra")
        .eq("route", routeId)
        .order("updated_at", { ascending: false })
        .limit(10);

      if (vehicles) {
        for (const v of vehicles) {
          predictions.push({
            route: v.route,
            direction: v.destination || "En Route",
            destination: v.destination || routeId,
            minutes: -1, // indicates "active on line" rather than specific ETA
            vehicleId: v.vehicle_id.replace("metra-", ""),
            isDelayed: v.is_delayed,
            type: "metra",
          });
        }
      }
    }

    // Fetch alerts for this route
    const alerts: Array<{ header: string; description: string | null; route: string | null }> = [];
    const { data: alertData } = await supabase
      .from("metra_alerts")
      .select("*")
      .or(routeId ? `route_id.eq.${routeId},route_id.is.null` : "route_id.is.null");

    if (alertData) {
      for (const a of alertData) {
        alerts.push({
          header: a.header,
          description: a.description,
          route: a.route_id,
        });
      }
    }

    return NextResponse.json({ predictions, alerts });
  } catch (err) {
    console.error("Metra predictions error:", err);
    return NextResponse.json({ predictions: [], alerts: [] });
  }
}
