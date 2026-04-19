"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { DbStop, DbArrival } from "@cpt/shared";
import { TRAIN_LINES } from "@cpt/shared";
import { useAuth } from "@clerk/nextjs";

export default function StopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { userId } = useAuth();
  const [stop, setStop] = useState<DbStop | null>(null);
  const [arrivals, setArrivals] = useState<DbArrival[]>([]);
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

  // Fetch initial arrivals + subscribe to realtime
  useEffect(() => {
    supabase
      .from("arrivals")
      .select("*")
      .eq("stop_id", id)
      .order("eta", { ascending: true })
      .then(({ data }) => {
        if (data) setArrivals(data);
      });

    const channel = supabase
      .channel(`arrivals-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "arrivals",
          filter: `stop_id=eq.${id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setArrivals((prev) =>
              prev.filter((a) => a.id !== (payload.old as DbArrival).id)
            );
          } else {
            const arrival = payload.new as DbArrival;
            setArrivals((prev) => {
              const idx = prev.findIndex((a) => a.id === arrival.id);
              const updated =
                idx >= 0
                  ? prev.map((a, i) => (i === idx ? arrival : a))
                  : [...prev, arrival];
              return updated.sort(
                (a, b) =>
                  new Date(a.eta).getTime() - new Date(b.eta).getTime()
              );
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

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
      : undefined;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3">
        {lineColor && (
          <span
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: lineColor }}
          />
        )}
        <h1 className="text-2xl font-bold">{stop.name}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {stop.type === "train" ? "Train" : "Bus"} &middot; {stop.route_id}
      </p>

      {userId && (
        <button
          onClick={toggleFavorite}
          disabled={togglingFav}
          className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          {isFavorite ? "★ Favorited" : "☆ Add to Favorites"}
        </button>
      )}

      <h2 className="mt-8 text-lg font-semibold">Upcoming Arrivals</h2>
      {arrivals.length === 0 ? (
        <p className="mt-2 text-muted-foreground">No upcoming arrivals</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {arrivals.map((arrival) => {
            const eta = new Date(arrival.eta);
            const minutesAway = Math.max(
              0,
              Math.round((eta.getTime() - Date.now()) / 60000)
            );
            return (
              <li
                key={arrival.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">
                    {arrival.route} &middot; {arrival.direction}
                  </p>
                  {arrival.is_delayed && (
                    <span className="text-xs text-destructive">Delayed</span>
                  )}
                </div>
                <p className="text-sm font-semibold">
                  {minutesAway === 0 ? "Due" : `${minutesAway} min`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
