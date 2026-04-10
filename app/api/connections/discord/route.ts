import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { botToken } = await req.json();
  if (!botToken) {
    return NextResponse.json({ error: "Bot token required" }, { status: 400 });
  }

  try {
    // Verify bot token by fetching bot user info
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (!res.ok) throw new Error("Invalid bot token");
    const bot = await res.json();

    // Save connection
    const { data, error } = await supabase
      .from("connections")
      .upsert(
        {
          user_id: user.id,
          platform: "discord",
          platform_user_id: bot.id,
          platform_username: bot.username,
          bot_token: botToken,
          metadata: { discriminator: bot.discriminator },
        },
        { onConflict: "user_id,platform" }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
