import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const isSignup = req.nextUrl.searchParams.get("signup") === "1";
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

  const user = data.user;
  const meta = user.user_metadata ?? {};
  const serviceClient = createServiceClient();

  // Check if this user already has a profile (returning user)
  const { data: existingProfile } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  if (existingProfile) {
    // Returning user — update display name/avatar, let them through
    const discordAvatarUrl =
      meta.id && meta.avatar
        ? `https://cdn.discordapp.com/avatars/${meta.id}/${meta.avatar}.png`
        : null;

    await serviceClient
      .from("profiles")
      .update({
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
      })
      .eq("id", user.id);

    return NextResponse.redirect(new URL("/chat", appUrl));
  }

  // New user — only allow if they came through the invite code flow
  if (!isSignup) {
    // They used "Sign in" mode but have no profile — reject
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/join?error=no_account", appUrl)
    );
  }

  // New user with valid invite flow — create profile
  const discordAvatarUrl =
    meta.id && meta.avatar
      ? `https://cdn.discordapp.com/avatars/${meta.id}/${meta.avatar}.png`
      : null;

  const { error: profileError } = await serviceClient
    .from("profiles")
    .insert({
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
    });

  if (profileError) {
    console.error("Profile creation failed:", profileError);
  }

  return NextResponse.redirect(new URL("/chat", appUrl));
}
