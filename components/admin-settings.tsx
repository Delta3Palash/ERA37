"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { TelegramIcon, DiscordIcon, SlackIcon, WhatsAppIcon } from "./platform-icons";
import { SUPPORTED_LANGUAGES } from "@/lib/translate";
import { Copy, Check, Trash2, Link as LinkIcon, ArrowRightLeft, AlertTriangle } from "lucide-react";
import type { Profile, Connection, Workspace } from "@/lib/types";

interface AdminSettingsProps {
  profile: Profile;
  connections: Connection[];
  workspace: Workspace | null;
  userId: string;
}

export function AdminSettings({ profile, connections, workspace, userId }: AdminSettingsProps) {
  const [language, setLanguage] = useState(profile.preferred_language);
  const [bridgeEnabled, setBridgeEnabled] = useState(workspace?.bridge_enabled ?? false);
  const supabase = createClient();
  const router = useRouter();

  async function saveLanguage(lang: string) {
    setLanguage(lang);
    await supabase.from("profiles").update({ preferred_language: lang }).eq("id", userId);
  }

  async function saveBridgeEnabled(enabled: boolean) {
    setBridgeEnabled(enabled);
    if (workspace) {
      await supabase.from("workspace").update({ bridge_enabled: enabled }).eq("id", workspace.id);
    }
  }

  const inviteUrl = workspace
    ? `${window.location.origin}/join?code=${workspace.invite_code}`
    : "";

  return (
    <div className="space-y-8">
      {/* Invite Link */}
      <InviteLinkSection inviteUrl={inviteUrl} inviteCode={workspace?.invite_code || ""} />

      {/* Language */}
      <section className="bg-surface rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Your Language</h2>
        <select
          value={language}
          onChange={(e) => saveLanguage(e.target.value)}
          className="w-full max-w-xs px-3 py-2 rounded-lg bg-background border border-border text-foreground"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>
      </section>

      {/* Message Bridging */}
      <section className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-start gap-3">
          <ArrowRightLeft className="w-5 h-5 text-accent mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-1">Message Bridging</h2>
            <p className="text-sm text-muted mb-3">
              When enabled, messages received on one platform are automatically forwarded to all other connected platforms.
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={bridgeEnabled}
                  onChange={(e) => saveBridgeEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-border rounded-full peer peer-checked:bg-accent transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-foreground rounded-full transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm">Bridge messages across platforms</span>
            </label>
          </div>
        </div>
      </section>

      {/* Platform Channels */}
      <section className="bg-surface rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-2">Connected Channels</h2>
        <p className="text-sm text-muted mb-4">
          One channel per platform. All workspace users will see messages from these channels.
        </p>

        <div className="space-y-4">
          <TelegramChannelSetup
            connection={connections.find((c) => c.platform === "telegram")}
          />
          <DiscordChannelSetup
            connection={connections.find((c) => c.platform === "discord")}
          />
          <SlackChannelSetup
            connection={connections.find((c) => c.platform === "slack")}
          />
          <WhatsAppChannelSetup
            connection={connections.find((c) => c.platform === "whatsapp")}
          />
        </div>
      </section>

      {/* Danger Zone */}
      <ClearMessagesSection />
    </div>
  );
}

function ClearMessagesSection() {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const router = useRouter();

  async function clearAll() {
    setClearing(true);
    try {
      const res = await fetch("/api/messages/clear", { method: "DELETE" });
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      }
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="bg-surface rounded-xl border border-red-900/50 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold mb-1">Danger Zone</h2>
          <p className="text-sm text-muted mb-3">
            Clear all messages from the app. This only removes messages from ERA37 — it does not delete anything from Discord, Slack, Telegram, or WhatsApp.
          </p>
          {confirming ? (
            <div className="flex items-center gap-2">
              <button
                onClick={clearAll}
                disabled={clearing}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50"
              >
                {clearing ? "Clearing..." : "Yes, clear all messages"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-muted hover:bg-surface-hover"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-900/50 text-red-400 text-sm font-medium hover:bg-red-900/50"
            >
              Clear all messages
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function InviteLinkSection({ inviteUrl, inviteCode }: { inviteUrl: string; inviteCode: string }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="bg-surface rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold mb-2">Invite Link</h2>
      <p className="text-sm text-muted mb-3">
        Share this link to let people join your workspace.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={inviteUrl}
          readOnly
          className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
        />
        <button
          onClick={copyLink}
          className="p-2 rounded-lg bg-accent text-black hover:bg-accent-hover"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-muted mt-2">Code: <code className="text-accent">{inviteCode}</code></p>
    </section>
  );
}

function TelegramChannelSetup({ connection }: { connection?: Connection }) {
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [chatName, setChatName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function connect() {
    if (!token.trim() || !chatId.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/connections/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: token,
          chatId: chatId.trim(),
          chatName: chatName.trim() || `Telegram ${chatId}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToken("");
      setChatId("");
      setChatName("");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!connection) return;
    await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-background border border-border">
      <div className="platform-telegram mt-1"><TelegramIcon className="w-6 h-6" /></div>
      <div className="flex-1">
        <h3 className="font-medium">Telegram</h3>
        {connection ? (
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-muted">{connection.channel_name}</span>
            <button onClick={disconnect} className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted">
              Create a bot via <a href="https://t.me/BotFather" target="_blank" className="text-accent hover:underline">@BotFather</a>,
              add it to your group, then enter the bot token and chat ID.
            </p>
            <input type="text" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="Bot token (123456:ABC...)" className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
            <div className="flex gap-2">
              <input type="text" value={chatId} onChange={(e) => setChatId(e.target.value)}
                placeholder="Chat ID (-100...)" className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
              <input type="text" value={chatName} onChange={(e) => setChatName(e.target.value)}
                placeholder="Channel name" className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
            </div>
            <button onClick={connect} disabled={loading || !token.trim() || !chatId.trim()}
              className="px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
              {loading ? "..." : "Connect"}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function DiscordChannelSetup({ connection }: { connection?: Connection }) {
  const [token, setToken] = useState("");
  const [channelId, setChannelId] = useState("");
  const [channelName, setChannelName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function connect() {
    if (!token.trim() || !channelId.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/connections/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: token,
          channelId: channelId.trim(),
          channelName: channelName.trim() || `Discord #${channelId}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToken("");
      setChannelId("");
      setChannelName("");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!connection) return;
    await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-background border border-border">
      <div className="platform-discord mt-1"><DiscordIcon className="w-6 h-6" /></div>
      <div className="flex-1">
        <h3 className="font-medium">Discord</h3>
        {connection ? (
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-muted">{connection.channel_name}</span>
            <button onClick={disconnect} className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted">
              Create a bot in the <a href="https://discord.com/developers/applications" target="_blank" className="text-accent hover:underline">Developer Portal</a>,
              enable Message Content Intent, add bot to server, then enter token and channel ID.
            </p>
            <input type="text" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="Bot token" className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
            <div className="flex gap-2">
              <input type="text" value={channelId} onChange={(e) => setChannelId(e.target.value)}
                placeholder="Channel ID" className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
              <input type="text" value={channelName} onChange={(e) => setChannelName(e.target.value)}
                placeholder="Channel name" className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
            </div>
            <button onClick={connect} disabled={loading || !token.trim() || !channelId.trim()}
              className="px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
              {loading ? "..." : "Connect"}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SlackChannelSetup({ connection }: { connection?: Connection }) {
  const router = useRouter();

  async function disconnect() {
    if (!connection) return;
    await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
    router.refresh();
  }

  function connectSlack() {
    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID;
    if (!clientId) {
      alert("Slack Client ID not configured");
      return;
    }
    const redirectUri = `${window.location.origin}/api/connections/slack/callback`;
    const scope = "channels:history,channels:read,chat:write,users:read";
    window.location.href = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-background border border-border">
      <div className="platform-slack mt-1"><SlackIcon className="w-6 h-6" /></div>
      <div className="flex-1">
        <h3 className="font-medium">Slack</h3>
        {connection ? (
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-muted">{connection.channel_name}</span>
            <button onClick={disconnect} className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted">
              Connect your Slack workspace. After connecting, specify which channel to monitor.
            </p>
            <button onClick={connectSlack}
              className="px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover">
              Add to Slack
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WhatsAppChannelSetup({ connection }: { connection?: Connection }) {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [channelName, setChannelName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function connect() {
    if (!phoneNumberId.trim() || !accessToken.trim() || !verifyToken.trim() || !recipientPhone.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/connections/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: phoneNumberId.trim(),
          accessToken: accessToken.trim(),
          verifyToken: verifyToken.trim(),
          recipientPhone: recipientPhone.trim(),
          channelName: channelName.trim() || `WhatsApp ${recipientPhone}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhoneNumberId("");
      setAccessToken("");
      setVerifyToken("");
      setRecipientPhone("");
      setChannelName("");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!connection) return;
    await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-background border border-border">
      <div className="platform-whatsapp mt-1"><WhatsAppIcon className="w-6 h-6" /></div>
      <div className="flex-1">
        <h3 className="font-medium">WhatsApp</h3>
        {connection ? (
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-muted">{connection.channel_name}</span>
            <button onClick={disconnect} className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted">
              Create a Meta Business app at{" "}
              <a href="https://developers.facebook.com" target="_blank" className="text-accent hover:underline">developers.facebook.com</a>,
              enable WhatsApp product, complete business verification, and get a test phone number.
            </p>
            <input type="text" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="Phone Number ID" className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
            <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Permanent Access Token" className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
            <div className="flex gap-2">
              <input type="text" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="Webhook Verify Token" className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
              <input type="text" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="Recipient phone (e.g. 1234567890)" className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
            </div>
            <input type="text" value={channelName} onChange={(e) => setChannelName(e.target.value)}
              placeholder="Channel name (optional)" className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent" />
            <button onClick={connect} disabled={loading || !phoneNumberId.trim() || !accessToken.trim() || !verifyToken.trim() || !recipientPhone.trim()}
              className="px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
              {loading ? "..." : "Connect"}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
