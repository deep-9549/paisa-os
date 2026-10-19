import { NextResponse } from "next/server";
import webpush from "web-push";
import { cronAuthorized, supabaseAdmin } from "@/lib/server/supabaseAdmin";

// Vercel Cron entry points (see vercel.json). pg_cron writes reminder rows into
// `notifications`; these routes deliver them as Web Push and send the weekly
// email digest. Every run is logged to `job_runs`.

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  const { job } = await params;
  let result: string;
  try {
    if (job === "push") result = await deliverPush(sb);
    else if (job === "digest") result = await weeklyDigest(sb);
    else return NextResponse.json({ error: "unknown job" }, { status: 404 });
  } catch (e) {
    result = `error: ${(e as Error).message}`;
  }
  return NextResponse.json({ job, result });
}

type Admin = NonNullable<ReturnType<typeof supabaseAdmin>>;

async function deliverPush(sb: Admin): Promise<string> {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return "vapid keys missing";
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);

  const { data: notes } = await sb.from("notifications").select("*").eq("pushed", false).eq("read", false).limit(500);
  if (!notes?.length) return "nothing to send";
  const { data: subs } = await sb.from("push_subscriptions").select("*");
  let sent = 0;
  for (const n of notes) {
    for (const s of (subs ?? []).filter((x) => x.user_id === n.user_id)) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body, href: n.href ?? "/", tag: n.id }),
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
    await sb.from("notifications").update({ pushed: true }).eq("user_id", n.user_id).eq("id", n.id);
  }
  await logRun(sb, "push", `sent ${sent}`);
  return `sent ${sent}`;
}

async function weeklyDigest(sb: Admin): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "resend key missing";
  const { data: profiles } = await sb.from("profiles").select("user_id, name, email_digest").eq("email_digest", true);
  let sent = 0;
  for (const p of profiles ?? []) {
    const { data: user } = await sb.auth.admin.getUserById(p.user_id);
    const email = user.user?.email;
    if (!email) continue;
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: tx } = await sb.from("transactions").select("amount, my_share, type, exclude_from_budget, deleted_at, is_draft").eq("user_id", p.user_id).gte("occurred_at", since);
    const spent = (tx ?? [])
      .filter((t) => t.type === "expense" && !t.exclude_from_budget && !t.deleted_at && !t.is_draft)
      .reduce((a, t) => a + Number(t.my_share ?? t.amount), 0);
    const html = `<h2>Hi ${p.name}, your week in Paisa OS</h2><p>You spent <b>₹${Math.round(spent).toLocaleString("en-IN")}</b> in the last 7 days.</p><p>Open the app for your Safe-to-Spend.</p>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.DIGEST_FROM ?? "Paisa OS <digest@resend.dev>", to: email, subject: "Your weekly Paisa OS summary", html }),
    });
    if (res.ok) sent++;
  }
  await logRun(sb, "weekly_digest", `sent ${sent}`);
  return `sent ${sent}`;
}

async function logRun(sb: Admin, job: string, result: string) {
  const day = new Date().toISOString().slice(0, 10);
  const { data: users } = await sb.from("profiles").select("user_id");
  for (const u of users ?? [])
    await sb.from("job_runs").upsert({ user_id: u.user_id, id: `${job}:${day}`, job, ran_at: new Date().toISOString(), result }, { onConflict: "user_id,id" });
}
