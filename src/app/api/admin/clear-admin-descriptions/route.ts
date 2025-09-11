import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { query } from "@/lib/db";
import { deleteObjectByUrl } from "@/lib/s3";

export const runtime = "nodejs";

/**
 * DELETE all saved admin background descriptions for the current session, and
 * attempt to delete any uploaded S3 images associated with them.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = session.user?.email || null;
  if (!isAdminEmail(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // 1) Fetch matching items first so we can cleanup their source images
  const { rows } = await query<{ id: string; source_image: string }>(
    `SELECT id, source_image
     FROM history_items
     WHERE session_id = $1
       AND description IS NOT NULL
       AND (
         (description->>'origin') = 'admin_extract_v1'
         OR (description ? 'removedPersons' AND description->>'removedPersons' = 'true')
         OR (description->>'kind') IN ('background','subject','pose')
       )`,
    [session.user.id]
  );

  // 2) Best-effort delete any S3 images
  await Promise.all(
    rows.map(async (r) => {
      const u = r.source_image;
      if (typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://'))) {
        try { await deleteObjectByUrl(u); } catch {}
      }
    })
  );

  // 3) Delete DB rows
  const delRes = await query(
    `DELETE FROM history_items
     WHERE session_id = $1
       AND description IS NOT NULL
       AND (
         (description->>'origin') = 'admin_extract_v1'
         OR (description ? 'removedPersons' AND description->>'removedPersons' = 'true')
         OR (description->>'kind') IN ('background','subject','pose')
       )`,
    [session.user.id]
  );

  const deleted = (delRes as unknown as { rowCount?: number }).rowCount || 0;
  return NextResponse.json({ ok: true, deleted });
}
