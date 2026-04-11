"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";
import { TelegramIcon, DiscordIcon, SlackIcon } from "./platform-icons";
import { Mail } from "lucide-react";

export function JoinForm() {
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("code") || "";
  const [code, setCode] = useState(inviteCode);
  const [step, setStep] = useState<"code" | "auth">(inviteCode ? "auth" : "code");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const supabase = createClient();
  const router = useRouter();

  async function validateCode() {
    if (!code.trim()) return;
    setError("");

    const { data } = await supabase
      .from("workspace")
      .select("invite_code, invite_enabled")
      .eq("invite_code", code.trim())
      .eq("invite_enabled", true)
      .single();

    if (!data) {
      setError("Invalid invite code");
      return;
    }

    setStep("auth");
  }

  async function signInWith(provider: "discord" | "google" | "slack_oidc") {
    setLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading("");
    }
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading("email");
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading("");
    } else {
      router.push("/chat");
      router.refresh();
    }
  }

  if (step === "code") {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4">
        <div className="max-w-sm w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">
              ERA<span className="text-accent">37</span>
            </h1>
            <p className="text-muted text-sm mt-1">Enter your invite code to join</p>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && validateCode()}
              placeholder="Invite code"
              className="w-full px-4 py-3 rounded-lg bg-surface border border-border text-foreground text-center text-lg tracking-wider focus:outline-none focus:border-accent"
              autoFocus
            />
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            <button
              onClick={validateCode}
              className="w-full py-3 rounded-lg bg-accent text-black font-semibold hover:bg-accent-hover transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            ERA<span className="text-accent">37</span>
          </h1>
          <p className="text-muted text-sm mt-1">Choose how to sign in</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => signInWith("discord")}
            disabled={!!loading}
            className="w-full py-3 px-4 rounded-lg bg-[#5865F2] text-white font-medium flex items-center justify-center gap-3 hover:bg-[#4752C4] transition-colors disabled:opacity-50"
          >
            <DiscordIcon className="w-5 h-5" />
            {loading === "discord" ? "Redirecting..." : "Continue with Discord"}
          </button>

          <button
            onClick={() => signInWith("google")}
            disabled={!!loading}
            className="w-full py-3 px-4 rounded-lg bg-white text-black font-medium flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading === "google" ? "Redirecting..." : "Continue with Google"}
          </button>

          <button
            onClick={() => signInWith("slack_oidc")}
            disabled={!!loading}
            className="w-full py-3 px-4 rounded-lg bg-[#4A154B] text-white font-medium flex items-center justify-center gap-3 hover:bg-[#3B1139] transition-colors disabled:opacity-50"
          >
            <SlackIcon className="w-5 h-5" />
            {loading === "slack_oidc" ? "Redirecting..." : "Continue with Slack"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted">or</span>
            </div>
          </div>

          {showEmail ? (
            <form onSubmit={signInWithEmail} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full px-4 py-3 rounded-lg bg-surface border border-border text-foreground text-sm focus:outline-none focus:border-accent"
                required
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 rounded-lg bg-surface border border-border text-foreground text-sm focus:outline-none focus:border-accent"
                required
              />
              <button
                type="submit"
                disabled={!!loading}
                className="w-full py-3 rounded-lg bg-accent text-black font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {loading === "email" ? "Signing in..." : "Sign In with Email"}
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowEmail(true)}
              className="w-full py-3 px-4 rounded-lg bg-surface border border-border text-foreground font-medium flex items-center justify-center gap-3 hover:bg-surface-hover transition-colors"
            >
              <Mail className="w-5 h-5" />
              Sign in with Email
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <p className="text-xs text-muted text-center">
          By signing in, you agree to our{" "}
          <a href="/tos" className="text-accent hover:underline">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}
