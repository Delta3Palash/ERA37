"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { TelegramIcon, DiscordIcon, SlackIcon } from "./platform-icons";
import { SUPPORTED_LANGUAGES } from "@/lib/translate";
import { Copy, Check, Trash2, Link as LinkIcon } from "lucide-react";
import type { Profile, Connection, Workspace } from "@/lib/types";

interface AdminSettingsProps {
  profile: Profile;
  connections: Connection[];
  workspace: Workspace | null;
  userId: string;
}

export function AdminSettings({ profile, connections, workspace, userId }: AdminSettingsProps) {
  const [language, setLanguage] = useState(profile.preferred_language);
  const supabase = createClient();
  const router = useRouter();

  async function saveLanguage(lang: string) {
    setLanguage(lang);
    await supabase.from("profiles").update({ preferred_language: lang }).eq("id", userId);
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
        </div>
      </section>
    </div>
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
