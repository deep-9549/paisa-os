"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { getProfile } from "@/lib/store/actions";
import { runJobs } from "@/lib/store/jobs";
import { useStore } from "@/lib/store/store";
import { flushOutbox, initSync, pullAll, startRealtime, stopRealtime } from "@/lib/store/sync";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const PUBLIC = ["/login", "/onboarding", "/rent-receipt"];

export function Providers({ children }: { children: ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const data = useStore((s) => s.data);
  const userId = useStore((s) => s.userId);
  const router = useRouter();
  const path = usePathname();
  const profile = getProfile(data);
  const lastActive = useRef(Date.now());

  // Hydrate from IndexedDB, start sync + service worker.
  useEffect(() => {
    useStore.getState().hydrate();
    initSync();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Supabase auth session (only when configured; otherwise local-only mode).
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    const onSession = async (uid: string | null, email: string | null) => {
      useStore.getState().set({ userId: uid, email });
      if (uid) {
        try {
          await pullAll();
          startRealtime();
          await flushOutbox();
          useStore.getState().set({ syncStatus: "synced" });
        } catch {
          useStore.getState().set({ syncStatus: "error" });
        }
      } else stopRealtime();
    };
    sb.auth.getSession().then(({ data: s }) => onSession(s.session?.user.id ?? null, s.session?.user.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => onSession(s?.user.id ?? null, s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Routing guards: login (when Supabase is on) → onboarding → app.
  useEffect(() => {
    if (!hydrated) return;
    const isPublic = PUBLIC.some((p) => path.startsWith(p));
    if (supabaseConfigured && !userId && !isPublic) {
      supabase()!.auth.getSession().then(({ data: s }) => {
        if (!s.session) router.replace("/login");
      });
      return;
    }
    if (!profile.onboarded && !isPublic) router.replace("/onboarding");
  }, [hydrated, userId, profile.onboarded, path, router]);

  // Theme + privacy classes on <html>. "system" follows the OS setting live.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const theme = profile.theme === "system" ? (mq.matches ? "light" : "dark") : profile.theme;
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f5f9" : "#08090d");
    };
    apply();
    document.documentElement.classList.toggle("privacy", profile.privacy_mode);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [profile.theme, profile.privacy_mode]);

  // Scheduled jobs: on open and every 5 minutes.
  useEffect(() => {
    if (!hydrated || !profile.onboarded) return;
    runJobs();
    const t = setInterval(() => runJobs(), 5 * 60_000);
    return () => clearInterval(t);
  }, [hydrated, profile.onboarded]);

  // App lock: on launch and after N minutes idle / in background.
  const hasPin = !!profile.pin_hash;
  useEffect(() => {
    if (!hydrated || !hasPin) return;
    useStore.getState().set({ locked: true });
  }, [hydrated, hasPin]);
  useEffect(() => {
    if (!hasPin) return;
    const mark = () => (lastActive.current = Date.now());
    const check = () => {
      if (Date.now() - lastActive.current > (profile.lock_minutes || 5) * 60_000) useStore.getState().set({ locked: true });
    };
    const onVis = () => (document.visibilityState === "visible" ? check() : mark());
    const evs = ["pointerdown", "keydown", "scroll"];
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(check, 30_000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, [hasPin, profile.lock_minutes]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted" aria-busy>
        <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-accent text-xl font-bold text-accent-ink">₹</span>
        <span className="text-sm">Loading Paisa OS…</span>
      </div>
    );
  }
  return <>{children}</>;
}
