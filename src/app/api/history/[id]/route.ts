import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS history_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_image TEXT NOT NULL,
      results JSONB NOT NULL
    );`
  );
  await query(
    `ALTER TABLE history_items
     ADD COLUMN IF NOT EXISTS description JSONB`
  );
}

export async function GET(_req: Request, context: unknown) {
  const session = await auth.api.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = (context as { params?: Record<string, string> })?.params || {};
  const id = params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await ensureTable();
  const { rows } = await query<{
    id: string;
    created_at: string;
    source_image: string;
    results: unknown;
    description: unknown | null;
  }>(
    `SELECT id, created_at, source_image, results, description
     FROM history_items
     WHERE id = $1 AND session_id = $2
     LIMIT 1`,
    [id, session.user.id]
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = rows[0];
  return NextResponse.json({
    id: r.id,
    createdAt: r.created_at,
    source: r.source_image,
    results: Array.isArray(r.results) ? (r.results as string[]) : [],
    description: r.description ?? null,
  });
}

export async function PATCH(req: Request, context: unknown) {
  const session = await auth.api.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = (context as { params?: Record<string, string> })?.params || {};
  const id = params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    description?: unknown | null;
    results?: string[];
    source?: string;
  } | null;
  if (!body || !("description" in body)) return NextResponse.json({ error: "Missing 'description' in body" }, { status: 400 });

  await ensureTable();
  const result = await query(
    `UPDATE history_items
     SET description = $1::jsonb
     WHERE id = $2 AND session_id = $3`,
    [body.description == null ? null : JSON.stringify(body.description), id, session.user.id]
  );
  if ((result as unknown as { rowCount?: number }).rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, context: unknown) {
  const session = await auth.api.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = (context as { params?: Record<string, string> })?.params || {};
  const id = params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await ensureTable();
  const result = await query(
    `DELETE FROM history_items
     WHERE id = $1 AND session_id = $2`,
    [id, session.user.id]
  );
  if ((result as unknown as { rowCount?: number }).rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}