import { createClient } from "@/lib/supabase/server";
import { getTelegramBotInfo, setTelegramWebhook } from "@/lib/telegram";
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
    // Verify bot token
    const botInfo = await getTelegramBotInfo(botToken);
    const bot = botInfo.result;

    // Set webhook
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const webhookUrl = `${appUrl}/api/webhooks/telegram?token=${encodeURIComponent(botToken)}`;
    await setTelegramWebhook(botToken, webhookUrl);

    // Save connection
    const { data, error } = await supabase
      .from("connections")
      .upsert(
        {
          user_id: user.id,
          platform: "telegram",
          platform_user_id: String(bot.id),
          platform_username: bot.username,
          bot_token: botToken,
          metadata: { first_name: bot.first_name },
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
