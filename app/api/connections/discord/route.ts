import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { botToken, channelId, channelName } = await req.json();
  if (!botToken || !channelId) {
    return NextResponse.json({ error: "Bot token and channel ID required" }, { status: 400 });
  }

  try {
    // Verify bot token
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) throw new Error("Invalid bot token");
    const bot = await res.json();

    // Verify channel access
    const channelRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!channelRes.ok) throw new Error("Bot cannot access this channel. Make sure the bot is in the server.");
    const channel = await channelRes.json();

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("connections")
      .upsert(
        {
          platform: "discord",
          platform_channel_id: channelId,
          channel_name: channelName || `#${channel.name || channelId}`,
          bot_token: botToken,
          metadata: {
            bot_id: bot.id,
            bot_username: bot.username,
            guild_id: channel.guild_id,
          },
          created_by: user.id,
        },
        { onConflict: "platform,platform_channel_id" }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
