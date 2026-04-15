import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * One-shot diagnostic for Telegram connections. Verifies every link in the
 * chain: stored token validity, webhook URL registration, and whether the
 * token in the registered URL matches what we have in Supabase. Admin-only.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin)
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const svc = createServiceClient();
  const { data: connections } = await svc
    .from("connections")
    .select("id, channel_name, platform_channel_id, bot_token, metadata")
    .eq("platform", "telegram");

  if (!connections?.length) {
    return NextResponse.json({ error: "No Telegram connections found" }, { status: 404 });
  }

  const reports = await Promise.all(
    (connections as any[]).map(async (conn) => {
      const report: any = {
        connection_id: conn.id,
        channel_name: conn.channel_name,
        platform_channel_id: conn.platform_channel_id,
        stored_token_length: conn.bot_token?.length ?? null,
        stored_token_prefix: conn.bot_token?.slice(0, 12) ?? null,
        stored_token_suffix: conn.bot_token?.slice(-6) ?? null,
        has_trailing_whitespace: conn.bot_token !== conn.bot_token?.trim(),
      };

      // Step 1 — can we call getMe with the stored token?
      try {
        const res = await fetch(`https://api.telegram.org/bot${conn.bot_token}/getMe`);
        const data = await res.json();
        report.getMe = {
          ok: data.ok === true,
          status: res.status,
          bot_username: data.result?.username || null,
          bot_id: data.result?.id || null,
          error: data.description || null,
        };
      } catch (e: any) {
        report.getMe = { ok: false, error: e.message };
      }

      // Step 2 — read what Telegram has registered as the webhook URL
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${conn.bot_token}/getWebhookInfo`
        );
        const data = await res.json();
        const info = data.result;
        report.webhookInfo = {
          ok: data.ok === true,
          url: info?.url || null,
          pending_update_count: info?.pending_update_count ?? null,
          last_error_date: info?.last_error_date ?? null,
          last_error_message: info?.last_error_message ?? null,
          ip_address: info?.ip_address ?? null,
          max_connections: info?.max_connections ?? null,
        };

        // Step 3 — does the token embedded in the registered URL match
        // what's in Supabase? This is the #1 way this silently breaks.
        if (info?.url) {
          const match = info.url.match(/[?&]token=([^&]+)/);
          const urlToken = match ? decodeURIComponent(match[1]) : null;
          report.url_token_match = {
            supabase_equals_url: urlToken === conn.bot_token,
            supabase_length: conn.bot_token?.length ?? 0,
            url_length: urlToken?.length ?? 0,
            url_prefix: urlToken?.slice(0, 12) ?? null,
            url_suffix: urlToken?.slice(-6) ?? null,
          };
        }
      } catch (e: any) {
        report.webhookInfo = { ok: false, error: e.message };
      }

      // Step 4 — try to resolve the chat with getChat. This catches "bot
      // was kicked" and "bot not a member" errors immediately.
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${conn.bot_token}/getChat?chat_id=${encodeURIComponent(
            conn.platform_channel_id
          )}`
        );
        const data = await res.json();
        report.getChat = {
          ok: data.ok === true,
          status: res.status,
          title: data.result?.title || null,
          type: data.result?.type || null,
          error: data.description || null,
        };
      } catch (e: any) {
        report.getChat = { ok: false, error: e.message };
      }

      // Step 5 — if we got a bot_id, confirm the bot is a member of the
      // chat (this catches the bot having been removed from the group).
      if (report.getMe?.bot_id) {
        try {
          const res = await fetch(
            `https://api.telegram.org/bot${conn.bot_token}/getChatMember?chat_id=${encodeURIComponent(
              conn.platform_channel_id
            )}&user_id=${report.getMe.bot_id}`
          );
          const data = await res.json();
          report.getChatMember = {
            ok: data.ok === true,
            status: res.status,
            bot_status: data.result?.status || null,
            can_post_messages: data.result?.can_post_messages ?? null,
            error: data.description || null,
          };
        } catch (e: any) {
          report.getChatMember = { ok: false, error: e.message };
        }
      }

      return report;
    })
  );

  // Also check workspace bridge flag in case that's the "bridge broken" part
  const { data: workspace } = await svc
    .from("workspace")
    .select("bridge_enabled")
    .single();

  return NextResponse.json({
    workspace: { bridge_enabled: workspace?.bridge_enabled ?? null },
    connections: reports,
  });
}
