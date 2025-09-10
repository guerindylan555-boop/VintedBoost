import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS environment_images (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      prompt TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'bedroom',
      image TEXT NOT NULL,
      meta JSONB
    );`
  );
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const { rows } = await query<{
    id: string;
    created_at: string;
    prompt: string;
    kind: string;
    image: string;
    meta: unknown | null;
  }>(
    `SELECT id, created_at, prompt, kind, image, meta
     FROM environment_images
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [session.user.id]
  );
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      prompt: r.prompt,
      kind: (r.kind || 'bedroom') as 'bedroom',
      image: r.image,
      meta: r.meta ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    prompt?: string;
    kind?: string;
    image?: string;
    meta?: unknown;
  };
  const id = body?.id || randomUUID();
  const prompt = (body?.prompt || "").toString().trim();
  const kind = (body?.kind || "bedroom").toString();
  const image = (body?.image || "").toString();
  const meta = body?.meta ?? null;

  if (!prompt || !image) {
    return NextResponse.json({ error: "Invalid body: { prompt, image } required" }, { status: 400 });
  }

  await ensureTable();
  await query(
    `INSERT INTO environment_images (id, session_id, created_at, prompt, kind, image, meta)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       prompt = EXCLUDED.prompt,
       kind = EXCLUDED.kind,
       image = EXCLUDED.image,
       meta = EXCLUDED.meta`,
    [id, session.user.id, prompt, kind, image, meta == null ? null : JSON.stringify(meta)]
  );

  return NextResponse.json({
    ok: true,
    item: { id, createdAt: new Date().toISOString(), prompt, kind: "bedroom" as const, image, meta: meta ?? null },
  });
}
