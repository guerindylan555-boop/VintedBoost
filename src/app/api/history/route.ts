import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getOrCreateSession } from "@/lib/session";
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
}

export async function GET() {
  const sessionId = getOrCreateSession();
  await ensureTable();
  const { rows } = await sql<{
    id: string;
    created_at: string;
    source_image: string;
    results: unknown;
  }>`
    SELECT id, created_at, source_image, results
    FROM history_items
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      source: r.source_image,
      results: Array.isArray(r.results) ? (r.results as string[]) : [],
    })),
  });
}

export async function POST(req: NextRequest) {
  const sessionId = getOrCreateSession();
  const body = (await req.json()) as {
    id?: string;
    source: string;
    results: string[];
    createdAt?: number | string;
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
    INSERT INTO history_items (id, session_id, created_at, source_image, results)
    VALUES (${id}, ${sessionId}, ${created.toISOString()}, ${body.source}, ${JSON.stringify(
    body.results
  )}::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;

  return NextResponse.json({ ok: true, id });
}
