"use client";

import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect } from "react";
import { ariaINR, formatINR } from "@/lib/domain/money";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" ? "h-9 rounded-xl px-3 text-sm" : size === "lg" ? "h-14 px-5 text-base" : "h-11 px-4 text-sm",
        variant === "primary" && "bg-accent text-accent-ink shadow-[0_8px_24px_-10px_var(--accent)] hover:brightness-110",
        variant === "secondary" && "bg-surface-2 text-ink hover:bg-surface-3 border border-line",
        variant === "ghost" && "text-ink hover:bg-surface-2",
        variant === "danger" && "bg-bad/15 text-bad hover:bg-bad/25",
        className,
      )}
    />
  );
}

export function LinkButton({ href, children, className, variant = "secondary" }: { href: string; children: ReactNode; className?: string; variant?: Variant }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition active:scale-[0.97]",
        variant === "primary" ? "bg-accent text-accent-ink" : "bg-surface-2 border border-line hover:bg-surface-3",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Card({ children, className, href, onClick }: { children: ReactNode; className?: string; href?: string; onClick?: () => void }) {
  const cls = cn("block rounded-3xl border border-line bg-surface p-4 shadow-card", (href || onClick) && "transition hover:bg-surface-2 active:scale-[0.99] cursor-pointer", className);
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  if (onClick) return <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick()} className={cls}>{children}</div>;
  return <div className={cls}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
      <div className="text-sm [&_a]:font-medium [&_a]:text-accent">{action}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: ReactNode; action?: ReactNode; back?: string }) {
  return (
    <header className="mb-5 pt-2">
      {back && <BackButton href={back} />}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    </header>
  );
}

/** Goes back in history when possible (keeps scroll position), else to `href`. */
export function BackButton({ href }: { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (window.history.length > 1 && document.referrer.startsWith(location.origin)) {
          e.preventDefault();
          router.back();
        }
      }}
      className="-ml-2 mb-1 inline-flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink"
      aria-label="Back"
    >
      <ChevronLeft size={20} aria-hidden /> Back
    </Link>
  );
}

export function IconButton({ label, children, onClick, href, className, badge }: { label: string; children: ReactNode; onClick?: () => void; href?: string; className?: string; badge?: number }) {
  const cls = cn("relative flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-surface-2 active:scale-95", className);
  const dot = badge ? <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-[18px] text-white">{badge > 9 ? "9+" : badge}</span> : null;
  if (href) return <Link href={href} className={cls} aria-label={label}>{children}{dot}</Link>;
  return <button type="button" onClick={onClick} className={cls} aria-label={label}>{children}{dot}</button>;
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted">
      {children}
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputCls = "h-12 w-full rounded-2xl border border-line bg-surface-2 px-3.5 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-4 focus:ring-accent/15";

export function Input(p: React.ComponentProps<"input">) {
  return <input {...p} className={cn(inputCls, p.className)} />;
}

export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...p} className={cn(inputCls, "appearance-none pr-9", p.className)}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cn(inputCls, "h-auto min-h-24 py-2", p.className)} />;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-surface-3")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", checked ? "left-5.5" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-2 p-1 no-scrollbar" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-xl px-3 font-semibold transition",
            size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
            value === o.value ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, children, onClick, color }: { active?: boolean; children: ReactNode; onClick?: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition active:scale-95",
        active ? "border-accent bg-accent/15 text-ink" : "border-line bg-surface text-muted hover:text-ink",
      )}
      style={active && color ? { borderColor: color, background: `${color}26` } : undefined}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" | "accent" }) {
  const t = {
    neutral: "bg-surface-3 text-muted",
    good: "bg-good/15 text-good",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    info: "bg-info/15 text-info",
    accent: "bg-accent/15 text-accent",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold", t)}>{children}</span>;
}

export const toneColor = (s: "ok" | "warn" | "over") => (s === "over" ? "var(--bad)" : s === "warn" ? "var(--warn)" : "var(--good)");

export function Progress({ value, tone = "ok", marker, label }: { value: number; tone?: "ok" | "warn" | "over"; marker?: number; label?: string }) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(Math.max(value, 0), 1) * 100}%`, background: toneColor(tone) }} />
      {marker !== undefined && <div className="absolute top-0 h-full w-0.5 bg-ink/60" style={{ left: `${Math.min(marker, 1) * 100}%` }} />}
    </div>
  );
}

/** Amount with Indian formatting, privacy blur and a screen-reader label. */
export function Amount({ value, className, sign, decimals, compact, tone }: { value: number; className?: string; sign?: boolean; decimals?: boolean; compact?: boolean; tone?: "auto" | "good" | "bad" }) {
  const color = tone === "auto" ? (value > 0 ? "text-good" : value < 0 ? "text-bad" : "") : tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "";
  return (
    <span className={cn("amount tabular", color, className)} aria-label={ariaINR(value)}>
      {formatINR(decimals ? value : Math.round(value), { sign, decimals, compact })}
    </span>
  );
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div className={cn("relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-line bg-surface px-4 pb-8 pt-2 shadow-2xl animate-sheet md:rounded-[28px] md:pt-4 safe-bottom", wide ? "md:max-w-2xl" : "md:max-w-lg")}>
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-surface-3 md:hidden" />
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted hover:text-ink" aria-label="Close">
              <X size={18} aria-hidden />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-2xl text-muted">{icon}</div>
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, href, tone }: { label: string; value: number; sub?: ReactNode; href?: string; tone?: "auto" | "good" | "bad" }) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">
        <Amount value={value} tone={tone} />
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-3xl border border-line bg-surface p-3.5 shadow-card hover:bg-surface-2">
      {body}
    </Link>
  ) : (
    <div className="rounded-3xl border border-line bg-surface p-3.5 shadow-card">{body}</div>
  );
}

export function Row({ left, title, sub, right, href, onClick }: { left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      {left && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-lg">{left}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
      {right && <div className="shrink-0 text-right text-sm">{right === "›" ? <ChevronRight size={18} className="text-muted" aria-hidden /> : right}</div>}
    </>
  );
  const cls = "flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left";
  if (href) return <Link href={href} className={cn(cls, "rounded-2xl transition hover:bg-surface-2 active:bg-surface-2")}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn(cls, "rounded-2xl transition hover:bg-surface-2 active:bg-surface-2")}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function Ring({ value, size = 180, stroke = 14, tone = "ok", children }: { value: number; size?: number; stroke?: number; tone?: "ok" | "warn" | "over"; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(Math.max(value, 0), 1);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, var(--text) 10%, transparent)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneColor(tone)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 6px ${toneColor(tone)})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </div>
  );
}
