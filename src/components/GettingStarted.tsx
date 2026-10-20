"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { subscribePush } from "@/lib/push";
import { useData } from "@/lib/store/selectors";
import { useStore } from "@/lib/store/store";
import { cn } from "./ui";

const KEY = "paisa:getting-started-dismissed";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

/** First-week checklist that turns setup into a habit. Hides itself when done. */
export function GettingStarted({ onCloseDay }: { onCloseDay: () => void }) {
  const d = useData();
  const setQuickAdd = useStore((s) => s.setQuickAdd);
  const [dismissed, setDismissed] = useState(true);
  const [perm, setPerm] = useState<string>("default");
  const [installed, setInstalled] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(KEY) === "1");
    } catch {
      setDismissed(false);
    }
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const manual = d.transactions.some((t) => !t.deleted_at && !t.recurring_rule_id && !t.ipo_application_id && t.type === "expense");
  const steps = [
    { id: "log", label: "Log your first spend", hint: "Try “120 chai upi”", done: manual, run: () => setQuickAdd({ open: true }) },
    { id: "close", label: "Close your first day", hint: "10 seconds each evening", done: d.day_logs.length > 0, run: onCloseDay },
    { id: "goal", label: "Set a savings goal", hint: "A trip, a phone, a buffer", done: d.goals.some((g) => g.kind !== "emergency"), href: "/plan/goals" },
    {
      id: "notify",
      label: "Turn on reminders",
      hint: "Morning brief + evening check-in",
      done: perm === "granted" || perm === "unsupported",
      run: async () => {
        const r = await Notification.requestPermission();
        setPerm(r);
        if (r === "granted") subscribePush();
      },
    },
    {
      id: "install",
      label: "Add to home screen",
      hint: install ? "One tap to install" : "Browser menu → Add to Home screen",
      done: installed,
      run: install ? async () => { await install.prompt(); setInstall(null); } : undefined,
    },
  ];
  const left = steps.filter((s) => !s.done);
  if (dismissed || left.length === 0) return null;

  return (
    <section className="mt-3 rounded-3xl border border-accent/30 bg-accent/8 p-4" aria-label="Getting started">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Getting started · {steps.length - left.length}/{steps.length}</p>
        <button
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(KEY, "1");
            } catch {
              /* ignore */
            }
          }}
          className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2"
          aria-label="Hide getting started"
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((steps.length - left.length) / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-1">
        {steps.map((s) => {
          const body = (
            <>
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", s.done ? "border-good bg-good text-white" : "border-line")}>
                {s.done && <Check size={14} strokeWidth={3} aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", s.done && "text-muted line-through")}>{s.label}</span>
                {!s.done && <span className="block text-xs text-muted">{s.hint}</span>}
              </span>
            </>
          );
          const cls = "flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left";
          if (s.done || (!s.run && !s.href)) return <li key={s.id} className={cls}>{body}</li>;
          return (
            <li key={s.id}>
              {s.href ? <Link href={s.href} className={cn(cls, "hover:bg-surface-2")}>{body}</Link> : <button onClick={s.run} className={cn(cls, "hover:bg-surface-2")}>{body}</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
