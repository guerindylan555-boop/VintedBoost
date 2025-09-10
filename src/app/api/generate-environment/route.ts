import { NextRequest, NextResponse } from "next/server";
import { googleAiGenerate } from "@/lib/google-ai";

export const runtime = "nodejs";

function getTextModel() {
  return process.env.GOOGLE_IMAGE_MODEL || "gemini-2.5-flash-image-preview";
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    kind?: string; // currently only 'bedroom'
    count?: number;
  };

  const prompt = (body?.prompt || "").toString().trim();
  const kind = (body?.kind || "chambre").toString();
  const count = Math.min(Math.max(Number(body?.count) || 1, 1), 1); // v1: single image

  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  // Per user request: do not append constraints; send prompt as-is
  const userText = prompt;

  try {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: userText }],
        },
      ],
    } as Record<string, unknown>;

    const model = getTextModel();
    const data = await googleAiGenerate<unknown>(model, payload, { cache: "no-store" });

    // Try to parse common response shapes for inline image data
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
      // try get first text for error hint
      let hint = "Aucune image reçue du modèle";
      try {
        const t = ((data as any)?.candidates?.[0]?.content?.parts || [])
          .map((p: any) => p?.text)
          .filter((x: any) => typeof x === "string")[0];
        if (t) hint = String(t).slice(0, 280);
      } catch {}
      return NextResponse.json({ error: hint }, { status: 422 });
    }

    return NextResponse.json({ images: images.slice(0, count), kind }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
