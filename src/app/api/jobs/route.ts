import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { normalizeImageDataUrl } from "@/lib/image";
import { uploadDataUrlToS3, joinKey, extFromMime } from "@/lib/s3";

export const runtime = "nodejs";

async function ensureJobsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      requested_mode TEXT NOT NULL,
      final_mode TEXT,
      options JSONB,
      product JSONB,
      poses TEXT[],
      main_image TEXT NOT NULL,
      env_image TEXT,
      person_image TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      results JSONB,
      debug JSONB,
      provider TEXT,
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      error TEXT,
      client_item_id TEXT
    );
  `);
  // Backfill new columns if table already existed
  await query(`ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS provider TEXT`);
  await query(`ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`);
  await query(`ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`);
  await query(`ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS error TEXT`);
  await query(`ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS client_item_id TEXT`);
  await query(`ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS person_image TEXT`);
  // Helpful indexes for performance
  await query(`CREATE INDEX IF NOT EXISTS idx_generation_jobs_session_created ON generation_jobs(session_id, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_generation_jobs_client_item ON generation_jobs(session_id, client_item_id)`);
}

// Ensure auxiliary tables exist so lookups don't fail on fresh installs
async function ensureEnvAndPersonTables() {
  // environments
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
  await query(`ALTER TABLE environment_images ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE`);
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
  await query(`CREATE INDEX IF NOT EXISTS idx_environment_images_session_created ON environment_images(session_id, created_at DESC);`);

  // persons
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
  await query(`ALTER TABLE person_images ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE`);
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

function isHttpUrl(str: string): boolean {
  return typeof str === "string" && (str.startsWith("http://") || str.startsWith("https://"));
}

async function coerceToDataUrl(input: string): Promise<string> {
  let str = input;
  if (typeof str !== "string" || !str) throw new Error("Invalid image data");
  if (str.startsWith("data:") && str.includes(";base66,")) {
    str = str.replace(";base66,", ";base64,");
  }
  if (isHttpUrl(str)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(str, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error("Failed to fetch image");
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await resp.arrayBuffer());
    const b64 = buf.toString("base64");
    return `data:${contentType};base64,${b64}`;
  }
  if (!str.startsWith("data:")) throw new Error("Invalid image data format");
  return str;
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureJobsTable();
    // Ensure lookup tables exist so default refs can't fail on cold start
    await ensureEnvAndPersonTables();

    const body = (await req.json().catch(() => ({}))) as {
      imageDataUrl?: string | null; // required
      requestedMode?: "one" | "two" | "auto";
      envRef?: { kind?: "chambre" | "salon" } | null;
      envImage?: string | null; // optional (data url or http url)
      personImage?: string | null; // optional (data url or http url)
      personRef?: { gender?: "femme" | "homme" } | null;
      options?: Record<string, unknown> | null;
      product?: Record<string, unknown> | null;
      poses?: string[] | null;
      clientItemId?: string | null;
    };

    const id = randomUUID();
    const requestedMode = (body?.requestedMode || "auto") as "one" | "two" | "auto";
    const poses = Array.isArray(body?.poses) ? body!.poses!.slice(0, 3) : null;
    const options = body?.options ?? null;
    const product = body?.product ?? null;
    const clientItemId = (body?.clientItemId || "").toString().trim() || null;

  // Idempotency via (session_id, client_item_id)
    if (clientItemId) {
      try {
        const existing = await query<{ id: string; final_mode: string | null }>(
          `SELECT id, final_mode FROM generation_jobs WHERE session_id = $1 AND client_item_id = $2 ORDER BY created_at DESC LIMIT 1`,
          [session.user.id, clientItemId]
        );
        const found = existing.rows?.[0];
        if (found) {
          return NextResponse.json({ id: found.id, requestedMode, finalMode: (found.final_mode === 'two' ? 'two' : found.final_mode === 'one' ? 'one' : null) }, { status: 200 });
        }
      } catch {}
    }

    if (!body?.imageDataUrl || typeof body.imageDataUrl !== "string") {
      return NextResponse.json({ error: "Missing imageDataUrl" }, { status: 400 });
    }

  // Prepare main image
    let mainImageDataUrl: string;
    try {
      const coerced = await coerceToDataUrl(body.imageDataUrl);
      mainImageDataUrl = await normalizeImageDataUrl(coerced);
    } catch (e) {
      return NextResponse.json({ error: "Invalid main image" }, { status: 400 });
    }

  // Resolve environment image: envRef (default) or envImage, fallback to most recent if no default
    let envImageDataUrl: string | null = null;
    try {
      const fromBody = (body?.envImage && typeof body.envImage === "string") ? body.envImage : null;
      if (fromBody) {
        const coerced = await coerceToDataUrl(fromBody);
        envImageDataUrl = await normalizeImageDataUrl(coerced);
      } else if (body?.envRef?.kind) {
        // Load default environment for this session and kind
        const kind = body.envRef.kind;
        const kindLower = String(kind).toLowerCase();
        const filterSql = kindLower === 'chambre'
          ? `AND (LOWER(kind) = LOWER($2) OR LOWER(kind) = 'bedroom')`
          : `AND LOWER(kind) = LOWER($2)`;
      let { rows } = await query<{ image: string | null }>(
        `SELECT image FROM environment_images WHERE session_id = $1 AND is_default = TRUE ${filterSql} LIMIT 1`,
        [session.user.id, kind]
      );
      let img = rows?.[0]?.image || null;
      if (!img) {
        // Fallback to most recent of this kind
        ({ rows } = await query<{ image: string | null }>(
          `SELECT image FROM environment_images WHERE session_id = $1 ${filterSql} ORDER BY is_default DESC, created_at DESC LIMIT 1`,
          [session.user.id, kind]
        ));
        img = rows?.[0]?.image || null;
      }
        if (img) {
          const coerced = await coerceToDataUrl(img);
          envImageDataUrl = await normalizeImageDataUrl(coerced);
        }
      }
    } catch {
      // ignore, will determine mode below
      envImageDataUrl = null;
    }

  // Resolve optional person image (explicit body > default by gender > most recent by gender)
    let personImageDataUrl: string | null = null;
    try {
      const fromBody = (body?.personImage && typeof body.personImage === "string") ? body.personImage : null;
      if (fromBody) {
        const coerced = await coerceToDataUrl(fromBody);
        personImageDataUrl = await normalizeImageDataUrl(coerced);
      } else {
        // Resolve from user default by gender if requested
        const gender = (body?.personRef?.gender || "").toString().toLowerCase();
        if (gender === 'femme' || gender === 'homme') {
        try {
          let { rows } = await query<{ image: string | null }>(
            `SELECT image FROM person_images WHERE session_id = $1 AND is_default = TRUE AND LOWER(gender) = LOWER($2) LIMIT 1`,
            [session.user.id, gender]
          );
          let img = rows?.[0]?.image || null;
          if (!img) {
            ({ rows } = await query<{ image: string | null }>(
              `SELECT image FROM person_images WHERE session_id = $1 AND LOWER(gender) = LOWER($2) ORDER BY is_default DESC, created_at DESC LIMIT 1`,
              [session.user.id, gender]
            ));
            img = rows?.[0]?.image || null;
          }
          if (img) {
            const coerced = await coerceToDataUrl(img);
            personImageDataUrl = await normalizeImageDataUrl(coerced);
          }
        } catch {}
        }
      }
    } catch {
      personImageDataUrl = null;
    }

  // Decide final mode
    let finalMode: "one" | "two";
    if (requestedMode === "two") {
      if (!envImageDataUrl) {
        return NextResponse.json({ error: "Mode 2 images demandé mais aucun environnement par défaut n'est disponible" }, { status: 409 });
      }
      finalMode = "two";
    } else if (requestedMode === "one") {
      finalMode = "one";
    } else {
      finalMode = envImageDataUrl ? "two" : "one";
    }

  // Upload images to S3 if configured, store URLs in DB to avoid base64 bloat
    let mainImageUrl = mainImageDataUrl;
    let envImageUrl = envImageDataUrl;
    let personImageUrl = personImageDataUrl;
    const s3Enabled = Boolean(process.env.AWS_S3_BUCKET);
    if (s3Enabled) {
      try {
        // main image
        if (mainImageDataUrl && mainImageDataUrl.startsWith('data:')) {
          const m = mainImageDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
          const ext = extFromMime(m ? m[1] : 'image/jpeg');
          const key = joinKey('users', session.user.id, 'jobs', id, `main.${ext}`);
          const { url } = await uploadDataUrlToS3(mainImageDataUrl, key);
          mainImageUrl = url;
        }
        // env image
        if (envImageDataUrl && envImageDataUrl.startsWith('data:')) {
          const m = envImageDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
          const ext = extFromMime(m ? m[1] : 'image/jpeg');
          const key = joinKey('users', session.user.id, 'jobs', id, `env.${ext}`);
          const { url } = await uploadDataUrlToS3(envImageDataUrl, key);
          envImageUrl = url;
        }
        // person image
        if (personImageDataUrl && personImageDataUrl.startsWith('data:')) {
          const m = personImageDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
          const ext = extFromMime(m ? m[1] : 'image/jpeg');
          const key = joinKey('users', session.user.id, 'jobs', id, `person.${ext}`);
          const { url } = await uploadDataUrlToS3(personImageDataUrl, key);
          personImageUrl = url;
        }
      } catch {
        // if upload fails, keep data URLs as a fallback
      }
    }

    const debugJson = clientItemId ? { clientItemId, hasEnv: Boolean(envImageUrl), hasPerson: Boolean(personImageUrl), personGender: body?.personRef?.gender || null } : { hasEnv: Boolean(envImageUrl), hasPerson: Boolean(personImageUrl), personGender: body?.personRef?.gender || null };
    await query(
      `INSERT INTO generation_jobs (id, session_id, requested_mode, final_mode, options, product, poses, main_image, env_image, person_image, status, debug, client_item_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::text[], $8, $9, $10, 'created', $11::jsonb, $12)`,
      [
        id,
        session.user.id,
        requestedMode,
        finalMode,
        options == null ? null : JSON.stringify(options),
        product == null ? null : JSON.stringify(product),
        poses && poses.length ? poses : null,
        mainImageUrl,
        envImageUrl,
        personImageUrl,
        debugJson == null ? null : JSON.stringify(debugJson),
        clientItemId,
      ]
    );

    return NextResponse.json({ id, requestedMode, finalMode, hasEnv: Boolean(envImageDataUrl) }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
