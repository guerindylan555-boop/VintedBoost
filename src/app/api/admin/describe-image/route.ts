import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { normalizeImageDataUrl, parseDataUrl } from "@/lib/image";
import { googleAiFetch } from "@/lib/google-ai";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";

export const runtime = "nodejs";

function buildPrompt(): string {
  return (
    [
      "You are an expert product and scene analyst.",
      "Describe the input image in exhaustive detail, but strictly avoid any mention, inference, or description of people, body parts, gender, age, or identity.",
      "If a person is present, ignore them entirely. Focus only on non-person content (objects, garments, accessories, logos/text, materials, colors, textures, patterns, visible wear/defects, environment/background, lighting, camera angle, brand hints).",
      "Output valid JSON only, no markdown, no commentary. Use this schema:",
      "{",
      "  \"title\": string,",
      "  \"descriptionText\": string,",
      "  \"attributes\": {",
      "    \"colors\": string[],",
      "    \"materials\": string[],",
      "    \"patterns\": string[],",
      "    \"logosOrText\": string[],",
      "    \"defectsOrWear\": string[],",
      "    \"dimensionsOrFit\": string | null,",
      "    \"background\": string | null,",
      "    \"lighting\": string | null,",
      "    \"cameraAngle\": string | null,",
      "    \"brandGuesses\": string[]",
      "  }",
      "}",
      "The \"descriptionText\" must be precise, concise, and in English, with no person references.",
    ].join("\n")
  );
}

function sanitizeNoPersons(text: string): string {
  const terms = [
    // English
    /\b(person|people|human|woman|women|man|men|girl|boy|face|hand|hands|arm|arms|leg|legs|skin|hair|eyes|beard|model)\b/gi,
    // French (common terms)
    /\b(personne|femme|homme|visage|main|mains|bras|jambe|jambes|peau|cheveux|yeux|mod[eè]le)\b/gi,
  ];
  let out = text;
  for (const r of terms) out = out.replace(r, "");
  // Collapse excessive spaces/newlines after removal
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

function extractFirstTextPart(resp: any): string | null {
  try {
    const parts = resp?.candidates?.[0]?.content?.parts || [];
    for (const p of parts as Array<Record<string, any>>) {
      const t = p?.text;
      if (typeof t === "string" && t.trim()) return t;
    }
  } catch {}
  return null;
}

function tryParseJson(text: string): any | null {
  try { return JSON.parse(text); } catch {}
  // Attempt to extract the first JSON object
  try {
    const m = text.match(/[\{\[][\s\S]*[\}\]]/);
    if (m) return JSON.parse(m[0]);
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = session.user?.email || null;
  if (!isAdminEmail(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as { imageDataUrl?: string } | null;
  const imageDataUrl = body?.imageDataUrl;
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return NextResponse.json({ error: "Missing imageDataUrl" }, { status: 400 });
  }

  // Normalize and basic size guard
  let safeDataUrl = imageDataUrl;
  try {
    safeDataUrl = await normalizeImageDataUrl(imageDataUrl);
    const { mime, buffer } = parseDataUrl(safeDataUrl);
    if (!mime.startsWith("image/")) throw new Error("Unsupported type");
    if (buffer.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 413 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Invalid image" }, { status: 400 });
  }

  // Prepare inline_data
  const m = safeDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
  const mimeType = m[1];
  const base64Data = m[2];

  const prompt = buildPrompt();

  try {
    const payload = {
      contents: [
        { role: "user", parts: [ { inline_data: { mime_type: mimeType, data: base64Data } }, { text: prompt } ] },
      ],
      safetySettings: [
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    } as Record<string, unknown>;

    const resp = await googleAiFetch<any>(payload, { cache: "no-store" });
    const text = extractFirstTextPart(resp);
    if (!text) return NextResponse.json({ error: "No text response from model" }, { status: 502 });

    const parsed = tryParseJson(text);
    let title = "";
    let descriptionText = "";
    let attributes: Record<string, unknown> = {};
    if (parsed && typeof parsed === "object") {
      title = String(parsed.title || "");
      descriptionText = String(parsed.descriptionText || "");
      attributes = (parsed.attributes && typeof parsed.attributes === "object") ? parsed.attributes as Record<string, unknown> : {};
    } else {
      descriptionText = text;
    }

    // Sanitize as last resort
    descriptionText = sanitizeNoPersons(descriptionText);
    if (title) title = sanitizeNoPersons(title);

    // Persist into history_items (create if not exists, ensure description column)
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS history_items (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          source_image TEXT NOT NULL,
          results JSONB NOT NULL
        );`
      );
      await query(`ALTER TABLE history_items ADD COLUMN IF NOT EXISTS description JSONB`);
    } catch {}

    const id = randomUUID();
    const description = {
      title: title || null,
      descriptionText,
      attributes: attributes || {},
      origin: "admin_extract_v1",
      removedPersons: true,
    } as Record<string, unknown>;

    try {
      await query(
        `INSERT INTO history_items (id, session_id, created_at, source_image, results, description)
         VALUES ($1, $2, NOW(), $3, $4::jsonb, $5::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           source_image = EXCLUDED.source_image,
           results = EXCLUDED.results,
           description = EXCLUDED.description`,
        [id, session.user.id, safeDataUrl, JSON.stringify([]), JSON.stringify(description)]
      );
    } catch (e) {
      return NextResponse.json({ error: "Failed to save description" }, { status: 500 });
    }

    return NextResponse.json({ id, title, descriptionText, attributes, removedPersons: true, saved: true }, { status: 200 });
  } catch (err: any) {
    const msg = String(err?.message || err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
