export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ConversationView } from "@/components/conversation-view";
import { getUserAccess } from "@/lib/access";

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId: connectionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const access = await getUserAccess(supabase, user.id);

  // Only allow access if the connection is inside an accessible group
  const connection = access.accessibleConnections.find((c) => c.id === connectionId);
  if (!connection) redirect("/chat");

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_language, display_name")
    .eq("id", user.id)
    .single();

  return (
    <ConversationView
      connection={connection}
      roleMap={access.roleMap}
      userId={user.id}
      userName={profile?.display_name || "User"}
      preferredLanguage={profile?.preferred_language || "en"}
    />
  );
}
