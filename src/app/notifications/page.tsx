"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, Card, Empty, PageHeader } from "@/components/ui";
import { clearNotifications, markNotificationsRead } from "@/lib/store/actions";
import { useData } from "@/lib/store/selectors";

const ICON: Record<string, string> = { card: "💳", bill: "🧾", recurring: "🔁", budget: "📊", ipo: "🚀", nudge: "✍️", friend: "👥", digest: "📬", report: "📉" };

export default function NotificationsPage() {
  const d = useData();
  const list = [...d.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
  useEffect(() => {
    const t = setTimeout(() => markNotificationsRead(), 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div>
      <PageHeader back="/more" title="Notifications" action={list.length > 0 && <Button size="sm" onClick={clearNotifications}>Clear all</Button>} />
      {list.length === 0 && <Empty icon="🔔" title="You're all caught up" body="Card dues, bills, budget pace and IPO events show up here." />}
      <div className="space-y-2">
        {list.map((n) => {
          const body = (
            <div className="flex gap-3">
              <span className="text-xl" aria-hidden>{ICON[n.kind] ?? "🔔"}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</p>
                <p className="text-xs text-muted">{n.body}</p>
                <p className="mt-0.5 text-[10px] text-muted">{new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
            </div>
          );
          return n.href ? (
            <Link key={n.id} href={n.href} className="block rounded-2xl border border-line bg-surface p-3 hover:bg-surface-2">{body}</Link>
          ) : (
            <Card key={n.id} className="p-3">{body}</Card>
          );
        })}
      </div>
    </div>
  );
}
