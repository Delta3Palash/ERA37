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
  const [language, setLanguage] = useState(profile.preferred_language);
  const [autoTranslate, setAutoTranslate] = useState(profile.auto_translate ?? false);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  async function saveLanguage(lang: string) {
    setLanguage(lang);
    await supabase.from("profiles").update({ preferred_language: lang }).eq("id", userId);
    flash();
  }

  async function saveAutoTranslate(enabled: boolean) {
    setAutoTranslate(enabled);
    await supabase.from("profiles").update({ auto_translate: enabled }).eq("id", userId);
    flash();
  }

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <section className="bg-surface rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Language</h2>
        <select
          value={language}
          onChange={(e) => saveLanguage(e.target.value)}
          className="w-full max-w-xs px-3 py-2 rounded-lg bg-background border border-border text-foreground"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-3 mt-4 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={autoTranslate}
              onChange={(e) => saveAutoTranslate(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-border rounded-full peer peer-checked:bg-accent transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-foreground rounded-full transition-transform peer-checked:translate-x-4" />
          </div>
          <span className="text-sm">Auto-translate incoming messages</span>
        </label>
        <p className="text-xs text-muted mt-2">
          When enabled, incoming messages in other languages will be automatically translated to your preferred language.
        </p>
      </section>

      {saved && (
        <p className="text-xs text-accent text-center">Saved</p>
      )}
    </div>
  );
}
