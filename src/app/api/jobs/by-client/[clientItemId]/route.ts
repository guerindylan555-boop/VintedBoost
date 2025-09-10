import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { clientItemId: string } }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientItemId = String(params?.clientItemId || "");
  if (!clientItemId) return NextResponse.json({ error: "Missing clientItemId" }, { status: 400 });

  const { rows } = await query<any>(
    `SELECT id,
            created_at as "createdAt",
            requested_mode as "requestedMode",
            final_mode as "finalMode",
            options,
            product,
            poses,
            main_image as "main_image",
            env_image as "env_image",
            status,
            results,
            debug
     FROM generation_jobs
     WHERE session_id = $1 AND client_item_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [session.user.id, clientItemId]
  );
  const job = rows?.[0] || null;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job, { status: 200 });
}
