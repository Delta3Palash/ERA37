import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/access";
import { NextRequest, NextResponse } from "next/server";
import type { AvailabilityGrid, Weekday } from "@/lib/types";

const VALID_DAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * PUT /api/team-clock/availability/[id]
 * Body: { availability_utc: AvailabilityGrid }
 *
 * Write access: the owning user themselves OR any is_admin. Delegated
 * managers (can_manage) can edit only their own row — the Team Clock is
 * the public/team-wide view, so we don't want one R4 silently editing
 * another R4's schedule.
 *
 * Validation: each key must be a valid weekday; each value a list of
 * unique integers in [0, 23]. Anything else → 400.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: targetId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let isAdmin = false;
  if (user.id !== targetId) {
    // Need admin privileges to edit someone else's grid
    const auth = await requireManagerOrAdmin(supabase);
    if (auth.error) return auth.error;
    if (!auth.ctx.isAdmin) {
      return NextResponse.json(
        { error: "You can only edit your own availability" },
        { status: 403 }
      );
    }
    isAdmin = true;
  }

  const body = await req.json();
  const raw = body.availability_utc;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json(
      { error: "availability_utc must be an object" },
      { status: 400 }
    );
  }

  const cleaned: AvailabilityGrid = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!VALID_DAYS.includes(key as Weekday)) {
      return NextResponse.json({ error: `Invalid day key: ${key}` }, { status: 400 });
    }
    if (!Array.isArray(val)) {
      return NextResponse.json(
        { error: `${key} must be an array of hours` },
        { status: 400 }
      );
    }
    const hours = Array.from(
      new Set(
        val
          .map((h) => Number(h))
          .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
      )
    ).sort((a, b) => a - b);
    cleaned[key as Weekday] = hours;
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({ availability_utc: cleaned })
    .eq("id", targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, availability_utc: cleaned, edited_by_admin: isAdmin });
}
