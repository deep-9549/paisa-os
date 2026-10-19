"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { useStore } from "@/lib/store/store";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const userId = useStore((s) => s.userId);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (userId) router.replace("/");
  }, [userId, router]);

  if (!supabaseConfigured)
    return (
      <div className="mx-auto max-w-sm px-6 py-16 text-center">
        <p className="text-4xl">₹</p>
        <h1 className="mt-2 text-xl font-bold">Local-only mode</h1>
        <p className="mt-2 text-sm text-muted">Supabase isn&apos;t configured, so there&apos;s no sign-in — your data stays in this browser.</p>
        <Link href="/" className="mt-6 inline-block text-accent">Open Paisa OS →</Link>
      </div>
    );

  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-3xl font-bold text-accent-ink">₹</div>
      <h1 className="text-3xl font-bold tracking-tight">Paisa OS</h1>
      <p className="mt-1 text-muted">Sign in to sync across your phone and laptop.</p>
      <Button
        className="mt-8 w-full"
        size="lg"
        onClick={async () => {
          const { error } = await supabase()!.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
          if (error) setErr(error.message);
        }}
      >
        Continue with Google
      </Button>
      <div className="my-4 text-center text-xs text-muted">or</div>
      {sent ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm">Magic link sent to <b>{email}</b>. Open it on this device.</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase()!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
            if (error) setErr(error.message);
            else setSent(true);
          }}
        >
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" />
          <Button variant="primary" size="lg" className="mt-2 w-full" type="submit">Email me a magic link</Button>
        </form>
      )}
      {err && <p className="mt-3 text-sm text-bad">{err}</p>}
    </div>
  );
}
