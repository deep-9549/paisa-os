"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type Ctor = new () => Recognition;

/** Browser speech-to-text (Chrome/Android, Safari). `supported` is false elsewhere, so callers hide the mic. */
export function useVoice(onText: (text: string, final: boolean) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C) return;
    const r = new C();
    r.lang = "en-IN";
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const res = Array.from(e.results);
      const text = res.map((x) => x[0].transcript).join(" ");
      cb.current(text, res.every((x) => x.isFinal));
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone permission is off" : e.error === "no-speech" ? "Didn't catch that — try again" : null);
    r.onend = () => setListening(false);
    setError(null);
    setListening(true);
    rec.current = r;
    r.start();
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported, listening, error, start, stop };
}
