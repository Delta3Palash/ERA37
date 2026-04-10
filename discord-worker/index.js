import { Client, GatewayIntentBits } from "discord.js";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APP_WEBHOOK_URL = process.env.APP_WEBHOOK_URL; // e.g., https://era37.vercel.app/api/webhooks/discord
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Load all Discord connections and create a client for each
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

  // Poll for new connections every 60s
  setInterval(async () => {
    const { data: newConnections } = await supabase
      .from("connections")
      .select("*")
      .eq("platform", "discord");

    if (newConnections) {
      for (const conn of newConnections) {
        if (!activeBots.has(conn.id)) {
          console.log(`New Discord connection found: ${conn.id}`);
          startBot(conn);
        }
      }
    }
  }, 60000);
}

const activeBots = new Map();

function startBot(connection) {
  if (activeBots.has(connection.id)) return;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on("ready", () => {
    console.log(`Discord bot logged in as ${client.user.tag} for connection ${connection.id}`);
  });

  client.on("messageCreate", async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    const payload = {
      userId: connection.user_id,
      connectionId: connection.id,
      channelId: message.channel.id,
      channelName: message.channel.name || "DM",
      guildName: message.guild?.name || null,
      senderName: message.author.displayName || message.author.username,
      content: message.content,
      messageId: message.id,
    };

    try {
      if (APP_WEBHOOK_URL) {
        // Push to Vercel webhook
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
        const chatName = payload.guildName
          ? `${payload.guildName} / #${payload.channelName}`
          : `#${payload.channelName}`;

        const { data: chat } = await supabase
          .from("chats")
          .upsert(
            {
              user_id: connection.user_id,
              connection_id: connection.id,
              platform: "discord",
              platform_chat_id: payload.channelId,
              chat_name: chatName,
              last_message_at: new Date().toISOString(),
            },
            { onConflict: "connection_id,platform_chat_id" }
          )
          .select()
          .single();

        if (chat) {
          await supabase
            .from("chats")
            .update({
              unread_count: (chat.unread_count || 0) + 1,
              last_message_at: new Date().toISOString(),
            })
            .eq("id", chat.id);

          await supabase.from("messages").insert({
            user_id: connection.user_id,
            connection_id: connection.id,
            chat_id: chat.id,
            platform: "discord",
            platform_message_id: payload.messageId,
            platform_chat_id: payload.channelId,
            chat_name: chatName,
            sender_name: payload.senderName,
            content: payload.content,
            direction: "incoming",
          });
        }
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

  activeBots.set(connection.id, client);
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  for (const [id, client] of activeBots) {
    client.destroy();
  }
  process.exit(0);
});

start();
