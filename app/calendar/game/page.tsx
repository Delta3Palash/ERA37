export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CalendarTabs } from "@/components/calendar/calendar-tabs";
import { GameWeekGrid } from "@/components/calendar/game-week-grid";

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

  return (
    <div className="flex flex-col h-full">
      <CalendarTabs />
      <GameWeekGrid canManage={!!profile?.is_admin} />
    </div>
  );
}
