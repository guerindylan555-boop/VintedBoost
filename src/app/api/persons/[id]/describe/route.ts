import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { fetchArrayBuffer } from "@/lib/s3";
import { parseDataUrl, normalizeImageDataUrl } from "@/lib/image";
import { googleAiGenerate } from "@/lib/google-ai";

export const runtime = "nodejs";

const GOOGLE_TEXT_MODEL = process.env.GOOGLE_TEXT_MODEL || "gemini-2.5-flash";

const DESCRIPTION_PROMPT = `Take the desctiption of this woman and add it to the background image with the dress image : The young woman in the image has a symmetrical and finely featured face. Her skin appears smooth and clear, with a light, even tone that suggests minimal, if any, makeup, allowing her natural complexion to show through.
Her eyes are a striking clear blue, set well apart under gently arched, light-colored eyebrows that are neatly groomed. The shape of her eyes is almond-like, with visible upper eyelids and a slight upward tilt at the outer corners. There's a subtle hint of a natural lash line, with no visible mascara or eyeliner.
Her nose is slender and straight, with a small, slightly upturned tip and narrow nostrils, harmonizing with the delicate proportions of her face.
Her lips are naturally full, especially the bottom lip, with a well-defined Cupid's bow on the upper lip. They have a soft, rosy-pink hue, without any noticeable lipstick or gloss, giving them a natural and healthy appearance.
Her face shape is an oval, characterized by a gently rounded forehead, prominent cheekbones that give a subtle definition to her mid-face, and a softly pointed chin. Her jawline is subtly defined, transitioning smoothly from her ears to her chin.
Her hair is long, straight, and a bright, almost platinum blonde, with no visible roots or highlights, suggesting a uniform color. It falls smoothly around her face, framing it without obscuring any features, and appears to be finely textured and well-maintained. It is parted slightly to one side, allowing some strands to fall naturally.
Overall, her expression is neutral and direct, with a calm gaze that looks straight forward. There are no lines or wrinkles visible, consistent with a youthful appearance.`;

async function imageToInlineData(urlOrDataUrl: string): Promise<{ mimeType: string; dataBase64: string }> {
  if (urlOrDataUrl.startsWith("data:")) {
    const { mime, buffer } = parseDataUrl(urlOrDataUrl);
    return { mimeType: mime, dataBase64: buffer.toString("base64") };
  }
  const { buffer, contentType } = await fetchArrayBuffer(urlOrDataUrl);
  return { mimeType: contentType || "image/jpeg", dataBase64: Buffer.from(buffer).toString("base64") };
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (ctx?.params?.id || "").toString();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Load the saved persona image for this user
  const { rows } = await query<{ image: string | null }>(
    `SELECT image FROM person_images WHERE id = $1 AND session_id = $2 LIMIT 1`,
    [id, session.user.id]
  );
  const image = rows?.[0]?.image || null;
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Normalize to safe data URL
  let safeDataUrl = image;
  try {
    if (!safeDataUrl.startsWith("data:")) {
      const { buffer, contentType } = await fetchArrayBuffer(safeDataUrl);
      safeDataUrl = `data:${contentType || "image/jpeg"};base64,${Buffer.from(buffer).toString("base64")}`;
    }
    safeDataUrl = await normalizeImageDataUrl(safeDataUrl);
  } catch {
    return NextResponse.json({ error: "Invalid image" }, { status: 400 });
  }

  // Build Gemini payload (text output)
  const inline = await imageToInlineData(safeDataUrl);
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: DESCRIPTION_PROMPT },
          { inlineData: { mimeType: inline.mimeType, data: inline.dataBase64 } },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "text/plain",
    },
  } as Record<string, unknown>;

  try {
    const data = await googleAiGenerate<unknown>(GOOGLE_TEXT_MODEL, payload, { cache: "no-store" });
    let text = "";
    try {
      const parts = (data as any)?.candidates?.[0]?.content?.parts || [];
      text = parts.map((p: any) => p?.text).filter((s: any) => typeof s === "string").join("\n");
    } catch {}
    text = (text || "").trim();
    if (!text) return NextResponse.json({ error: "Empty description" }, { status: 422 });

    // Persist into meta
    const metaPatch = { personDescriptionText: text, personDescriptionAt: new Date().toISOString() };
    await query(
      `UPDATE person_images SET meta = COALESCE(meta, '{}'::jsonb) || $1::jsonb WHERE id = $2 AND session_id = $3`,
      [JSON.stringify(metaPatch), id, session.user.id]
    );

    return NextResponse.json({ ok: true, id, descriptionText: text }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
