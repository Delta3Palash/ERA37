import { createClient, createServiceClient } from "@/lib/supabase/server";
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
    return NextResponse.redirect(new URL("/join", req.url));
  }

  // Check admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) {
    return NextResponse.redirect(new URL("/chat?error=admin_only", req.url));
  }

  try {
    const clientId = process.env.SLACK_CLIENT_ID!;
    const clientSecret = process.env.SLACK_CLIENT_SECRET!;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/connections/slack/callback`;

    const data = await exchangeSlackCode(clientId, clientSecret, code, redirectUri);

    // Get first channel the bot can see
    const channelsRes = await fetch("https://slack.com/api/conversations.list?types=public_channel&limit=20", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const channelsData = await channelsRes.json();
    const firstChannel = channelsData.channels?.[0];

    const serviceClient = createServiceClient();
    const { error } = await serviceClient
      .from("connections")
      .upsert(
        {
          platform: "slack",
          platform_channel_id: firstChannel?.id || "general",
          channel_name: firstChannel ? `#${firstChannel.name}` : "#general",
          bot_token: data.access_token,
          metadata: {
            team_id: data.team?.id,
            team_name: data.team?.name,
          },
          created_by: user.id,
        },
        { onConflict: "platform,platform_channel_id" }
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
