"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect } from "react";
import { useStore } from "@/lib/store/store";
import { LockScreen } from "./LockScreen";
import { QuickAddSheet } from "./QuickAdd";
import { cn } from "./ui";

const TABS = [
  { href: "/", label: "Home", icon: "◉" },
  { href: "/activity", label: "Activity", icon: "≡" },
  { href: "/cards", label: "Cards", icon: "▭" },
  { href: "/plan", label: "Plan", icon: "◔" },
  { href: "/more", label: "More", icon: "⋯" },
];

const SIDEBAR = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/activity", label: "Activity", icon: "🧾" },
  { href: "/cards", label: "Cards", icon: "💳" },
  { href: "/plan", label: "Budgets", icon: "📊" },
  { href: "/plan/recurring", label: "Recurring & rent", icon: "🔁" },
  { href: "/plan/goals", label: "Goals", icon: "🎯" },
  { href: "/invest", label: "IPO tracker", icon: "🚀" },
  { href: "/invest/portfolio", label: "Portfolio", icon: "📈" },
  { href: "/friends", label: "Friends", icon: "👥" },
  { href: "/reports", label: "Reports", icon: "📉" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const BARE = ["/onboarding", "/login", "/rent-receipt"];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/more") return ["/more", "/friends", "/reports", "/settings", "/invest", "/tax", "/notifications"].some((p) => path.startsWith(p));
  if (href === "/plan") return path.startsWith("/plan");
  return path.startsWith(href);
}

function AddFromUrl() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (params.get("add") === "1") {
      useStore.getState().setQuickAdd({ open: true, text: params.get("text") ?? undefined });
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

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-lg font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">₹</span> Paisa OS
        </Link>
        <button onClick={() => setQuickAdd({ open: true })} className="mb-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent font-medium text-accent-ink">
          + Add transaction
        </button>
        <nav className="flex flex-col gap-0.5 overflow-y-auto">
          {SIDEBAR.map((s) => {
            const active = s.href === "/" ? path === "/" : s.href === "/plan" ? path === "/plan" : s.href === "/invest" ? path === "/invest" : path.startsWith(s.href);
            return (
              <Link key={s.href} href={s.href} className={cn("flex h-10 items-center gap-3 rounded-lg px-3 text-sm", active ? "bg-surface-3 font-medium" : "text-muted hover:bg-surface-2 hover:text-ink")}>
                <span aria-hidden>{s.icon}</span>
                {s.label}
                {s.href === "/notifications" && unread > 0 && <span className="ml-auto rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">{unread}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-[max(env(safe-area-inset-top),12px)] md:px-8 md:pb-12">{children}</main>

      {/* Floating + button, one-thumb reach */}
      <button
        onClick={() => setQuickAdd({ open: true })}
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-3xl font-light text-accent-ink shadow-lg shadow-black/40 active:scale-95 md:hidden"
        aria-label="Add transaction"
      >
        +
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur safe-bottom md:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => {
            const active = isActive(path, t.href);
            return (
              <Link key={t.href} href={t.href} className={cn("relative flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-accent" : "text-muted")} aria-current={active ? "page" : undefined}>
                <span className="text-lg leading-none" aria-hidden>{t.icon}</span>
                {t.label}
                {t.href === "/more" && unread > 0 && <span className="absolute right-[calc(50%-18px)] top-2 h-2 w-2 rounded-full bg-bad" />}
              </Link>
            );
          })}
        </div>
      </nav>

      <QuickAddSheet />
      <Toasts />
      <LockScreen />
      <Suspense>
        <AddFromUrl />
      </Suspense>
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(150px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-line bg-surface-3 px-4 py-3 text-sm shadow-xl animate-fade">
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
