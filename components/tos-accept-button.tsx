"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function TosAcceptButton() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function accept() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("profiles")
      .update({ tos_accepted_at: new Date().toISOString() })
      .eq("id", user.id);

    router.push("/chat");
    router.refresh();
  }

  return (
    <div className="text-center">
      <button
        onClick={accept}
        disabled={loading}
        className="py-3 px-8 rounded-lg bg-accent text-black font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
      >
        {loading ? "Accepting..." : "I Accept the Terms of Service"}
      </button>
    </div>
  );
}
