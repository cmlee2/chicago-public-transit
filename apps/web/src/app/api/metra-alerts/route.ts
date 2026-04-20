import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data } = await supabase
      .from("metra_alerts")
      .select("*")
      .order("updated_at", { ascending: false });

    return NextResponse.json({ alerts: data ?? [] });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}
