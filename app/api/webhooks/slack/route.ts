import { createServiceClient } from "@/lib/supabase/server";
import { verifySlackSignature } from "@/lib/slack";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const parsed = JSON.parse(body);

  // Slack URL verification challenge
  if (parsed.type === "url_verification") {
    return NextResponse.json({ challenge: parsed.challenge });
  }

  // Verify signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (signingSecret) {
    const timestamp = req.headers.get("x-slack-request-timestamp") || "";
    const signature = req.headers.get("x-slack-signature") || "";

    // Reject requests older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      return NextResponse.json({ error: "Request too old" }, { status: 400 });
    }

    if (!verifySlackSignature(signingSecret, timestamp, body, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // Handle events
  if (parsed.type === "event_callback") {
    const event = parsed.event;

    // Only handle message events (not bot messages)
    if (event.type === "message" && !event.bot_id && !event.subtype && event.text) {
      await handleSlackMessage(parsed.team_id, event);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleSlackMessage(teamId: string, event: any) {
  const supabase = createServiceClient();

  try {
    // Find connection by team_id in metadata
    const { data: connections } = await supabase
      .from("connections")
      .select("*")
      .eq("platform", "slack")
      .filter("metadata->>team_id", "eq", teamId);

    if (!connections || connections.length === 0) {
      console.error("No Slack connection found for team:", teamId);
      return;
    }

    // Process for each connected user
    for (const connection of connections) {
      const channelId = event.channel;
      const chatName = `#${event.channel_name || channelId}`;

      // Upsert chat
      const { data: chat } = await supabase
        .from("chats")
        .upsert(
          {
            user_id: connection.user_id,
            connection_id: connection.id,
            platform: "slack",
            platform_chat_id: channelId,
            chat_name: chatName,
            last_message_at: new Date().toISOString(),
          },
          { onConflict: "connection_id,platform_chat_id" }
        )
        .select()
        .single();

      if (!chat) continue;

      // Update unread
      await supabase
        .from("chats")
        .update({
          unread_count: (chat.unread_count || 0) + 1,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", chat.id);

      // Get sender name from user ID
      let senderName = event.user || "Unknown";
      try {
        const userRes = await fetch(`https://slack.com/api/users.info?user=${event.user}`, {
          headers: { Authorization: `Bearer ${connection.bot_token}` },
        });
        const userData = await userRes.json();
        if (userData.ok) {
          senderName = userData.user.real_name || userData.user.name;
        }
      } catch {}

      // Insert message
      await supabase.from("messages").insert({
        user_id: connection.user_id,
        connection_id: connection.id,
        chat_id: chat.id,
        platform: "slack",
        platform_message_id: event.ts,
        platform_chat_id: channelId,
        chat_name: chatName,
        sender_name: senderName,
        content: event.text,
        direction: "incoming",
      });
    }
  } catch (err) {
    console.error("Slack message handler error:", err);
  }
}
