"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@clerk/nextjs";
import type { DbStop } from "@cpt/shared";
import { TRAIN_LINES, METRA_LINES } from "@cpt/shared";
import Link from "next/link";

interface Prediction {
  route: string;
  direction: string;
  destination: string;
  minutes: number;
  isDelayed: boolean;
  type: "bus" | "train" | "metra";
}

interface FavoriteStop extends DbStop {
  predictions: Prediction[];
  loadingPredictions: boolean;
}

export default function FavoritesPage() {
  const { userId } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteStop[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    if (!userId) return;

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

    const { data: stopsData } = await supabase
      .from("stops")
      .select("*")
      .in("stop_id", stopIds);

    if (!stopsData) {
      setLoading(false);
      return;
    }

    // Set stops immediately with loading state
    const initial: FavoriteStop[] = stopsData.map((s) => ({
      ...s,
      predictions: [],
      loadingPredictions: true,
    }));
    setFavorites(initial);
    setLoading(false);

    // Fetch live predictions for each stop
    const updated = [...initial];
    for (let i = 0; i < updated.length; i++) {
      try {
        const res = await fetch(
          `/api/stop-predictions?stpid=${updated[i].stop_id}&type=${updated[i].type}`
        );
        const data = await res.json();
        updated[i] = {
          ...updated[i],
          predictions: (data.predictions ?? []).slice(0, 4),
          loadingPredictions: false,
        };
        setFavorites([...updated]);
      } catch {
        updated[i] = { ...updated[i], predictions: [], loadingPredictions: false };
        setFavorites([...updated]);
      }
    }
  }, [userId]);

  useEffect(() => {
    loadFavorites();
    // Refresh predictions every 30s
    const interval = setInterval(loadFavorites, 30_000);
    return () => clearInterval(interval);
  }, [loadFavorites]);

  async function removeFavorite(stopId: string) {
    if (!userId) return;
    await supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("stop_id", stopId);
    setFavorites((prev) => prev.filter((f) => f.stop_id !== stopId));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-muted-foreground">Loading favorites...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your Favorites</h1>
          <p className="text-xs text-muted-foreground tracking-wider uppercase mt-1">
            Live arrivals · Updates every 30s
          </p>
        </div>
        {favorites.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="status-dot live" />
            <span className="text-[10px] text-muted-foreground tracking-wider uppercase">Live</span>
          </div>
        )}
      </div>

      {favorites.length === 0 ? (
        <div className="mt-8 text-center py-12 border border-dashed border-border rounded-lg">
          <p className="text-muted-foreground">No favorite stops yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Click on a stop on the{" "}
            <Link href="/" className="text-[#00a1de] underline">map</Link>{" "}
            and tap the star to add it.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {favorites.map((stop) => {
            const lineColor =
              stop.type === "train"
                ? TRAIN_LINES[stop.route_id as keyof typeof TRAIN_LINES]?.color
                : stop.type === "metra"
                  ? METRA_LINES[stop.route_id as keyof typeof METRA_LINES]?.color
                  : undefined;

            return (
              <div key={stop.stop_id} className="transit-card">
                <div className="card-header">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {lineColor ? (
                      <div
                        className="cta-roundel shrink-0"
                        style={{ backgroundColor: lineColor, width: "2rem", height: "2rem", fontSize: "0.55rem" }}
                      >
                        {stop.route_id}
                      </div>
                    ) : (
                      <div
                        className="cta-roundel shrink-0 bg-[#1d4ed8]"
                        style={{ width: "2rem", height: "2rem", fontSize: "0.55rem" }}
                      >
                        BUS
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link href={`/stops/${stop.stop_id}`} className="font-semibold text-sm hover:text-[#00a1de] transition-colors truncate block">
                        {stop.name}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {stop.type === "train" ? "CTA Train" : stop.type === "metra" ? "Metra" : "Bus"} · {stop.route_id}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFavorite(stop.stop_id)}
                    className="text-yellow-500 hover:text-red-400 text-sm transition-colors shrink-0"
                    title="Remove from favorites"
                  >
                    ★
                  </button>
                </div>

                <div className="card-body">
                  {stop.loadingPredictions ? (
                    <p className="text-xs text-muted-foreground">Loading arrivals...</p>
                  ) : stop.predictions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No upcoming arrivals</p>
                  ) : (
                    <div className="space-y-1.5">
                      {stop.predictions.map((p, i) => {
                        const routeColor =
                          p.type === "train"
                            ? (TRAIN_LINES[p.route as keyof typeof TRAIN_LINES]?.color ?? "#888")
                            : p.type === "metra"
                              ? (METRA_LINES[p.route as keyof typeof METRA_LINES]?.color ?? "#888")
                              : "#1d4ed8";
                        return (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="route-badge shrink-0"
                                style={{ backgroundColor: routeColor }}
                              >
                                {p.route}
                              </span>
                              <span className="text-xs truncate">{p.destination}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {p.direction}
                              </span>
                            </div>
                            <span
                              className={`arrival-time text-sm shrink-0 ${
                                p.isDelayed
                                  ? "delayed"
                                  : p.minutes <= 1
                                    ? "due"
                                    : p.minutes <= 5
                                      ? "soon"
                                      : ""
                              }`}
                            >
                              {p.minutes === 0 ? "Due" : `${p.minutes}m`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
