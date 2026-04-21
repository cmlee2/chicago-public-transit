import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET() {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ alerts: [] });
    }

    const { data } = await supabase
      .from("metra_alerts")
      .select("*")
      .order("updated_at", { ascending: false });

    return NextResponse.json({ alerts: data ?? [] });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}
