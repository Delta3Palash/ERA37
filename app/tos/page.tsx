export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TosAcceptButton } from "@/components/tos-accept-button";

export default async function TosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // If already accepted, go to chat
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tos_accepted_at")
      .eq("id", user.id)
      .single();

    if (profile?.tos_accepted_at) redirect("/chat");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            ERA<span className="text-accent">37</span> Terms of Service
          </h1>
          <p className="text-muted text-sm mt-2">
            Please read and accept before continuing
          </p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-6 max-h-[60vh] overflow-y-auto space-y-4 text-sm text-foreground/80">
          <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p>
            By accessing and using ERA37 ("the Service"), you agree to be bound by these
            Terms of Service. If you do not agree, do not use the Service.
          </p>

          <h2 className="text-lg font-semibold text-foreground">2. Description of Service</h2>
          <p>
            ERA37 is a unified messaging platform that aggregates conversations from
            Telegram, Discord, and Slack into a single interface with translation capabilities.
          </p>

          <h2 className="text-lg font-semibold text-foreground">3. Acceptable Use</h2>
          <p>You agree NOT to use this Service to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Harass, abuse, threaten, or intimidate other users</li>
            <li>Send spam, unsolicited messages, or bulk communications</li>
            <li>Distribute malware, phishing links, or malicious content</li>
            <li>Share illegal content including but not limited to child exploitation material, pirated content, or controlled substances</li>
            <li>Impersonate others or misrepresent your identity</li>
            <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
            <li>Scrape, data mine, or extract data from the Service</li>
            <li>Use the Service for any activity that violates applicable laws or regulations</li>
            <li>Engage in hate speech, discrimination, or incitement of violence</li>
            <li>Share private or confidential information of others without consent</li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">4. User Content</h2>
          <p>
            Messages sent through ERA37 are relayed to and from third-party platforms
            (Telegram, Discord, Slack). You are responsible for the content you send.
            The Service does not claim ownership of your messages but may store them
            for functionality purposes including translation caching.
          </p>

          <h2 className="text-lg font-semibold text-foreground">5. Privacy</h2>
          <p>
            The Service stores message content, sender names, and translated text to
            provide its functionality. Bot tokens provided for platform connections are
            stored securely. We do not sell your data to third parties. Translation
            requests are sent to Google Cloud Translation API.
          </p>

          <h2 className="text-lg font-semibold text-foreground">6. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your access to the Service
            at any time, without notice, for any violation of these Terms. You may
            stop using the Service at any time.
          </p>

          <h2 className="text-lg font-semibold text-foreground">7. Disclaimer</h2>
          <p>
            The Service is provided "as is" without warranties of any kind. We are
            not responsible for message delivery failures, translation inaccuracies,
            or service interruptions. Use the Service at your own risk.
          </p>

          <h2 className="text-lg font-semibold text-foreground">8. Changes to Terms</h2>
          <p>
            We may update these Terms at any time. Continued use of the Service after
            changes constitutes acceptance of the new Terms.
          </p>
        </div>

        {user ? (
          <TosAcceptButton />
        ) : (
          <div className="text-center">
            <a
              href="/join"
              className="inline-block py-3 px-8 rounded-lg bg-accent text-black font-semibold hover:bg-accent-hover transition-colors"
            >
              Sign In to Continue
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
