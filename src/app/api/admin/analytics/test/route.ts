import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchFunnelMetrics } from "@/lib/ga4-data";

export async function GET() {
  // Admin-only
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const metrics = await fetchFunnelMetrics(7);
    return NextResponse.json({ success: true, period: "last_7_days", metrics });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
