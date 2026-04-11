export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ChatLayoutWrapper } from "@/components/chat-layout-wrapper";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: connections } = await supabase
    .from("connections")
    .select("*")
    .order("platform");

  return (
    <ChatLayoutWrapper>
      <ChatSidebar
        userId={user.id}
        profile={profile}
        connections={connections || []}
        isAdmin={profile?.is_admin || false}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </ChatLayoutWrapper>
  );
}
