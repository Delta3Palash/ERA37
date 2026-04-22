import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/access";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/calendar/game/[id] — is_admin only.
// Removes the DB row and the corresponding object in Storage. The row keeps
// the full public URL, so we extract the storage path by looking at the
// portion after `/calendar-screenshots/` in the URL.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const auth = await requireManagerOrAdmin(supabase);
  if (auth.error) return auth.error;
  if (!auth.ctx.isAdmin) {
    return NextResponse.json(
      { error: "Only superadmins can delete game calendar screenshots" },
      { status: 403 }
    );
  }

  const svc = createServiceClient();
  const { data: row, error: readErr } = await svc
    .from("game_calendar_images")
    .select("id, image_url")
    .eq("id", id)
    .single();
  if (readErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Parse the storage path out of the public URL. Format:
  //   https://<project>.supabase.co/storage/v1/object/public/calendar-screenshots/<path>
  const marker = "/calendar-screenshots/";
  const idx = row.image_url.indexOf(marker);
  if (idx >= 0) {
    const storagePath = row.image_url.slice(idx + marker.length);
    const { error: rmErr } = await svc.storage
      .from("calendar-screenshots")
      .remove([storagePath]);
    if (rmErr) {
      // Log but don't block — we'd rather delete the DB row than leave a
      // dangling image the admin can't see in the UI.
      console.error("[calendar.game.delete] storage remove failed:", rmErr.message);
    }
  }

  const { error: delErr } = await svc
    .from("game_calendar_images")
    .delete()
    .eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
