"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPPORTED_LANGUAGES } from "@/lib/translate";
import type { Profile } from "@/lib/types";

interface UserPreferencesProps {
  profile: Profile;
  userId: string;
}

export function UserPreferences({ profile, userId }: UserPreferencesProps) {
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [language, setLanguage] = useState(profile.preferred_language);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  async function saveField(field: string, value: string) {
    await supabase.from("profiles").update({ [field]: value }).eq("id", userId);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <section className="bg-surface rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-2">Display Name</h2>
        <p className="text-sm text-muted mb-4">
          This is how your name appears in chat messages.
        </p>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={() => displayName.trim() && saveField("display_name", displayName.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && displayName.trim()) {
              saveField("display_name", displayName.trim());
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Enter your display name"
          className="w-full max-w-xs px-3 py-2 rounded-lg bg-background border border-border text-foreground"
        />
      </section>

      <section className="bg-surface rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-2">Translation Language</h2>
        <p className="text-sm text-muted mb-4">
          Choose your language for the translate button on messages.
        </p>
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            saveField("preferred_language", e.target.value);
          }}
          className="w-full max-w-xs px-3 py-2 rounded-lg bg-background border border-border text-foreground"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}{(lang as any).engine ? ` (${(lang as any).engine})` : ""}
            </option>
          ))}
        </select>
      </section>

      {saved && (
        <p className="text-xs text-accent text-center">Saved</p>
      )}
    </div>
  );
}
