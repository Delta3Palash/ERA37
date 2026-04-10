export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  // Check if invite code is valid
  const { data: invitation } = await supabase
    .from("invitations")
    .select("*")
    .eq("code", code)
    .is("used_by", null)
    .single();

  if (!invitation) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <h1 className="text-2xl font-bold">
            ERA<span className="text-accent">37</span>
          </h1>
          <p className="text-red-400">This invitation link is invalid or has already been used.</p>
        </div>
      </div>
    );
  }

  // Check if user is already logged in
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/chat");

  // Redirect to signup with code
  redirect(`/auth/signup?code=${code}`);
}
