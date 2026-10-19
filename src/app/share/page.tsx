"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/**
 * PWA share target (Android share sheet / iOS Shortcut): shared text — a bank
 * SMS or a note like "450 swiggy" — opens quick-add pre-filled.
 */
function Share() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const text = [params.get("text"), params.get("title"), params.get("url")].filter(Boolean).join(" ").trim();
    router.replace(`/?add=1${text ? `&text=${encodeURIComponent(text)}` : ""}`);
  }, [params, router]);
  return <p className="p-6 text-sm text-muted">Opening quick-add…</p>;
}

export default function SharePage() {
  return (
    <Suspense>
      <Share />
    </Suspense>
  );
}
