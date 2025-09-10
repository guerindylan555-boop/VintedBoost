import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = String(params?.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { rows } = await query<any>(
    `SELECT id, created_at as "createdAt", requested_mode as "requestedMode", final_mode as "finalMode", options, product, poses,
            main_image as "main_image", env_image as "env_image", status, results, debug
     FROM generation_jobs WHERE id = $1 LIMIT 1`,
    [id]
  );
  const job = rows?.[0] || null;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job, { status: 200 });
}
