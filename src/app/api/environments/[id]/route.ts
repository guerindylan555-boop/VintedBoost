import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = String(params?.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await query(
    `DELETE FROM environment_images WHERE id = $1 AND session_id = $2`,
    [id, session.user.id]
  );
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Use POST to toggle default: body { action: 'set-default' | 'unset-default' }
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = String(params?.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = (body?.action || "").toString();
  if (action !== "set-default" && action !== "unset-default") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "unset-default") {
    await query(
      `UPDATE environment_images SET is_default = FALSE WHERE id = $1 AND session_id = $2`,
      [id, session.user.id]
    );
    return NextResponse.json({ ok: true });
  }
  // set-default: find the kind of this id, unset others, set this
  const { rows } = await query<{ kind: string }>(
    `SELECT kind FROM environment_images WHERE id = $1 AND session_id = $2 LIMIT 1`,
    [id, session.user.id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const kind = (rows[0].kind || "chambre").toLowerCase();
  await query(
    `UPDATE environment_images SET is_default = FALSE WHERE session_id = $1 AND LOWER(kind) = LOWER($2)`,
    [session.user.id, kind]
  );
  await query(
    `UPDATE environment_images SET is_default = TRUE WHERE id = $1 AND session_id = $2`,
    [id, session.user.id]
  );
  return NextResponse.json({ ok: true });
}
