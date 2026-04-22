export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/access";
import { CalendarTabs } from "@/components/calendar/calendar-tabs";
import { TeamClockView } from "@/components/calendar/team-clock/team-clock-view";

/**
 * Team Clock — a radial UTC clock with concentric timezone rings and an
 * R4-availability overlay. Visible to everyone in the alliance; editing any
 * R4's availability requires either being that R4 themselves (can_manage)
 * or being is_admin.
 */
export default async function TeamClockPage() {
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

  return (
    <div className="flex flex-col h-full">
      <CalendarTabs />
      <TeamClockView
        currentUserId={user.id}
        isAdmin={!!profile?.is_admin}
        canManage={access.canManage}
      />
    </div>
  );
}
