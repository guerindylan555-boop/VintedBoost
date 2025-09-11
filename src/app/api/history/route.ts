import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import { uploadDataUrlToS3, uploadBufferToS3, fetchArrayBuffer, joinKey, extFromMime } from "@/lib/s3";

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
  await query(`CREATE INDEX IF NOT EXISTS idx_history_items_session_created ON history_items(session_id, created_at DESC);`);
}

export async function GET(req: NextRequest) {
  // Require Better Auth session
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = session.user.id;
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
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [sessionId]
  );
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

  // If S3 is configured, upload data URLs/http images to S3 for durability
  let sourceUrl = body.source;
  let resultsUrls: string[] = Array.isArray(body.results) ? [...body.results] : [];
  const s3Enabled = Boolean(process.env.AWS_S3_BUCKET);
  if (s3Enabled) {
    try {
      // Source
      try {
        const baseKey = joinKey('users', session.user.id, 'history', id, 'source');
        if (sourceUrl?.startsWith('data:')) {
          const m = sourceUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
          const ext = extFromMime(m ? m[1] : 'image/jpeg');
          const key = `${baseKey}.${ext}`;
          const { url } = await uploadDataUrlToS3(sourceUrl, key);
          sourceUrl = url;
        } else if (sourceUrl?.startsWith('http://') || sourceUrl?.startsWith('https://')) {
          const { buffer, contentType } = await fetchArrayBuffer(sourceUrl);
          const ext = extFromMime(contentType || 'image/jpeg');
          const key = `${baseKey}.${ext}`;
          const { url } = await uploadBufferToS3({ key, contentType: contentType || 'image/jpeg', body: buffer });
          sourceUrl = url;
        }
      } catch {}
      // Results (cap to 10 for safety)
      const limited = resultsUrls.slice(0, 10);
      const uploaded = await Promise.all(limited.map(async (u, i) => {
        try {
          const baseKey = joinKey('users', session.user.id, 'history', id, `result-${i+1}`);
          if (u?.startsWith('data:')) {
            const m = u.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
            const ext = extFromMime(m ? m[1] : 'image/jpeg');
            const key = `${baseKey}.${ext}`;
            const { url } = await uploadDataUrlToS3(u, key);
            return url;
          } else if (u?.startsWith('http://') || u?.startsWith('https://')) {
            const { buffer, contentType } = await fetchArrayBuffer(u);
            const ext = extFromMime(contentType || 'image/jpeg');
            const key = `${baseKey}.${ext}`;
            const { url } = await uploadBufferToS3({ key, contentType: contentType || 'image/jpeg', body: buffer });
            return url;
          }
        } catch {}
        return u;
      }));
      resultsUrls = uploaded;
    } catch {}
  }

  await ensureTable();
  await query(
    `INSERT INTO history_items (id, session_id, created_at, source_image, results, description)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       source_image = EXCLUDED.source_image,
       results = EXCLUDED.results,
       description = EXCLUDED.description`,
    [
      id,
      session.user.id,
      created.toISOString(),
      sourceUrl,
      JSON.stringify(resultsUrls),
      body.description == null ? null : JSON.stringify(body.description),
    ]
  );

  return NextResponse.json({ ok: true, id });
}
