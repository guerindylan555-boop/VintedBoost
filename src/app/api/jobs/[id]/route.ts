import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = String(params?.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Ensure auxiliary results table exists for structured reads
  async function ensureResultsTable() {
    await query(
      `CREATE TABLE IF NOT EXISTS generation_results (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        pose TEXT NOT NULL,
        image TEXT,
        error TEXT,
        instruction TEXT,
        latency_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`
    );
    await query(`CREATE INDEX IF NOT EXISTS idx_generation_results_job ON generation_results(job_id);`);
  }
  await ensureResultsTable();

  const { rows } = await query<any>(
    `SELECT id, created_at as "createdAt", requested_mode as "requestedMode", final_mode as "finalMode", options, product, poses,
            main_image as "main_image", env_image as "env_image", person_image as "person_image", status, results, debug
     FROM generation_jobs WHERE id = $1 AND session_id = $2 LIMIT 1`,
    [id, session.user.id]
  );
  const job = rows?.[0] || null;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const resRows = await query<{
    pose: string;
    image: string | null;
    error: string | null;
    instruction: string | null;
    latency_ms: number | null;
    created_at: string;
  }>(
    `SELECT pose, image, error, instruction, latency_ms, created_at
     FROM generation_results
     WHERE job_id = $1
     ORDER BY created_at ASC`,
    [id]
  );
  const resultsDetailed = resRows.rows.map(r => ({
    pose: r.pose,
    image: r.image || null,
    error: r.error || null,
    instruction: r.instruction || null,
    latencyMs: r.latency_ms ?? null,
    createdAt: r.created_at,
  }));
  return NextResponse.json({ ...job, resultsDetailed }, { status: 200 });
}
