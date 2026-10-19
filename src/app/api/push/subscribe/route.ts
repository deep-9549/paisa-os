import { NextResponse } from "next/server";
import { supabaseAdmin, userFromRequest } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  const userId = await userFromRequest(req);
  const sb = supabaseAdmin();
  if (!userId || !sb) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sub = (await req.json()) as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!sub.endpoint || !sub.keys) return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  const { error } = await sb
    .from("push_subscriptions")
    .upsert({ user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
