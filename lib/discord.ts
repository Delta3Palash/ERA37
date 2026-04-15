const DISCORD_API = "https://discord.com/api/v10";

/**
 * Send a Discord message. When `imageUrl` is set, we attach it as an embed
 * (`embeds[0].image.url`) so Discord renders the image without the raw URL
 * appearing as text. Required for Klipy GIFs and any image-only message —
 * the previous approach of splicing the URL into the content field left the
 * `https://static.klipy.com/...` string visible above the embed.
 */
export async function sendDiscordMessage(
  botToken: string,
  channelId: string,
  content: string,
  replyToMessageId?: string | null,
  imageUrl?: string | null
) {
  const body: any = { content };
  if (imageUrl) {
    // Discord renders `embeds[].image.url` as an inline image for still
    // images, and `embeds[].video.url` would be needed for mp4. We use
    // `image` which works for gif/png/jpg and falls back gracefully for
    // video URLs (Discord auto-detects). Animated GIFs render inline.
    body.embeds = [{ image: { url: imageUrl } }];
  }
  if (replyToMessageId) {
    body.message_reference = { message_id: replyToMessageId };
  }
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord API error: ${err}`);
  }
  return res.json();
}

export function getDiscordOAuthUrl(clientId: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "bot",
    permissions: "68608", // Read messages + Send messages + Read message history
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}
