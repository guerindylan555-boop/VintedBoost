import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSessionId, setSessionCookie } from "@/lib/session";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS history_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_image TEXT NOT NULL,
      results JSONB NOT NULL
    );
  `;
  await sql`
    ALTER TABLE history_items
    ADD COLUMN IF NOT EXISTS description JSONB
  `;
}

export async function GET(
  _req: Request,
  context: unknown
) {
  const params = (context as { params?: Record<string, string> })?.params || {};
  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  let sessionId = await getSessionId();
  let newSessionId: string | null = null;
  if (!sessionId) {
    sessionId = randomUUID();
    newSessionId = sessionId;
  }
  await ensureTable();
  const { rows } = await sql<{
    id: string;
    created_at: string;
    source_image: string;
    results: unknown;
    description: unknown | null;
  }>`
    SELECT id, created_at, source_image, results, description
    FROM history_items
    WHERE id = ${id} AND session_id = ${sessionId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const r = rows[0];
  const res = NextResponse.json({
    id: r.id,
    createdAt: r.created_at,
    source: r.source_image,
    results: Array.isArray(r.results) ? (r.results as string[]) : [],
    description: r.description ?? null,
  });
  if (newSessionId) setSessionCookie(res, newSessionId);
  return res;
}
