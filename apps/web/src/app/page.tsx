"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DbStop } from "@cpt/shared";
import Link from "next/link";
import { TRAIN_LINES } from "@cpt/shared";

export default function Home() {
  const [query, setQuery] = useState("");
  const [stops, setStops] = useState<DbStop[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    const { data } = await supabase
      .from("stops")
      .select("*")
      .ilike("name", `%${query}%`)
      .limit(20);
    setStops(data ?? []);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold">Chicago Transit Tracker</h1>
      <p className="mt-2 text-muted-foreground">
        Search for a stop to see real-time arrivals
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

      {loading && (
        <p className="mt-6 text-muted-foreground">Searching...</p>
      )}

      {stops.length > 0 && (
        <ul className="mt-6 space-y-2">
          {stops.map((stop) => (
            <li key={stop.stop_id}>
              <Link
                href={`/stops/${stop.stop_id}`}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-accent"
              >
                <div>
                  <p className="font-medium">{stop.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {stop.type === "train" ? "Train" : "Bus"} &middot;{" "}
                    {stop.route_id}
                  </p>
                </div>
                {stop.type === "train" && (
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor:
                        TRAIN_LINES[
                          stop.route_id as keyof typeof TRAIN_LINES
                        ]?.color ?? "#888",
                    }}
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
