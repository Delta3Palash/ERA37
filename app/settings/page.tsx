export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminSettings } from "@/components/admin-settings";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/chat");

  const { data: connections } = await supabase
    .from("connections")
    .select("*")
    .order("platform");

  const { data: workspace } = await supabase
    .from("workspace")
    .select("*")
    .single();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <a href="/chat" className="text-sm text-accent hover:underline">
            Back to Chat
          </a>
        </div>
        <AdminSettings
          profile={profile}
          connections={connections || []}
          workspace={workspace}
          userId={user.id}
        />
      </div>
    </div>
  );
}
