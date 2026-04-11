export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Zap, Globe } from "lucide-react";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/chat");

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">
            ERA<span className="text-accent">37</span>
          </h1>
          <p className="text-muted text-lg">
            All your chats. One place.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 py-6">
          <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface border border-border">
            <MessageSquare className="w-6 h-6 text-accent" />
            <span className="text-sm text-muted">Unified</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface border border-border">
            <Zap className="w-6 h-6 text-accent" />
            <span className="text-sm text-muted">Real-time</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface border border-border">
            <Globe className="w-6 h-6 text-accent" />
            <span className="text-sm text-muted">Translate</span>
          </div>
        </div>

        <div className="flex gap-2 items-center justify-center text-sm text-muted">
          <span className="w-2 h-2 rounded-full platform-telegram bg-current" />
          <span>Telegram</span>
          <span className="w-2 h-2 rounded-full platform-discord bg-current" />
          <span>Discord</span>
          <span className="w-2 h-2 rounded-full platform-slack bg-current" />
          <span>Slack</span>
          <span className="w-2 h-2 rounded-full platform-whatsapp bg-current" />
          <span>WhatsApp</span>
        </div>

        <div className="space-y-3 pt-4">
          <Link
            href="/join"
            className="block w-full py-3 px-4 rounded-lg bg-accent text-black font-semibold text-center hover:bg-accent-hover transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/join?mode=login"
            className="block w-full py-3 px-4 rounded-lg bg-surface border border-border text-foreground font-medium text-center hover:bg-surface-hover transition-colors"
          >
            Sign In
          </Link>
          <p className="text-xs text-muted text-center">
            New? Get an invite link from your team
          </p>
        </div>
      </div>
    </div>
  );
}
