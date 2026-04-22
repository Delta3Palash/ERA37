import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/notifications/read
 * Body: { ids?: string[], all?: boolean }
 *
 * Marks the given notification ids (or all of the caller's notifications) as
 * read by stamping `read_at = now()`. The UPDATE RLS policy ensures users
 * can only ever mark their own rows.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined;
  const all = !!body?.all;

  if (!ids && !all) {
    return NextResponse.json({ error: "ids or all required" }, { status: 400 });
  }

  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (ids) q = q.in("id", ids);

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
