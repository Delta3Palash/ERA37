export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UnifiedView } from "@/components/unified-view";

export default async function AllMessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_language, display_name")
    .eq("id", user.id)
    .single();

  const { data: connections } = await supabase
    .from("connections")
    .select("*")
    .order("platform");

  return (
    <UnifiedView
      connections={connections || []}
      userId={user.id}
      userName={profile?.display_name || "User"}
      preferredLanguage={profile?.preferred_language || "en"}
    />
  );
}
