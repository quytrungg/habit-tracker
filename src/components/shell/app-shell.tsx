"use client";

import { CalendarDays, Gift, ListChecks, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const destinations = [
  { href: "/habits", label: "Habits", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/rewards", label: "Rewards", icon: Gift },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <main className="app-main">{children}</main>
      <nav className="bottom-dock" aria-label="Primary navigation">
        {destinations.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              className="dock-link"
              data-active={active}
              href={href}
              key={href}
            >
              <Icon aria-hidden="true" size={23} strokeWidth={2.2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
