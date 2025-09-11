import { NextRequest, NextResponse } from "next/server";
import { googleAiGenerate } from "@/lib/google-ai";
import { query } from "@/lib/db";
import { parseDataUrl } from "@/lib/image";
import { fetchArrayBuffer } from "@/lib/s3";

export const runtime = "nodejs";

function getTextModel() {
  return process.env.GOOGLE_IMAGE_MODEL || "gemini-2.5-flash-image-preview";
}

async function ensurePersonReferences() {
  await query(`
    CREATE TABLE IF NOT EXISTS person_references (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      gender TEXT NOT NULL,
      image TEXT NOT NULL,
      prompt TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);
  await query(`ALTER TABLE person_references ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE person_references ADD COLUMN IF NOT EXISTS prompt TEXT`);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    gender?: string; // 'femme' | 'homme'
    count?: number;
  };

  const prompt = (body?.prompt || "").toString().trim();
  const genderRaw = (body?.gender || "femme").toString().toLowerCase();
  const gender = genderRaw === "homme" ? "homme" : "femme";
  const count = Math.min(Math.max(Number(body?.count) || 1, 1), 1);

  // Build base + optional user instruction
  const base = gender === "homme" ? "Generate a random man keep the clothe the same" : "Generate a random woman keep the clothe the same";
  const finalInstruction = prompt ? `${base}. ${prompt}` : base;

  try {
    await ensurePersonReferences();
    // Lookup active reference for this gender
    const { rows } = await query<{ image: string | null; prompt: string | null }>(
      `SELECT image, prompt FROM person_references WHERE is_active = TRUE AND LOWER(gender) = LOWER($1) ORDER BY created_at DESC LIMIT 1`,
      [gender]
    );
    const refImage = rows?.[0]?.image || null;
    const refPrompt = (rows?.[0]?.prompt || "").toString();
    if (!refImage) {
      return NextResponse.json({ error: `Aucune image de référence ${gender} n'est configurée par l'admin` }, { status: 409 });
    }

    // Prepare inlineData for Gemini
    let inlineMime = "image/jpeg";
    let inlineBase64 = "";
    if (refImage.startsWith("data:")) {
      const { mime, buffer } = parseDataUrl(refImage);
      inlineMime = mime;
      inlineBase64 = buffer.toString("base64");
    } else {
      const { buffer, contentType } = await fetchArrayBuffer(refImage);
      inlineMime = contentType || "image/jpeg";
      inlineBase64 = Buffer.from(buffer).toString("base64");
    }

    const userText = refPrompt ? `${finalInstruction}. ${refPrompt}` : finalInstruction;
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: userText },
            { inlineData: { mimeType: inlineMime, data: inlineBase64 } },
          ],
        },
      ],
    } as Record<string, unknown>;

    const model = getTextModel();
    const data = await googleAiGenerate<unknown>(model, payload, { cache: "no-store" });

    const images: string[] = [];
    try {
      const parts = (data as any)?.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        const d = p?.inlineData || p?.inline_data;
        if (d?.data && (d?.mimeType || d?.mime_type)) {
          const mime = d?.mimeType || d?.mime_type || "image/png";
          images.push(`data:${mime};base64,${d.data}`);
        }
      }
    } catch {}

    try {
      const gen = (data as any)?.generatedImages || [];
      for (const it of gen) {
        const b64 = it?.image?.bytesBase64Encoded;
        const mime = it?.image?.mimeType || "image/png";
        if (b64) images.push(`data:${mime};base64,${b64}`);
      }
    } catch {}

    if (images.length === 0) {
      let hint = "Aucune image reçue du modèle";
      try {
        const t = ((data as any)?.candidates?.[0]?.content?.parts || [])
          .map((p: any) => p?.text)
          .filter((x: any) => typeof x === "string")[0];
        if (t) hint = String(t).slice(0, 280);
      } catch {}
      return NextResponse.json({ error: hint }, { status: 422 });
    }

    return NextResponse.json({ images: images.slice(0, count), gender }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
