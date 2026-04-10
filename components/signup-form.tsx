"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export function SignupForm() {
  const searchParams = useSearchParams();
  const [inviteCode, setInviteCode] = useState(searchParams.get("code") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data: invitation, error: inviteErr } = await supabase
      .from("invitations")
      .select("*")
      .eq("code", inviteCode)
      .is("used_by", null)
      .single();

    if (inviteErr || !invitation) {
      setError("Invalid or expired invitation code");
      setLoading(false);
      return;
    }

    const { data, error: signupErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });

    if (signupErr) {
      setError(signupErr.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase
        .from("invitations")
        .update({ used_by: data.user.id })
        .eq("id", invitation.id);
    }

    router.push("/chat");
    router.refresh();
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            ERA<span className="text-accent">37</span>
          </h1>
          <p className="text-muted text-sm mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">Invitation Code</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground focus:outline-none focus:border-accent"
              placeholder="Enter your invite code"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground focus:outline-none focus:border-accent"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground focus:outline-none focus:border-accent"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground focus:outline-none focus:border-accent"
              minLength={6}
              required
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-accent text-black font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
