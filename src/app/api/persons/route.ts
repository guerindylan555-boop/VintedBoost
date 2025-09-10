import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS person_images (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      gender TEXT NOT NULL,
      prompt TEXT NOT NULL,
      image TEXT NOT NULL,
      meta JSONB,
      is_default BOOLEAN NOT NULL DEFAULT FALSE
    );`
  );
  await query(
    `ALTER TABLE person_images
     ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await query(
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'person_default_unique'
       ) THEN
         EXECUTE 'CREATE UNIQUE INDEX person_default_unique ON person_images(session_id, gender) WHERE is_default';
       END IF;
     END$$;`
  );
  await query(`CREATE INDEX IF NOT EXISTS idx_person_images_session_created ON person_images(session_id, created_at DESC);`);
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const { searchParams } = new URL(req.url);
  const genderFilterRaw = (searchParams.get("gender") || "").toLowerCase();
  const genderFilter = genderFilterRaw === "femme" || genderFilterRaw === "homme" ? genderFilterRaw : null;
  const params = (genderFilter ? [session.user.id, genderFilter] : [session.user.id]) as unknown[];
  const filterSql = genderFilter ? "AND LOWER(gender) = LOWER($2)" : "";
  const { rows } = await query<{
    id: string;
    created_at: string;
    prompt: string;
    gender: string;
    image: string;
    meta: unknown | null;
    is_default: boolean;
  }>(
    `SELECT id, created_at, prompt, gender, image, meta, is_default
     FROM person_images
     WHERE session_id = $1
       ${filterSql}
     ORDER BY created_at DESC
     LIMIT 200`,
    params
  );
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      prompt: r.prompt,
      gender: (r.gender || 'femme') as 'femme' | 'homme',
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
    gender?: string;
    image?: string;
    meta?: unknown;
    isDefault?: boolean;
  };
  const id = body?.id || randomUUID();
  const prompt = (body?.prompt || "").toString().trim();
  const genderRaw = (body?.gender || "femme").toString().toLowerCase();
  const gender = genderRaw === 'homme' ? 'homme' : 'femme';
  const image = (body?.image || "").toString();
  const meta = body?.meta ?? null;
  const setDefault = Boolean(body?.isDefault);

  if (!prompt || !image) {
    return NextResponse.json({ error: "Invalid body: { prompt, image } required" }, { status: 400 });
  }

  await ensureTable();
  try {
    await query('BEGIN');
    await query(
      `INSERT INTO person_images (id, session_id, created_at, prompt, gender, image, meta)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         prompt = EXCLUDED.prompt,
         gender = EXCLUDED.gender,
         image = EXCLUDED.image,
         meta = EXCLUDED.meta`,
      [id, session.user.id, prompt, gender, image, meta == null ? null : JSON.stringify(meta)]
    );
    if (setDefault) {
      await query(
        `UPDATE person_images SET is_default = FALSE WHERE session_id = $1 AND LOWER(gender) = LOWER($2)`,
        [session.user.id, gender]
      );
      await query(
        `UPDATE person_images SET is_default = TRUE WHERE id = $1 AND session_id = $2`,
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
    item: { id, createdAt: new Date().toISOString(), prompt, gender: gender as 'femme' | 'homme', image, meta: meta ?? null, isDefault: setDefault },
  });
}
