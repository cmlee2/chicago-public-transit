"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { DbStop } from "@cpt/shared";
import { TRAIN_LINES, METRA_LINES } from "@cpt/shared";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface Prediction {
  route: string;
  direction: string;
  destination: string;
  eta: string;
  minutes: number;
  vehicleId: string;
  isDelayed: boolean;
  type: "bus" | "train" | "metra";
}

export default function StopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { userId } = useAuth();
  const [stop, setStop] = useState<DbStop | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);

  // Fetch stop info
  useEffect(() => {
    supabase
      .from("stops")
      .select("*")
      .eq("stop_id", id)
      .single()
      .then(({ data }) => {
        if (data) setStop(data);
      });
  }, [id]);

  // Fetch live predictions from CTA API
  const fetchPredictions = useCallback(async () => {
    if (!stop) return;
    try {
      const res = await fetch(
        `/api/stop-predictions?stpid=${id}&type=${stop.type}&route=${stop.route_id}`
      );
      const data = await res.json();
      if (data.predictions) {
        setPredictions(data.predictions);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [id, stop]);

  // Initial fetch + poll every 30s
  useEffect(() => {
    if (!stop) return;
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 30_000);
    return () => clearInterval(interval);
  }, [stop, fetchPredictions]);

  // Check if favorited
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_favorites")
      .select("stop_id")
      .eq("user_id", userId)
      .eq("stop_id", id)
      .single()
      .then(({ data }) => {
        setIsFavorite(!!data);
      });
  }, [userId, id]);

  async function toggleFavorite() {
    if (!userId) return;
    setTogglingFav(true);
    if (isFavorite) {
      await supabase
        .from("user_favorites")
        .delete()
        .eq("user_id", userId)
        .eq("stop_id", id);
      setIsFavorite(false);
    } else {
      await supabase
        .from("user_favorites")
        .insert({ user_id: userId, stop_id: id });
      setIsFavorite(true);
    }
    setTogglingFav(false);
  }

  if (!stop) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-muted-foreground">Loading stop...</p>
      </div>
    );
  }

  const lineColor =
    stop.type === "train"
      ? TRAIN_LINES[stop.route_id as keyof typeof TRAIN_LINES]?.color
      : stop.type === "metra"
        ? METRA_LINES[stop.route_id as keyof typeof METRA_LINES]?.color
        : undefined;

  function getRouteColor(route: string, type: string) {
    if (type === "train") return TRAIN_LINES[route as keyof typeof TRAIN_LINES]?.color ?? "#888";
    if (type === "metra") return METRA_LINES[route as keyof typeof METRA_LINES]?.color ?? "#888";
    return "#1d4ed8";
  }

  // Group predictions by route for summary
  const routeSummary = new Map<
    string,
    { route: string; type: string; color: string; count: number }
  >();
  for (const p of predictions) {
    if (!routeSummary.has(p.route)) {
      const color = getRouteColor(p.route, p.type);
      routeSummary.set(p.route, { route: p.route, type: p.type, color, count: 0 });
    }
    routeSummary.get(p.route)!.count++;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/stops" className="text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground uppercase">
        ← Back to stops
      </Link>

      <div className="mt-6 flex items-center gap-4">
        {lineColor ? (
          <div className="cta-roundel shrink-0" style={{ backgroundColor: lineColor, width: '2.5rem', height: '2.5rem', fontSize: '0.6rem' }}>
            {stop.route_id}
          </div>
        ) : (
          <div className="cta-roundel shrink-0 bg-[#1d4ed8]" style={{ width: '2.5rem', height: '2.5rem', fontSize: '0.55rem' }}>
            BUS
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{stop.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {stop.type === "train" ? "CTA Train Station" : stop.type === "metra" ? "Metra Station" : "Bus Stop"} · {stop.route_id}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        {userId && (
          <button onClick={toggleFavorite} disabled={togglingFav}
            className={`rounded px-3 py-1.5 text-xs font-semibold tracking-wide uppercase border transition-colors ${
              isFavorite ? "bg-yellow-500/15 border-yellow-500/50 text-yellow-500" : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
            }`}>
            {isFavorite ? "★ Favorited" : "☆ Add to Favorites"}
          </button>
        )}
        {[...routeSummary.values()].map((r) => (
          <span key={r.route} className="route-badge" style={{ backgroundColor: r.color }}>
            {r.type === "train" ? (TRAIN_LINES[r.route as keyof typeof TRAIN_LINES]?.name ?? r.route) : r.type === "metra" ? (METRA_LINES[r.route as keyof typeof METRA_LINES]?.name ?? r.route) : `Route ${r.route}`}
          </span>
        ))}
      </div>

      {/* Departure board header */}
      <div className="mt-8 flex items-center gap-3">
        <h2 className="text-sm font-bold tracking-[0.15em] uppercase">Departures</h2>
        <div className="flex items-center gap-1.5">
          <span className="status-dot live" />
          <span className="text-[10px] text-muted-foreground tracking-wider uppercase">Live</span>
        </div>
      </div>
      <div className="h-px bg-border mt-2" />

      {loading ? (
        <p className="mt-4 text-muted-foreground">Loading predictions...</p>
      ) : predictions.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No upcoming arrivals</p>
      ) : (
        <div className="mt-3">
          {/* Departure board header row */}
          <div className="flex items-center text-[10px] font-bold tracking-[0.15em] text-muted-foreground uppercase px-3 py-1.5">
            <span className="w-14">Route</span>
            <span className="flex-1">Destination</span>
            <span className="w-16 text-right">ETA</span>
          </div>
          <div className="space-y-1">
            {predictions.map((p, i) => {
              const routeColor = getRouteColor(p.route, p.type);

              return (
                <div key={`${p.vehicleId}-${p.eta}-${i}`}
                  className="transit-card flex items-center px-3 py-2.5">
                  <div className="w-14 shrink-0">
                    <span className="route-badge" style={{ backgroundColor: routeColor }}>{p.route}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.destination}</p>
                    <p className="text-[11px] text-muted-foreground">{p.direction} · #{p.vehicleId}</p>
                  </div>
                  <div className="w-16 text-right shrink-0">
                    <p className={`arrival-time text-lg ${
                      p.isDelayed ? "delayed" : p.minutes <= 1 ? "due" : p.minutes <= 5 ? "soon" : ""
                    }`}>
                      {p.minutes === 0 ? "Due" : `${p.minutes}m`}
                    </p>
                    {p.isDelayed && <span className="text-[10px] text-destructive font-semibold uppercase tracking-wider">Delayed</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
