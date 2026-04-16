import { createServiceClient } from "@/lib/supabase/server";
import { verifyWhatsAppSignature, getWhatsAppMediaUrl } from "@/lib/whatsapp";
import { bridgeMessage } from "@/lib/bridge";
import { NextRequest, NextResponse } from "next/server";

// Webhook verification (Meta sends GET to verify endpoint)
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge) {
    const supabase = createServiceClient();
    const { data: connections } = await supabase
      .from("connections")
      .select("metadata")
      .eq("platform", "whatsapp");

    const valid = connections?.some(
      (c: any) => c.metadata?.verify_token === token
    );

    if (valid) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  return new Response("Forbidden", { status: 403 });
}

// Incoming messages from WhatsApp
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Validate signature if app secret is configured
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = req.headers.get("x-hub-signature-256") || "";
    if (!verifyWhatsAppSignature(appSecret, rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const body = JSON.parse(rawBody);

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;
      const value = change.value;

      if (!value.messages) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      const contacts = value.contacts || [];

      for (const msg of value.messages) {
        await handleIncomingMessage(phoneNumberId, msg, contacts);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleIncomingMessage(
  phoneNumberId: string,
  msg: any,
  contacts: any[]
) {
  const supabase = createServiceClient();

  try {
    // Find connection by phone_number_id in metadata
    const { data: connection } = await supabase
      .from("connections")
      .select("*")
      .eq("platform", "whatsapp")
      .filter("metadata->>phone_number_id", "eq", phoneNumberId)
      .single();

    if (!connection) return;

    // Extract sender info
    const contact = contacts.find((c: any) => c.wa_id === msg.from);
    const senderName = contact?.profile?.name || msg.from;

    // Extract content based on message type
    let content: string | null = null;
    let imageUrl: string | null = null;
    let messageType = "text";

    switch (msg.type) {
      case "text":
        content = msg.text?.body || null;
        break;
      case "image":
        messageType = "image";
        content = msg.image?.caption || null;
        if (msg.image?.id) {
          imageUrl = await getWhatsAppMediaUrl(
            msg.image.id,
            connection.bot_token!
          );
        }
        break;
      default:
        // Unsupported message type — skip
        return;
    }

    if (!content && !imageUrl) return;

    // Resolve reply reference
    let replyToId: string | null = null;
    if (msg.context?.id) {
      const { data: parent } = await supabase
        .from("messages")
        .select("id")
        .eq("platform_message_id", msg.context.id)
        .eq("connection_id", connection.id)
        .single();
      if (parent) replyToId = parent.id;
    }

    // supabase-js `.insert()` resolves with `{ error }` rather than throwing,
    // so we must destructure to surface DB errors. Log and continue.
    const { error: insertError } = await supabase.from("messages").insert({
      connection_id: connection.id,
      platform: "whatsapp",
      platform_message_id: msg.id,
      platform_channel_id: msg.from,
      sender_name: senderName,
      content,
      image_url: imageUrl,
      direction: "incoming",
      message_type: messageType,
      reply_to_message_id: replyToId,
    });
    if (insertError) {
      console.error("[messages.insert] whatsapp incoming failed:", {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        connection_id: connection.id,
        platform_message_id: msg.id,
      });
    }

    // Bridge to other platforms (separate try-catch)
    try {
      await bridgeMessage(connection, senderName, content, imageUrl, msg.id);
    } catch (bridgeErr) {
      console.error("WhatsApp bridge error:", bridgeErr);
    }
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
  }
}
