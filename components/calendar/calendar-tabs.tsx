"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Three-way tab header above every /calendar/* page. The active tab is
 * derived from the current pathname so the server components don't need
 * to pass it explicitly.
 */
export function CalendarTabs() {
  const pathname = usePathname();
  const tabs: { href: string; label: string }[] = [
    { href: "/calendar/game", label: "Game" },
    { href: "/calendar/alliance", label: "Alliance" },
    { href: "/calendar/misc", label: "Miscellaneous" },
  ];

  return (
    <div className="flex border-b border-border bg-surface">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              active
                ? "text-accent border-b-2 border-accent"
                : "text-muted hover:text-foreground border-b-2 border-transparent"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
