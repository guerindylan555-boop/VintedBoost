import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { normalizeImageDataUrl } from "@/lib/image";

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
  // Helpful indexes for performance
  await query(`CREATE INDEX IF NOT EXISTS idx_generation_jobs_session_created ON generation_jobs(session_id, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_generation_jobs_client_item ON generation_jobs(session_id, client_item_id)`);
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

    const body = (await req.json().catch(() => ({}))) as {
      imageDataUrl?: string | null; // required
      requestedMode?: "one" | "two" | "auto";
      envRef?: { kind?: "chambre" | "salon" } | null;
      envImage?: string | null; // optional (data url or http url)
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

  // Resolve environment image: envRef (default) or envImage
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
        const { rows } = await query<{ image: string | null }>(
          `SELECT image FROM environment_images WHERE session_id = $1 AND is_default = TRUE ${filterSql} LIMIT 1`,
          [session.user.id, kind]
        );
        const img = rows?.[0]?.image || null;
        if (img) {
          const coerced = await coerceToDataUrl(img);
          envImageDataUrl = await normalizeImageDataUrl(coerced);
        }
      }
    } catch {
      // ignore, will determine mode below
      envImageDataUrl = null;
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

  // Insert job
    const debugJson = clientItemId ? { clientItemId } : null;
    await query(
      `INSERT INTO generation_jobs (id, session_id, requested_mode, final_mode, options, product, poses, main_image, env_image, status, debug, client_item_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::text[], $8, $9, 'created', $10::jsonb, $11)`,
      [
        id,
        session.user.id,
        requestedMode,
        finalMode,
        options == null ? null : JSON.stringify(options),
        product == null ? null : JSON.stringify(product),
        poses && poses.length ? poses : null,
        mainImageDataUrl,
        envImageDataUrl,
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
