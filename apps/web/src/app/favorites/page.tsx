"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@clerk/nextjs";
import type { DbStop, DbArrival } from "@cpt/shared";
import { TRAIN_LINES } from "@cpt/shared";
import Link from "next/link";

interface FavoriteStop extends DbStop {
  nextArrival?: DbArrival;
}

export default function FavoritesPage() {
  const { userId } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteStop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      // Get user's favorite stop IDs
      const { data: favData } = await supabase
        .from("user_favorites")
        .select("stop_id")
        .eq("user_id", userId);

      if (!favData || favData.length === 0) {
        setFavorites([]);
        setLoading(false);
        return;
      }

      const stopIds = favData.map((f) => f.stop_id);

      // Fetch stop details
      const { data: stopsData } = await supabase
        .from("stops")
        .select("*")
        .in("stop_id", stopIds);

      if (!stopsData) {
        setLoading(false);
        return;
      }

      // Fetch next arrival for each stop
      const stopsWithArrivals: FavoriteStop[] = await Promise.all(
        stopsData.map(async (stop) => {
          const { data: arrData } = await supabase
            .from("arrivals")
            .select("*")
            .eq("stop_id", stop.stop_id)
            .gte("eta", new Date().toISOString())
            .order("eta", { ascending: true })
            .limit(1);
          return {
            ...stop,
            nextArrival: arrData?.[0] ?? undefined,
          };
        })
      );

      setFavorites(stopsWithArrivals);
      setLoading(false);
    }

    load();
  }, [userId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-muted-foreground">Loading favorites...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Your Favorites</h1>

      {favorites.length === 0 ? (
        <p className="mt-4 text-muted-foreground">
          No favorite stops yet. Search for a stop and add it to your favorites.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {favorites.map((stop) => {
            const lineColor =
              stop.type === "train"
                ? TRAIN_LINES[stop.route_id as keyof typeof TRAIN_LINES]
                    ?.color
                : undefined;
            const minutesAway = stop.nextArrival
              ? Math.max(
                  0,
                  Math.round(
                    (new Date(stop.nextArrival.eta).getTime() - Date.now()) /
                      60000
                  )
                )
              : null;

            return (
              <li key={stop.stop_id}>
                <Link
                  href={`/stops/${stop.stop_id}`}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    {lineColor && (
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: lineColor }}
                      />
                    )}
                    <div>
                      <p className="font-medium">{stop.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {stop.type === "train" ? "Train" : "Bus"} &middot;{" "}
                        {stop.route_id}
                      </p>
                    </div>
                  </div>
                  {minutesAway !== null && (
                    <p className="text-sm font-semibold">
                      {minutesAway === 0 ? "Due" : `${minutesAway} min`}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
