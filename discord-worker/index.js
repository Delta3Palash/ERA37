import { Client, GatewayIntentBits } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_WEBHOOK_URL = process.env.APP_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const activeBots = new Map(); // connectionId -> { client, channelId }

async function start() {
  const { data: connections, error } = await supabase
    .from("connections")
    .select("*")
    .eq("platform", "discord");

  if (error) {
    console.error("Failed to load connections:", error);
    process.exit(1);
  }

  if (!connections || connections.length === 0) {
    console.log("No Discord connections found. Polling every 30s...");
    setTimeout(start, 30000);
    return;
  }

  console.log(`Found ${connections.length} Discord connection(s)`);
  for (const connection of connections) {
    startBot(connection);
  }

  // Poll for new/changed connections every 60s
  setInterval(async () => {
    const { data: newConnections } = await supabase
      .from("connections")
      .select("*")
      .eq("platform", "discord");

    if (newConnections) {
      for (const conn of newConnections) {
        if (!activeBots.has(conn.id)) {
          console.log(`New Discord connection: ${conn.id}`);
          startBot(conn);
        }
      }
    }
  }, 60000);
}

function startBot(connection) {
  if (activeBots.has(connection.id)) return;

  const targetChannelId = connection.platform_channel_id;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on("ready", () => {
    console.log(`Bot ${client.user.tag} watching channel ${targetChannelId}`);
  });

  client.on("messageCreate", async (message) => {
    // Only process messages from the target channel
    if (message.channel.id !== targetChannelId) return;
    if (message.author.bot) return;

    // Get first image attachment if any
    let imageUrl = null;
    const imageAttachment = message.attachments.find(
      (a) => a.contentType?.startsWith("image/")
    );
    if (imageAttachment) {
      imageUrl = imageAttachment.url;
    }

    if (!message.content && !imageUrl) return;

    const payload = {
      connectionId: connection.id,
      channelId: message.channel.id,
      senderName: message.author.displayName || message.author.username,
      senderAvatar: message.author.displayAvatarURL({ size: 64 }),
      content: message.content || null,
      imageUrl,
      messageId: message.id,
    };

    try {
      if (APP_WEBHOOK_URL) {
        await fetch(APP_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${WEBHOOK_SECRET}`,
          },
          body: JSON.stringify(payload),
        });
      } else {
        // Write directly to Supabase
        await supabase.from("messages").insert({
          connection_id: connection.id,
          platform: "discord",
          platform_message_id: payload.messageId,
          platform_channel_id: payload.channelId,
          sender_name: payload.senderName,
          sender_avatar: payload.senderAvatar,
          content: payload.content,
          image_url: payload.imageUrl,
          direction: "incoming",
          message_type: payload.imageUrl ? "image" : "text",
        });
      }
    } catch (err) {
      console.error("Error forwarding message:", err.message);
    }
  });

  client.on("error", (err) => {
    console.error(`Bot ${connection.id} error:`, err.message);
  });

  client.login(connection.bot_token).catch((err) => {
    console.error(`Failed to login bot ${connection.id}:`, err.message);
  });

  activeBots.set(connection.id, { client, channelId: targetChannelId });
}

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  for (const [, { client }] of activeBots) {
    client.destroy();
  }
  process.exit(0);
});

start();
