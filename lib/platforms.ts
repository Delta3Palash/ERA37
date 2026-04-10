import { sendTelegramMessage } from "./telegram";
import { sendDiscordMessage } from "./discord";
import { sendSlackMessage } from "./slack";
import type { Platform, Connection } from "./types";

export async function sendMessage(
  connection: Connection,
  channelId: string,
  content: string
): Promise<{ platform_message_id: string }> {
  switch (connection.platform) {
    case "telegram": {
      const result = await sendTelegramMessage(connection.bot_token!, channelId, content);
      return { platform_message_id: String(result.result.message_id) };
    }
    case "discord": {
      const result = await sendDiscordMessage(connection.bot_token!, channelId, content);
      return { platform_message_id: result.id };
    }
    case "slack": {
      const result = await sendSlackMessage(connection.bot_token!, channelId, content);
      return { platform_message_id: result.ts };
    }
    default:
      throw new Error(`Platform ${connection.platform} not supported yet`);
  }
}

export function getPlatformName(platform: Platform): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}
