import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { query } from "@/lib/db";
import { getDefaultPrompt, PromptKind } from "@/lib/prompts";

export const runtime = "nodejs";

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_prompts (
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      prompt TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, kind)
    );
  `);
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = session.user?.email || null;
  if (!isAdminEmail(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureTable();
  const { rows } = await query<{ kind: string; prompt: string }>(
    `SELECT kind, prompt FROM admin_prompts WHERE session_id = $1`,
    [session.user.id]
  );
  const map = new Map<string, string>();
  for (const r of rows) map.set(String(r.kind), String(r.prompt));
  const background = map.get('background') || getDefaultPrompt('background');
  const subject = map.get('subject') || getDefaultPrompt('subject');
  const pose = map.get('pose') || getDefaultPrompt('pose');
  return NextResponse.json({ background, subject, pose });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = session.user?.email || null;
  if (!isAdminEmail(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Partial<Record<PromptKind, string>> | null;
  if (!body || (typeof body !== 'object')) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  await ensureTable();
  const updates: Array<[PromptKind, string]> = [];
  (['background','subject','pose'] as PromptKind[]).forEach((k) => {
    const v = (body as any)[k];
    if (typeof v === 'string' && v.trim()) updates.push([k, v]);
  });
  if (updates.length === 0) return NextResponse.json({ ok: true });
  for (const [k, v] of updates) {
    await query(
      `INSERT INTO admin_prompts (session_id, kind, prompt, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (session_id, kind) DO UPDATE SET prompt = EXCLUDED.prompt, updated_at = NOW()`,
      [session.user.id, k, v]
    );
  }
  return NextResponse.json({ ok: true });
}
