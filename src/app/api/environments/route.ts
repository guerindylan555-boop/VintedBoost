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
      meta JSONB,
      is_default BOOLEAN NOT NULL DEFAULT FALSE
    );`
  );
  // Unique default per (session, kind)
  await query(
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'env_default_unique'
       ) THEN
         EXECUTE 'CREATE UNIQUE INDEX env_default_unique ON environment_images(session_id, kind) WHERE is_default';
       END IF;
     END$$;`
  );
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const { searchParams } = new URL(req.url);
  const kindFilterRaw = (searchParams.get("kind") || "").toLowerCase();
  const kindFilter = kindFilterRaw === "chambre" || kindFilterRaw === "salon" ? kindFilterRaw : null;
  const { rows } = await query<{
    id: string;
    created_at: string;
    prompt: string;
    kind: string;
    image: string;
    meta: unknown | null;
    is_default: boolean;
  }>(
    `SELECT id, created_at, prompt, kind, image, meta, is_default
     FROM environment_images
     WHERE session_id = $1
       ${kindFilter ? "AND (LOWER(kind) = $2 OR LOWER(kind) = 'bedroom')" : ""}
     ORDER BY created_at DESC
     LIMIT 200`,
    kindFilter ? [session.user.id, kindFilter] : [session.user.id]
  );
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      prompt: r.prompt,
      // Map legacy 'bedroom' to 'chambre' in API shape
      kind: ((r.kind || 'bedroom').toLowerCase() === 'bedroom' ? 'chambre' : (r.kind || 'chambre')) as 'chambre' | 'salon',
      image: r.image,
      meta: r.meta ?? null,
      isDefault: Boolean(r.is_default),
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
    isDefault?: boolean;
  };
  const id = body?.id || randomUUID();
  const prompt = (body?.prompt || "").toString().trim();
  const kindRaw = (body?.kind || "chambre").toString().toLowerCase();
  const kind = kindRaw === 'salon' ? 'salon' : kindRaw === 'chambre' ? 'chambre' : 'chambre';
  const image = (body?.image || "").toString();
  const meta = body?.meta ?? null;
  const setDefault = Boolean(body?.isDefault);

  if (!prompt || !image) {
    return NextResponse.json({ error: "Invalid body: { prompt, image } required" }, { status: 400 });
  }

  await ensureTable();
  // Insert/update and optionally set as default in a small transaction
  try {
    await query('BEGIN');
    await query(
      `INSERT INTO environment_images (id, session_id, created_at, prompt, kind, image, meta)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         prompt = EXCLUDED.prompt,
         kind = EXCLUDED.kind,
         image = EXCLUDED.image,
         meta = EXCLUDED.meta`,
      [id, session.user.id, kind, kind, image, meta == null ? null : JSON.stringify(meta)]
    );
    if (setDefault) {
      await query(
        `UPDATE environment_images SET is_default = FALSE WHERE session_id = $1 AND LOWER(kind) = LOWER($2)`,
        [session.user.id, kind]
      );
      await query(
        `UPDATE environment_images SET is_default = TRUE WHERE id = $1 AND session_id = $2`,
        [id, session.user.id]
      );
    }
    await query('COMMIT');
  } catch (e) {
    await query('ROLLBACK');
    throw e;
  }

  return NextResponse.json({
    ok: true,
    item: { id, createdAt: new Date().toISOString(), prompt, kind: kind as 'chambre' | 'salon', image, meta: meta ?? null, isDefault: setDefault },
  });
}
