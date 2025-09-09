import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/lib/auth";
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
  // Ensure optional description column exists
  await sql`
    ALTER TABLE history_items
    ADD COLUMN IF NOT EXISTS description JSONB
  `;
}

export async function GET(req: NextRequest) {
  // Require Better Auth session
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = session.user.id;
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
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  const res = NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      source: r.source_image,
      results: Array.isArray(r.results) ? (r.results as string[]) : [],
      description: r.description ?? null,
    })),
  });
  return res;
}

export async function POST(req: NextRequest) {
  // Require Better Auth session
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    id?: string;
    source: string;
    results: string[];
    createdAt?: number | string;
    description?: unknown | null;
  };

  if (!body?.source || !Array.isArray(body?.results)) {
    return NextResponse.json(
      { error: "Invalid body: { source, results[] } required" },
      { status: 400 }
    );
  }

  const id = body.id || randomUUID();
  const created =
    typeof body.createdAt === "number"
      ? new Date(body.createdAt)
      : body.createdAt
      ? new Date(body.createdAt)
      : new Date();

  await ensureTable();
  await sql`
    INSERT INTO history_items (id, session_id, created_at, source_image, results, description)
    VALUES (
      ${id},
      ${session.user.id},
      ${created.toISOString()},
      ${body.source},
      ${JSON.stringify(body.results)}::jsonb,
      ${body.description == null ? null : JSON.stringify(body.description)}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      source_image = EXCLUDED.source_image,
      results = EXCLUDED.results,
      description = EXCLUDED.description
  `;

  return NextResponse.json({ ok: true, id });
}
