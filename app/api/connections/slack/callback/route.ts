import { createClient } from "@/lib/supabase/server";
import { exchangeSlackCode } from "@/lib/slack";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/settings?error=no_code", req.url));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  try {
    const clientId = process.env.SLACK_CLIENT_ID!;
    const clientSecret = process.env.SLACK_CLIENT_SECRET!;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/connections/slack/callback`;

    const data = await exchangeSlackCode(clientId, clientSecret, code, redirectUri);

    // Save connection
    const { error } = await supabase
      .from("connections")
      .upsert(
        {
          user_id: user.id,
          platform: "slack",
          platform_user_id: data.bot_user_id || data.authed_user?.id || "unknown",
          platform_username: data.team?.name || "Slack Workspace",
          bot_token: data.access_token,
          metadata: {
            team_id: data.team?.id,
            team_name: data.team?.name,
            scope: data.scope,
          },
        },
        { onConflict: "user_id,platform" }
      );

    if (error) throw error;

    return NextResponse.redirect(new URL("/settings?success=slack", req.url));
  } catch (err: any) {
    console.error("Slack OAuth error:", err);
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(err.message)}`, req.url)
    );
  }
}
