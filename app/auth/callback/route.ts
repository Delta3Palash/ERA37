import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(new URL("/join", appUrl));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/join?error=auth_failed", appUrl));
  }

  // Create profile if it doesn't exist (replaces the DB trigger)
  const user = data.user;
  const meta = user.user_metadata ?? {};
  const serviceClient = createServiceClient();

  // Build Discord avatar URL from hash if needed
  const discordAvatarUrl =
    meta.id && meta.avatar
      ? `https://cdn.discordapp.com/avatars/${meta.id}/${meta.avatar}.png`
      : null;

  const { error: profileError } = await serviceClient
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name:
          meta.custom_claims?.global_name ||
          meta.full_name ||
          meta.name ||
          meta.display_name ||
          meta.username ||
          user.email ||
          "User",
        avatar_url:
          meta.avatar_url ||
          meta.picture ||
          discordAvatarUrl ||
          null,
      },
      { onConflict: "id" }
    );

  if (profileError) {
    console.error("Profile upsert failed:", profileError);
  }

  return NextResponse.redirect(new URL("/chat", appUrl));
}
