"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

export function SubTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-2 p-1 no-scrollbar">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={cn("flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-2.5 text-sm font-semibold transition", path === t.href ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink")}>
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
  { href: "/plan/cashflow", label: "Cash flow" },
];

export const INVEST_TABS = [
  { href: "/invest", label: "IPO tracker" },
  { href: "/invest/portfolio", label: "Portfolio" },
];
