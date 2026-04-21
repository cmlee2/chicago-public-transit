import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get("stpid");
  const routeId = req.nextUrl.searchParams.get("route");
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

    return NextResponse.json({ predictions, alerts });
  } catch (err) {
    console.error("Metra predictions error:", err);
    return NextResponse.json({ predictions: [], alerts: [] });
  }
}
