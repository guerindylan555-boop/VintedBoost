import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = String(params?.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Ensure job exists and belongs to the user
  const { rows } = await query<{ status: string }>(
    `SELECT status FROM generation_jobs WHERE id = $1 AND session_id = $2 LIMIT 1`,
    [id, session.user.id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mark as queued if currently created
  const current = (rows[0].status || '').toLowerCase();
  if (current === "created") {
    await query(`UPDATE generation_jobs SET status = 'queued' WHERE id = $1`, [id]);
  }

  const { searchParams } = new URL(req.url);
  const inline = searchParams.get("inline") === "1" || req.headers.get("x-inline-run") === "1";
  if (!inline) {
    return NextResponse.json({ queued: true, id }, { status: 202 });
  }

  // Inline execution: proxy to existing generate endpoint to keep logic in one place
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/jobs/${encodeURIComponent(id)}/generate`, {
      method: "POST",
      headers: { cookie: req.headers.get("cookie") || "", "x-image-provider": req.headers.get("x-image-provider") || "" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({} as any));
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
