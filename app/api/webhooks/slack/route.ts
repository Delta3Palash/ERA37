import { createServiceClient } from "@/lib/supabase/server";
import { verifySlackSignature } from "@/lib/slack";
import { bridgeMessage } from "@/lib/bridge";
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

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      return NextResponse.json({ error: "Request too old" }, { status: 400 });
    }

    if (!verifySlackSignature(signingSecret, timestamp, body, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  if (parsed.type === "event_callback") {
    const event = parsed.event;

    if (event.type === "message" && !event.bot_id && !event.subtype) {
      await handleSlackMessage(parsed.team_id, event);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleSlackMessage(teamId: string, event: any) {
  const supabase = createServiceClient();

  try {
    // Find connection for this team + channel
    const { data: connection } = await supabase
      .from("connections")
      .select("*")
      .eq("platform", "slack")
      .eq("platform_channel_id", event.channel)
      .filter("metadata->>team_id", "eq", teamId)
      .single();

    if (!connection) return; // Not a tracked channel

    // Get sender name
    let senderName = event.user || "Unknown";
    let senderAvatar: string | null = null;
    try {
      const userRes = await fetch(`https://slack.com/api/users.info?user=${event.user}`, {
        headers: { Authorization: `Bearer ${connection.bot_token}` },
      });
      const userData = await userRes.json();
      if (userData.ok) {
        senderName = userData.user.real_name || userData.user.name;
        senderAvatar = userData.user.profile?.image_48 || null;
      }
    } catch {}

    // Check for images in files
    let imageUrl: string | null = null;
    if (event.files && event.files.length > 0) {
      const imageFile = event.files.find((f: any) => f.mimetype?.startsWith("image/"));
      if (imageFile) {
        imageUrl = imageFile.url_private;
      }
    }

    const hasContent = !!event.text || !!imageUrl;
    if (!hasContent) return;

    await supabase.from("messages").insert({
      connection_id: connection.id,
      platform: "slack",
      platform_message_id: event.ts,
      platform_channel_id: event.channel,
      sender_name: senderName,
      sender_avatar: senderAvatar,
      content: event.text || null,
      image_url: imageUrl,
      direction: "incoming",
      message_type: imageUrl ? "image" : "text",
    });

    // Bridge to other platforms (separate try-catch)
    try {
      await bridgeMessage(connection, senderName, event.text || null, imageUrl, event.ts);
    } catch (bridgeErr) {
      console.error("Slack bridge error:", bridgeErr);
    }
  } catch (err) {
    console.error("Slack message handler error:", err);
  }
}
