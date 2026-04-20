"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
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

interface StopWithPredictions extends DbStop {
  predictions: Prediction[];
  loadingPredictions: boolean;
}

export default function StopsListPage() {
  const [query, setQuery] = useState("");
  const [stops, setStops] = useState<StopWithPredictions[]>([]);
  const [loading, setLoading] = useState(false);
  const [nearbyStops, setNearbyStops] = useState<StopWithPredictions[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(true);

  // Load nearby stops using geolocation
  useEffect(() => {
    if (!navigator.geolocation) {
      setLoadingNearby(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const delta = 0.01;
        const { data } = await supabase
          .from("stops")
          .select("*")
          .gte("lat", lat - delta)
          .lte("lat", lat + delta)
          .gte("lng", lng - delta)
          .lte("lng", lng + delta)
          .limit(20);

        if (data && data.length > 0) {
          const initial = data.map((s) => ({ ...s, predictions: [], loadingPredictions: true }));
          setNearbyStops(initial);
          setLoadingNearby(false);
          // Fetch predictions for each stop from the CTA API
          fetchPredictionsForStops(initial, setNearbyStops);
        } else {
          setLoadingNearby(false);
        }
      },
      () => setLoadingNearby(false),
      { enableHighAccuracy: true }
    );
  }, []);

  async function fetchPredictionsForStops(
    stopList: StopWithPredictions[],
    setter: (stops: StopWithPredictions[]) => void
  ) {
    const updated = [...stopList];
    // Fetch in parallel, max 5 at a time to not overwhelm the API
    const batchSize = 5;
    for (let i = 0; i < updated.length; i += batchSize) {
      const batch = updated.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (stop, batchIdx) => {
          try {
            const res = await fetch(
              `/api/stop-predictions?stpid=${stop.stop_id}&type=${stop.type}`
            );
            const data = await res.json();
            updated[i + batchIdx] = {
              ...stop,
              predictions: (data.predictions ?? []).slice(0, 3),
              loadingPredictions: false,
            };
          } catch {
            updated[i + batchIdx] = { ...stop, predictions: [], loadingPredictions: false };
          }
        })
      );
      setter([...updated]);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    const { data } = await supabase
      .from("stops")
      .select("*")
      .ilike("name", `%${query}%`)
      .limit(20);

    if (data && data.length > 0) {
      const initial = data.map((s) => ({ ...s, predictions: [], loadingPredictions: true }));
      setStops(initial);
      setLoading(false);
      fetchPredictionsForStops(initial, setStops);
    } else {
      setStops([]);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold">Stops & Arrivals</h1>
      <p className="mt-2 text-muted-foreground">
        Search for a stop or browse nearby stops with live arrivals
      </p>

      <form onSubmit={handleSearch} className="mt-6 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stops by name..."
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Search
        </button>
      </form>

      {loading && <p className="mt-6 text-muted-foreground">Searching...</p>}

      {stops.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Search Results</h2>
          <StopsList stops={stops} />
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Nearby Stops</h2>
        {loadingNearby ? (
          <p className="mt-2 text-sm text-muted-foreground">Getting your location...</p>
        ) : nearbyStops.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No nearby stops found. Try searching above.
          </p>
        ) : (
          <StopsList stops={nearbyStops} />
        )}
      </div>
    </div>
  );
}

function StopsList({ stops }: { stops: StopWithPredictions[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {stops.map((stop) => {
        const lineColor =
          stop.type === "train"
            ? TRAIN_LINES[stop.route_id as keyof typeof TRAIN_LINES]?.color
            : stop.type === "metra"
              ? METRA_LINES[stop.route_id as keyof typeof METRA_LINES]?.color
              : undefined;

        return (
          <li
            key={stop.stop_id}
            className="rounded-lg border p-4 hover:bg-accent/50 transition-colors"
          >
            <Link href={`/stops/${stop.stop_id}`} className="block">
              <div className="flex items-center gap-3">
                {lineColor && (
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: lineColor }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{stop.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {stop.type === "train" ? "CTA Train" : stop.type === "metra" ? "Metra" : "Bus"} &middot; {stop.route_id}
                  </p>
                </div>
              </div>

              {stop.loadingPredictions ? (
                <p className="mt-2 text-xs text-muted-foreground">Loading arrivals...</p>
              ) : stop.predictions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {stop.predictions.map((p, i) => {
                    const routeColor =
                      p.type === "train"
                        ? (TRAIN_LINES[p.route as keyof typeof TRAIN_LINES]?.color ?? "#888")
                        : p.type === "metra"
                          ? (METRA_LINES[p.route as keyof typeof METRA_LINES]?.color ?? "#888")
                        : "#1d4ed8";
                    return (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          p.isDelayed
                            ? "bg-red-500/10 text-red-500"
                            : p.minutes <= 2
                              ? "bg-green-500/10 text-green-500"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: routeColor }}
                        />
                        {p.route} {p.destination}
                        <span className="font-semibold">
                          {p.minutes === 0 ? "Due" : `${p.minutes}m`}
                        </span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No upcoming arrivals</p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
