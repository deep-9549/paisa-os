import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client: server code only (API routes / cron), never shipped to the browser.
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function userFromRequest(req: Request): Promise<string | null> {
  const sb = supabaseAdmin();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!sb || !token) return null;
  const { data } = await sb.auth.getUser(token);
  return data.user?.id ?? null;
}

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
