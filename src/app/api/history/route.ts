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
}

export async function GET(req: NextRequest) {
  // Ensure there is a Better Auth session (anonymous if needed)
  let session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    await auth.api.signInAnonymous({ headers: req.headers });
    session = await auth.api.getSession({ headers: req.headers });
  }
  let sessionId = session?.user?.id || randomUUID();
  // Backward-compat: if legacy cookie exists and no auth session, use it to read
  if (!session) {
    try {
      const { cookies } = await import("next/headers");
      const jar = await cookies();
      const legacy = jar.get("vb_session")?.value;
      if (legacy) sessionId = legacy;
    } catch {}
  }
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
  const res = NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      source: r.source_image,
      results: Array.isArray(r.results) ? (r.results as string[]) : [],
    })),
  });
  return res;
}

export async function POST(req: NextRequest) {
  // Ensure there is a Better Auth session (anonymous if needed)
  let session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    await auth.api.signInAnonymous({ headers: req.headers });
    session = await auth.api.getSession({ headers: req.headers });
  }
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
    VALUES (${id}, ${session?.user?.id || randomUUID()}, ${created.toISOString()}, ${body.source}, ${JSON.stringify(
    body.results
  )}::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;

  return NextResponse.json({ ok: true, id });
}
