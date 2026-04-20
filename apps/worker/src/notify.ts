import { supabase } from "./supabase.js";

const NOTIFY_THRESHOLD_MINUTES = 5;

export async function checkAndNotify() {
  try {
    // Find arrivals approaching within threshold for favorited stops
    const thresholdTime = new Date(
      Date.now() + NOTIFY_THRESHOLD_MINUTES * 60_000
    ).toISOString();
    const now = new Date().toISOString();

    // Get all user favorites with approaching arrivals
    const { data: favorites } = await supabase
      .from("user_favorites")
      .select("user_id, stop_id");

    if (!favorites || favorites.length === 0) return;

    const stopIds = [...new Set(favorites.map((f) => f.stop_id))];

    const { data: arrivals } = await supabase
      .from("arrivals")
      .select("*")
      .in("stop_id", stopIds)
      .gte("eta", now)
      .lte("eta", thresholdTime);

    if (!arrivals || arrivals.length === 0) return;

    // Group arrivals by stop
    const arrivalsByStop = new Map<string, typeof arrivals>();
    for (const arr of arrivals) {
      const existing = arrivalsByStop.get(arr.stop_id) ?? [];
      existing.push(arr);
      arrivalsByStop.set(arr.stop_id, existing);
    }

    // Log notifications (replace with actual push notification service later)
    for (const fav of favorites) {
      const stopArrivals = arrivalsByStop.get(fav.stop_id);
      if (stopArrivals && stopArrivals.length > 0) {
        console.log(
          `[NOTIFY] User ${fav.user_id}: ${stopArrivals.length} arrival(s) approaching stop ${fav.stop_id}`
        );
      }
    }
  } catch (err) {
    console.error("Notification check error:", err);
  }
}
