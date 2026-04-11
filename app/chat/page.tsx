export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";

export default async function ChatPage() {
  const supabase = await createClient();

  // If there are connections, redirect to unified view
  const { data: connections } = await supabase
    .from("connections")
    .select("id")
    .limit(1);

  if (connections && connections.length > 0) {
    redirect("/chat/all");
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted">
      <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
      <p className="text-lg">No channels connected yet</p>
      <p className="text-sm mt-1">
        Ask an admin to connect platforms in{" "}
        <a href="/settings" className="text-accent hover:underline">Settings</a>
      </p>
    </div>
  );
}
