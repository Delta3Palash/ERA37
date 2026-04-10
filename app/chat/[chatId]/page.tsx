export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ConversationView } from "@/components/conversation-view";

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: chat } = await supabase
    .from("chats")
    .select("*, connection:connections(*)")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .single();

  if (!chat) redirect("/chat");

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", user.id)
    .single();

  // Reset unread count
  await supabase
    .from("chats")
    .update({ unread_count: 0 })
    .eq("id", chatId);

  return (
    <ConversationView
      chat={chat}
      userId={user.id}
      preferredLanguage={profile?.preferred_language || "en"}
    />
  );
}
