import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getTelegramBotInfo, setTelegramWebhook } from "@/lib/telegram";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { botToken, chatId, chatName } = await req.json();
  if (!botToken || !chatId) {
    return NextResponse.json({ error: "Bot token and chat ID required" }, { status: 400 });
  }

  try {
    const botInfo = await getTelegramBotInfo(botToken);
    const bot = botInfo.result;

    // Set webhook
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const webhookUrl = `${appUrl}/api/webhooks/telegram?token=${encodeURIComponent(botToken)}`;
    await setTelegramWebhook(botToken, webhookUrl);

    // Save connection (workspace-level)
    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("connections")
      .upsert(
        {
          platform: "telegram",
          platform_channel_id: chatId,
          channel_name: chatName || `Telegram @${bot.username}`,
          bot_token: botToken,
          metadata: { bot_id: bot.id, bot_username: bot.username },
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
