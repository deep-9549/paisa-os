"use client";

import { useEffect, useState } from "react";
import { getProfile } from "@/lib/store/actions";
import { useStore } from "@/lib/store/store";
import { hashPin, verifyBiometric } from "@/lib/security";
import { cn } from "./ui";

export function LockScreen() {
  const locked = useStore((s) => s.locked);
  const data = useStore((s) => s.data);
  const p = getProfile(data);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const unlock = () => {
    setPin("");
    useStore.getState().set({ locked: false });
  };

  useEffect(() => {
    if (!locked || !p.webauthn_credential_id) return;
    verifyBiometric(p.webauthn_credential_id).then((ok) => ok && unlock());
  }, [locked, p.webauthn_credential_id]);

  useEffect(() => {
    if (pin.length !== 4) return;
    hashPin(pin, p.id).then((h) => {
      if (h === p.pin_hash) unlock();
      else {
        setError(true);
        setTimeout(() => {
          setError(false);
          setPin("");
        }, 500);
      }
    });
  }, [pin, p.id, p.pin_hash]);

  useEffect(() => {
    if (!locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((x) => (x.length < 4 ? x + e.key : x));
      if (e.key === "Backspace") setPin((x) => x.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked]);

  if (!locked || !p.pin_hash) return null;
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del"];
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg px-6" role="dialog" aria-label="App locked">
      <div className="mb-2 text-4xl">🔒</div>
      <h1 className="text-xl font-semibold">Paisa OS is locked</h1>
      <p className="mb-6 text-sm text-muted">Enter your 4-digit PIN</p>
      <div className={cn("mb-8 flex gap-4", error && "animate-pulse")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn("h-4 w-4 rounded-full border-2", error ? "border-bad bg-bad" : i < pin.length ? "border-accent bg-accent" : "border-line")} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) =>
          k === "bio" ? (
            p.webauthn_credential_id ? (
              <button key={k} onClick={() => verifyBiometric(p.webauthn_credential_id!).then((ok) => ok && unlock())} className="h-16 w-16 rounded-full text-2xl hover:bg-surface-2" aria-label="Unlock with biometrics">
                👆
              </button>
            ) : (
              <span key={k} />
            )
          ) : (
            <button
              key={k}
              onClick={() => (k === "del" ? setPin((x) => x.slice(0, -1)) : setPin((x) => (x.length < 4 ? x + k : x)))}
              className="h-16 w-16 rounded-full bg-surface text-xl font-medium hover:bg-surface-2"
              aria-label={k === "del" ? "Delete digit" : k}
            >
              {k === "del" ? "⌫" : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
