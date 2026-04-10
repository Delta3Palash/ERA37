"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { TelegramIcon, DiscordIcon, SlackIcon } from "./platform-icons";
import { SUPPORTED_LANGUAGES } from "@/lib/translate";
import { Copy, Check, Plus, Trash2, Link as LinkIcon } from "lucide-react";
import type { Profile, Connection, Platform } from "@/lib/types";

interface SettingsClientProps {
  profile: Profile | null;
  connections: Connection[];
  userId: string;
}

export function SettingsClient({ profile, connections, userId }: SettingsClientProps) {
  const [language, setLanguage] = useState(profile?.preferred_language || "en");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function saveLanguage(lang: string) {
    setLanguage(lang);
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ preferred_language: lang })
      .eq("id", userId);
    setSaving(false);
  }

  return (
    <div className="space-y-8">
      {/* Language */}
      <section className="bg-surface rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Preferred Language</h2>
        <p className="text-sm text-muted mb-3">
          Messages will be translated to this language when you click the translate button.
        </p>
        <select
          value={language}
          onChange={(e) => saveLanguage(e.target.value)}
          className="w-full max-w-xs px-3 py-2 rounded-lg bg-background border border-border text-foreground"
          disabled={saving}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </section>

      {/* Platform Connections */}
      <section className="bg-surface rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Connected Platforms</h2>

        <div className="space-y-4">
          <TelegramConnector
            connection={connections.find((c) => c.platform === "telegram")}
            userId={userId}
          />
          <DiscordConnector
            connection={connections.find((c) => c.platform === "discord")}
            userId={userId}
          />
          <SlackConnector
            connection={connections.find((c) => c.platform === "slack")}
            userId={userId}
          />
        </div>
      </section>

      {/* Invitations */}
      <InvitationSection />
    </div>
  );
}

function TelegramConnector({ connection, userId }: { connection?: Connection; userId: string }) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function connect() {
    if (!token.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/connections/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setToken("");
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
      <div className="platform-telegram mt-1">
        <TelegramIcon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h3 className="font-medium">Telegram</h3>
        {connection ? (
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-muted">
              Connected as @{connection.platform_username}
            </span>
            <button
              onClick={disconnect}
              className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Disconnect
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted">
              Create a bot via{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                className="text-accent hover:underline"
              >
                @BotFather
              </a>{" "}
              and paste the token below.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456:ABC-DEF1234..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <button
                onClick={connect}
                disabled={loading || !token.trim()}
                className="px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
              >
                {loading ? "..." : "Connect"}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function DiscordConnector({ connection, userId }: { connection?: Connection; userId: string }) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function connect() {
    if (!token.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/connections/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setToken("");
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
      <div className="platform-discord mt-1">
        <DiscordIcon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h3 className="font-medium">Discord</h3>
        {connection ? (
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-muted">
              Connected as {connection.platform_username}
            </span>
            <button
              onClick={disconnect}
              className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Disconnect
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted">
              Create a Discord bot in the{" "}
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                className="text-accent hover:underline"
              >
                Developer Portal
              </a>
              , enable Message Content Intent, and paste the bot token.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Discord bot token..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <button
                onClick={connect}
                disabled={loading || !token.trim()}
                className="px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
              >
                {loading ? "..." : "Connect"}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SlackConnector({ connection, userId }: { connection?: Connection; userId: string }) {
  const [loading, setLoading] = useState(false);
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
      <div className="platform-slack mt-1">
        <SlackIcon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h3 className="font-medium">Slack</h3>
        {connection ? (
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-muted">
              Connected to {connection.platform_username}
            </span>
            <button
              onClick={disconnect}
              className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Disconnect
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted">
              Connect your Slack workspace to receive and send messages.
            </p>
            <button
              onClick={connectSlack}
              className="px-3 py-1.5 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent-hover"
            >
              Add to Slack
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InvitationSection() {
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function generateInvite() {
    setLoading(true);
    try {
      const res = await fetch("/api/invitations", { method: "POST" });
      const data = await res.json();
      setInviteLink(data.inviteLink);
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="bg-surface rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold mb-4">Invite People</h2>
      <p className="text-sm text-muted mb-3">
        Generate an invitation link to let others join ERA37.
      </p>

      {inviteLink ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inviteLink}
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
      ) : (
        <button
          onClick={generateInvite}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-accent text-black font-medium text-sm hover:bg-accent-hover disabled:opacity-50 flex items-center gap-2"
        >
          <LinkIcon className="w-4 h-4" />
          {loading ? "Generating..." : "Generate Invite Link"}
        </button>
      )}
    </section>
  );
}
