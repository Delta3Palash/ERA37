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
  const serviceClient = createServiceClient();

  await serviceClient
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.user_metadata?.display_name ||
          user.email ||
          "User",
        avatar_url:
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          null,
      },
      { onConflict: "id" }
    );

  return NextResponse.redirect(new URL("/chat", appUrl));
}
