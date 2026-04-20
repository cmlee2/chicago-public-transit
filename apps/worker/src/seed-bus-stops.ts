import { CTA_BUS_API_BASE } from "@cpt/shared";
import { supabase } from "./supabase.js";

const API_KEY = process.env.CTA_BUS_API_KEY!;

interface CtaDirection {
  dir: string;
}

interface CtaStop {
  stpid: string;
  stpnm: string;
  lat: number;
  lon: number;
}

export async function seedBusStops() {
  console.log("Seeding bus stops from CTA API...");

  // Get all bus routes from our DB
  const { data: routes } = await supabase
    .from("routes")
    .select("route_id")
    .eq("type", "bus");

  if (!routes || routes.length === 0) {
    console.log("No bus routes in DB — run route caching first");
    return;
  }

  let totalStops = 0;

  for (const route of routes) {
    try {
      // Get directions for this route
      const dirRes = await fetch(
        `${CTA_BUS_API_BASE}/getdirections?key=${API_KEY}&rt=${route.route_id}&format=json`
      );
      const dirData = (await dirRes.json()) as { "bustime-response"?: { directions?: CtaDirection[] } };
      const directions: CtaDirection[] =
        dirData?.["bustime-response"]?.directions ?? [];

      for (const dir of directions) {
        // Get stops for this route + direction
        const stpRes = await fetch(
          `${CTA_BUS_API_BASE}/getstops?key=${API_KEY}&rt=${route.route_id}&dir=${encodeURIComponent(dir.dir)}&format=json`
        );
        const stpData = (await stpRes.json()) as { "bustime-response"?: { stops?: CtaStop[] } };
        const stops: CtaStop[] = stpData?.["bustime-response"]?.stops ?? [];

        if (stops.length === 0) continue;

        const rows = stops.map((s) => ({
          stop_id: s.stpid,
          name: `${s.stpnm} (${route.route_id} - ${dir.dir})`,
          lat: s.lat,
          lng: s.lon,
          type: "bus" as const,
          route_id: route.route_id,
        }));

        // Upsert in batches
        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200);
          const { error } = await supabase
            .from("stops")
            .upsert(batch, { onConflict: "stop_id" });
          if (error) {
            // Stop ID conflicts are expected — same stop serves multiple routes
            // Just skip silently for duplicates
            if (!error.message.includes("duplicate")) {
              console.error(
                `Bus stop upsert error for route ${route.route_id}:`,
                error.message
              );
            }
          }
        }
        totalStops += stops.length;
      }

      // Rate limit — CTA API is touchy
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      console.error(`Error seeding stops for route ${route.route_id}:`, err);
    }
  }

  console.log(`Seeded ${totalStops} bus stop records`);
}
