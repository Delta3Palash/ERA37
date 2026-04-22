import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/access";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/team-clock/timezones/[id] — is_admin only.
// Removes the zone from the displayed ring set. Availability data is on
// profiles (in UTC) so nothing to cascade.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;
  if (!auth.ctx.isAdmin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from("team_clock_timezones").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
