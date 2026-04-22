export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CalendarTabs } from "@/components/calendar/calendar-tabs";
import { EventWeekView } from "@/components/calendar/event-week-view";

/**
 * Miscellaneous tab — R5 (is_admin) creates ad-hoc tasks and can assign any
 * R4 as owner. Reads are open to everyone; only is_admin sees the Create
 * button and only is_admin can edit/delete (enforced in event-week-view.tsx
 * and the API).
 */
export default async function MiscCalendarPage() {
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
  const isAdmin = !!profile?.is_admin;

  return (
    <div className="flex flex-col h-full">
      <CalendarTabs />
      <EventWeekView
        kind="misc"
        canWrite={isAdmin}
        currentUserId={user.id}
        isAdmin={isAdmin}
      />
    </div>
  );
}
