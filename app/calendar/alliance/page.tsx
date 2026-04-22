export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUserAccess } from "@/lib/access";
import { CalendarTabs } from "@/components/calendar/calendar-tabs";
import { EventWeekView } from "@/components/calendar/event-week-view";

export default async function AllianceCalendarPage() {
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
        kind="alliance"
        canWrite={canWrite}
        currentUserId={user.id}
        isAdmin={isAdmin}
      />
    </div>
  );
}
