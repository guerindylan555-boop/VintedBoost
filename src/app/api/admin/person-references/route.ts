import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { query } from "@/lib/db";
import { extFromMime, fetchArrayBuffer, joinKey, uploadBufferToS3, uploadDataUrlToS3 } from "@/lib/s3";
import { normalizeImageDataUrl } from "@/lib/image";

export const runtime = "nodejs";

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS person_references (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      gender TEXT NOT NULL,
      image TEXT NOT NULL,
      prompt TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);
  await query(`ALTER TABLE person_references ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE person_references ADD COLUMN IF NOT EXISTS prompt TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS idx_person_references_gender_created ON person_references(gender, created_at DESC)`);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'person_reference_active_unique'
      ) THEN
        EXECUTE 'CREATE UNIQUE INDEX person_reference_active_unique ON person_references(gender) WHERE is_active';
      END IF;
    END$$;
  `);
}

function isHttpUrl(str: string): boolean {
  return typeof str === "string" && (str.startsWith("http://") || str.startsWith("https://"));
}

async function coerceToStoredUrl(input: string, keyBase: string): Promise<string> {
  let img = (input || "").toString();
  const s3Enabled = Boolean(process.env.AWS_S3_BUCKET);
  if (!s3Enabled) {
    // Normalize to safe data URL
    if (isHttpUrl(img)) {
      const { buffer, contentType } = await fetchArrayBuffer(img);
      const b64 = Buffer.from(buffer).toString("base64");
      return `data:${contentType};base64,${b64}`;
    }
    if (img.startsWith("data:")) {
      return await normalizeImageDataUrl(img);
    }
    throw new Error("Invalid image input");
  }
  // S3 path
  if (img.startsWith("data:")) {
    const m = img.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
    const ext = extFromMime(m ? m[1] : "image/jpeg");
    const key = `${keyBase}.${ext}`;
    const { url } = await uploadDataUrlToS3(img, key);
    return url;
  }
  if (isHttpUrl(img)) {
    const { buffer, contentType } = await fetchArrayBuffer(img);
    const ext = extFromMime(contentType || "image/jpeg");
    const key = `${keyBase}.${ext}`;
    const { url } = await uploadBufferToS3({ key, contentType: contentType || "image/jpeg", body: buffer });
    return url;
  }
  throw new Error("Invalid image input");
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTable();
  const { rows } = await query<{
    id: string; created_at: string; created_by: string | null; gender: string; image: string; prompt: string | null; is_active: boolean;
  }>(
    `SELECT id, created_at, created_by, gender, image, prompt, is_active
     FROM person_references
     WHERE is_active = TRUE
     ORDER BY created_at DESC`
  );
  return NextResponse.json({
    items: rows.map(r => ({
      id: r.id,
      createdAt: r.created_at,
      createdBy: r.created_by,
      gender: (r.gender || 'femme').toLowerCase() === 'homme' ? 'homme' : 'femme',
      image: r.image,
      prompt: r.prompt || "",
      isActive: Boolean(r.is_active),
    }))
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(session.user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureTable();

  const body = (await req.json().catch(() => ({}))) as { gender?: string; image?: string; prompt?: string };
  const genderRaw = (body?.gender || "femme").toString().toLowerCase();
  const gender = genderRaw === "homme" ? "homme" : "femme";
  const image = (body?.image || "").toString();
  const prompt = (body?.prompt || "").toString();
  if (!image) return NextResponse.json({ error: "Image required" }, { status: 400 });

  const id = randomUUID();
  const keyBase = joinKey("admin", "person-references", gender, id);

  try {
    const storedUrl = await coerceToStoredUrl(image, keyBase);
    await query('BEGIN');
    // deactivate previous active for this gender
    await query(`UPDATE person_references SET is_active = FALSE WHERE gender = $1 AND is_active = TRUE`, [gender]);
    // insert new active
    await query(
      `INSERT INTO person_references (id, created_at, created_by, gender, image, prompt, is_active)
       VALUES ($1, NOW(), $2, $3, $4, $5, TRUE)`,
      [id, session.user.id, gender, storedUrl, prompt]
    );
    await query('COMMIT');
    return NextResponse.json({
      ok: true,
      item: { id, gender, image: storedUrl, prompt, isActive: true, createdAt: new Date().toISOString() }
    });
  } catch (e: any) {
    try { await query('ROLLBACK'); } catch {}
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
