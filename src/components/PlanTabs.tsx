"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

export function SubTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={cn("flex h-9 flex-1 items-center justify-center rounded-lg text-sm font-medium", path === t.href ? "bg-surface-3 text-ink shadow" : "text-muted")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export const PLAN_TABS = [
  { href: "/plan", label: "Budgets" },
  { href: "/plan/recurring", label: "Recurring" },
  { href: "/plan/goals", label: "Goals" },
];

export const INVEST_TABS = [
  { href: "/invest", label: "IPO tracker" },
  { href: "/invest/portfolio", label: "Portfolio" },
];
