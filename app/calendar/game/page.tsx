export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/access";
import { CalendarTabs } from "@/components/calendar/calendar-tabs";
import { EventWeekView } from "@/components/calendar/event-week-view";
import { GameWeekGrid } from "@/components/calendar/game-week-grid";

/**
 * Game tab layout:
 *   - Structured week view of kind='game' events (primary) — R4s can be
 *     assigned to each in-game event, times render in viewer's timezone.
 *   - Collapsible "Reference screenshots" section at the bottom of the
 *     same scroll area, holding the raw game-calendar uploads.
 *
 * Write access matches alliance events: anyone with can_manage OR is_admin
 * can create / edit-own / delete-own. Screenshot upload + delete still
 * requires is_admin (enforced in /api/calendar/game).
 */
export default async function GameCalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  const access = await getUserAccess(supabase, user.id);

  const isAdmin = !!profile?.is_admin;
  const canWrite = isAdmin || access.canManage;

  return (
    <div className="flex flex-col h-full">
      <CalendarTabs />
      <EventWeekView
        kind="game"
        canWrite={canWrite}
        currentUserId={user.id}
        isAdmin={isAdmin}
        footer={<GameWeekGrid canManage={isAdmin} collapsible />}
      />
    </div>
  );
}
