import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { uploadDataUrlToS3, joinKey, extFromMime } from "@/lib/s3";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    const email = session?.user?.email || null;
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!process.env.AWS_S3_BUCKET) {
      return NextResponse.json({ error: "S3 not configured (AWS_S3_BUCKET missing)" }, { status: 500 });
    }
    const body = (await req.json().catch(() => ({}))) as { imageDataUrl?: string };
    const dataUrl = (body?.imageDataUrl || "").toString();
    if (!dataUrl || !dataUrl.startsWith("data:")) {
      return NextResponse.json({ error: "Invalid body: imageDataUrl (data URL) required" }, { status: 400 });
    }
    const m = dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
    const ext = extFromMime(m ? m[1] : "image/jpeg");
    const ts = Date.now();
    const key = joinKey("users", session!.user.id, "admin", "s3-test", `${ts}.${ext}`);
    const { url } = await uploadDataUrlToS3(dataUrl, key);
    return NextResponse.json({ ok: true, key, url }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
