export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/chat");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">
            ERA<span className="text-accent">37</span> Admin
          </h1>
          <Link href="/chat" className="text-sm text-accent hover:underline">
            Back to Chat
          </Link>
        </div>
        <nav className="flex gap-1 mb-8 border-b border-border">
          <AdminTab href="/admin/roles" label="Roles" />
          <AdminTab href="/admin/groups" label="Channel Groups" />
          <AdminTab href="/admin/users" label="Users" />
          <AdminTab href="/settings" label="Channels" />
        </nav>
        {children}
      </div>
    </div>
  );
}

function AdminTab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-surface-hover rounded-t-lg transition-colors"
    >
      {label}
    </Link>
  );
}
