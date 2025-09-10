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
