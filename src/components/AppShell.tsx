"use client";

import {
  Bell, ChartColumn, HeartPulse, Plane, ChartPie, CreditCard, House, LayoutGrid, type LucideIcon, Plus, ReceiptText, Repeat, Rocket, Search, Settings, Target, TrendingUp, Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect } from "react";
import { useStore } from "@/lib/store/store";
import { LockScreen } from "./LockScreen";
import { AskSheet } from "./AskSheet";
import { QuickAddSheet } from "./QuickAdd";
import { cn } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon };

const TABS: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/activity", label: "Activity", icon: ReceiptText },
  { href: "/plan", label: "Plan", icon: ChartPie },
  { href: "/more", label: "More", icon: LayoutGrid },
];

const SIDEBAR: { group: string; items: NavItem[] }[] = [
  {
    group: "Daily",
    items: [
      { href: "/", label: "Home", icon: House },
      { href: "/activity", label: "Activity", icon: ReceiptText },
      { href: "/cards", label: "Cards", icon: CreditCard },
      { href: "/friends", label: "Friends", icon: Users },
    ],
  },
  {
    group: "Plan",
    items: [
      { href: "/plan", label: "Budgets", icon: ChartPie },
      { href: "/plan/recurring", label: "Bills & recurring", icon: Repeat },
      { href: "/plan/goals", label: "Goals", icon: Target },
      { href: "/trips", label: "Trips", icon: Plane },
    ],
  },
  {
    group: "Grow",
    items: [
      { href: "/invest", label: "IPO tracker", icon: Rocket },
      { href: "/invest/portfolio", label: "Net worth", icon: TrendingUp },
      { href: "/reports", label: "Reports", icon: ChartColumn },
      { href: "/health", label: "Money health", icon: HeartPulse },
    ],
  },
  {
    group: "App",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const BARE = ["/onboarding", "/login", "/rent-receipt"];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/more") return ["/more", "/cards", "/friends", "/reports", "/settings", "/invest", "/tax", "/notifications", "/review", "/health", "/trips", "/catch-up"].some((p) => path.startsWith(p));
  if (href === "/plan") return path.startsWith("/plan");
  return path.startsWith(href);
}

const exactSidebar = new Set(["/", "/plan", "/invest"]);

function AddFromUrl() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (params.get("add") === "1") {
      useStore.getState().setQuickAdd({ open: true, text: params.get("text") ?? undefined });
      router.replace("/");
    } else if (params.get("ask") === "1") {
      useStore.getState().set({ askOpen: true });
      router.replace("/");
    }
  }, [params, router]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const unread = useStore((s) => s.data.notifications.filter((n) => !n.read).length);
  const setQuickAdd = useStore((s) => s.setQuickAdd);

  if (BARE.some((p) => path.startsWith(p))) return <>{children}</>;

  const tab = (t: NavItem) => {
    const active = isActive(path, t.href);
    const I = t.icon;
    return (
      <Link key={t.href} href={t.href} className={cn("relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition", active ? "text-ink" : "text-muted")} aria-current={active ? "page" : undefined}>
        <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition", active && "bg-accent/15 text-accent")}>
          <I size={21} strokeWidth={active ? 2.4 : 1.9} aria-hidden />
        </span>
        {t.label}
        {t.href === "/more" && unread > 0 && <span className="absolute right-[calc(50%-20px)] top-2.5 h-2 w-2 rounded-full bg-bad ring-2 ring-surface" />}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2 text-lg font-bold tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-[0_6px_20px_-8px_var(--accent)]">₹</span> Paisa OS
        </Link>
        <button onClick={() => setQuickAdd({ open: true })} className="mb-5 flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-accent-ink shadow-[0_8px_24px_-10px_var(--accent)] transition hover:brightness-110 active:scale-[0.98]">
          <Plus size={18} aria-hidden /> Add transaction
          <kbd className="ml-1 rounded-md bg-black/15 px-1.5 text-[11px] font-medium">N</kbd>
        </button>
        <button onClick={() => useStore.getState().set({ askOpen: true })} className="mb-5 -mt-3 flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm text-muted transition hover:text-ink">
          <Search size={16} aria-hidden /> Ask or jump…
          <kbd className="ml-auto rounded-md border border-line px-1.5 text-[11px]">⌘K</kbd>
        </button>
        <nav className="flex flex-col gap-4 overflow-y-auto no-scrollbar">
          {SIDEBAR.map((g) => (
            <div key={g.group}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted/70">{g.group}</p>
              {g.items.map((s) => {
                const active = exactSidebar.has(s.href) ? path === s.href : path.startsWith(s.href);
                const I = s.icon;
                return (
                  <Link key={s.href} href={s.href} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition", active ? "bg-accent/12 font-semibold text-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
                    <I size={18} className={active ? "text-accent" : undefined} aria-hidden />
                    {s.label}
                    {s.href === "/notifications" && unread > 0 && <span className="ml-auto rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">{unread}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-[max(env(safe-area-inset-top),12px)] md:px-8 md:pb-12 md:pt-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/85 backdrop-blur-xl safe-bottom md:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-lg items-center px-1">
          {TABS.slice(0, 2).map(tab)}
          <div className="flex flex-1 justify-center">
            <button
              onClick={() => setQuickAdd({ open: true })}
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-[20px] bg-accent text-accent-ink shadow-[0_10px_30px_-8px_var(--accent)] ring-4 ring-bg transition active:scale-90"
              aria-label="Add transaction"
            >
              <Plus size={28} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
          {TABS.slice(2).map(tab)}
        </div>
      </nav>

      <QuickAddSheet />
      <AskSheet />
      <Toasts />
      <LockScreen />
      <Shortcuts />
      <Suspense>
        <AddFromUrl />
      </Suspense>
    </div>
  );
}

/** Desktop keyboard shortcuts: N = add, / = search activity, g h/a/p = go to. */
function Shortcuts() {
  const router = useRouter();
  useEffect(() => {
    let g = false;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable]") || document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (g) {
        g = false;
        const to = { h: "/", a: "/activity", p: "/plan", c: "/cards", f: "/friends", r: "/reports", s: "/settings" }[k];
        if (to) router.push(to);
        return;
      }
      if (k === "n") {
        e.preventDefault();
        useStore.getState().setQuickAdd({ open: true });
      } else if (k === "/") {
        e.preventDefault();
        router.push("/activity?focus=1");
      } else if (k === "g") g = true;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(92px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-surface-3/95 px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur animate-rise">
          <span className="flex-1">{t.text}</span>
          {t.action && (
            <button
              className="min-h-11 font-semibold text-accent"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
