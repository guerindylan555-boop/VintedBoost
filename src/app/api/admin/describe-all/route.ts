import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { normalizeImageDataUrl, parseDataUrl } from "@/lib/image";
import { uploadDataUrlToS3, joinKey, extFromMime } from "@/lib/s3";
import { googleAiFetch } from "@/lib/google-ai";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";

export const runtime = "nodejs";

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

function buildBackgroundPrompt(): string {
  return [
    "You are an expert SCENE and BACKGROUND analyst.",
    "Describe ONLY the BACKGROUND environment of the input image in exhaustive detail.",
    "STRICTLY FORBIDDEN: any mention of people, bodies, faces, pose, hands, or what anyone wears; any mention of clothing/garments/accessories/outfits; any speculation about any subject/person.",
    "Ignore all foreground subjects. Focus exclusively on the static/background setting: architecture, surfaces, materials, textures, colors, patterns, signage or text visible in the background, environmental context (indoor/outdoor), furniture as part of background, weather, season cues, lighting (type, direction, quality), shadows/reflections, camera position/angle, depth of field, perspective lines, overall mood/ambience, cleanliness/age/wear of the environment.",
    "Perspective requirement: Assume the view is SEEN IN A LARGE WALL MIRROR, as if captured via a mirror shot. Describe the background from this reflected viewpoint. You MAY describe the mirror itself and optical artifacts of reflection, but DO NOT mention or imply any photographer or person.",
    "Return PLAIN ENGLISH PROSE ONLY — no lists, no markdown, no JSON, no code fences, no preambles.",
    "Minimum length: 1000 words.",
    "If the background is plain, expand on micro-texture, finish, lighting nuances, color casts, lens characteristics, bokeh, edges, and environmental clues.",
  ].join("\n");
}

function buildSubjectPrompt(): string {
  return [
    "You are an expert visual analyst. Describe ONLY the visible PERSON in the image.",
    "Cover: approximate age range, build, height impression, skin tone, hair (style, length, color), notable facial features, visible accessories, grooming, and overall vibe/style.",
    "Avoid sensitive inferences (no identity, no private attributes). Do not speculate beyond what is visible.",
    "If no person is present, respond with: 'No person detected.'",
    "Return PLAIN ENGLISH PROSE ONLY — no lists, no markdown, no JSON, no code fences, no preambles.",
    "Target length: 400–600 words.",
  ].join("\n");
}

function buildPosePrompt(): string {
  return [
    "Describe ONLY the SUBJECT'S POSE and body positioning.",
    "Include: camera viewpoint, body orientation, head tilt, gaze direction, weight distribution, limb positions, gestures, symmetry/asymmetry, balance, and stance.",
    "Mention props or support surfaces only if needed to clarify the pose. Do not describe clothing details beyond what is needed to understand posture.",
    "If no person is present, respond with: 'No person detected.'",
    "Return PLAIN ENGLISH PROSE ONLY — no lists, no markdown, no JSON, no code fences, no preambles.",
    "Target length: 300–500 words.",
  ].join("\n");
}

function sanitizeNoPersons(text: string): string {
  const terms = [
    /\b(person|people|human|woman|women|man|men|girl|boy|face|hand|hands|arm|arms|leg|legs|skin|hair|eyes|beard|model)\b/gi,
    /\b(personne|femme|homme|visage|main|mains|bras|jambe|jambes|peau|cheveux|yeux|mod[eè]le)\b/gi,
    /\b(clothing|clothes|garment|garments|apparel|outfit|shirt|t[- ]?shirt|tee|top|blouse|dress|skirt|pant|pants|trouser|jeans|denim|shorts?|leggings?|sock|socks|shoe|shoes|sneaker|sneakers|boot|boots|heel|heels|sandal|sandals|coat|jacket|hoodie|sweater|cardigan|jumper|pullover|vest|tracksuit|suit|tie|scarf|hat|cap|beanie|glove|gloves|belt|bag|purse|handbag|jewel(?:ry|lery)|ring|necklace|bracelet|earrings?|watch)\b/gi,
    /\b(v[eê]tement|v[eê]tements|habit|habits|robe|jupe|pantalon|jeans?|denim|chemise|chemisier|t[- ]?shirt|tee[- ]?shirt|haut|pull|cardigan|gilet|sweat|manteau|veste|doudoune|imperme[áa]ble|short|leggings?|chaussette|chaussettes|chaussure|chaussures|baskets?|bottes?|talons?|sandales?|echarpe|écharpe|chapeau|casquette|bonnet|gant|gants|ceinture|sac|sac à main|bijou|bijoux|bague|collier|bracelet|boucles? d['’]oreille|montre)\b/gi,
  ];
  let out = text;
  for (const r of terms) out = out.replace(r, "");
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = session.user?.email || null;
  if (!isAdminEmail(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { imageDataUrl?: string } | null;
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

  const m = safeDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
  const mimeType = m[1];
  const base64Data = m[2];

  // Upload to S3 once if configured
  let storedSource: string = safeDataUrl;
  if (process.env.AWS_S3_BUCKET && safeDataUrl?.startsWith("data:")) {
    try {
      const ext = extFromMime(mimeType);
      const assetId = randomUUID();
      const key = joinKey("users", session.user.id, "admin", "describe", `${assetId}.${ext}`);
      const { url } = await uploadDataUrlToS3(safeDataUrl, key);
      storedSource = url;
    } catch {}
  }

  const backgroundPrompt = buildBackgroundPrompt();
  const subjectPrompt = buildSubjectPrompt();
  const posePrompt = buildPosePrompt();

  const payloadBase = {
    contents: [
      { role: "user", parts: [{ inline_data: { mime_type: mimeType, data: base64Data } }] },
    ],
    safetySettings: [
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  } as Record<string, unknown>;

  const bgPayload = {
    ...payloadBase,
    contents: [
      ...(payloadBase.contents as any[]),
      { role: "user", parts: [{ text: "Ignore or remove any person, body, face, or clothing/accessories from consideration. We will ONLY work with the background environment of this image." }] },
      { role: "user", parts: [{ text: backgroundPrompt }] },
    ],
  };
  const subjPayload = {
    ...payloadBase,
    contents: [
      ...(payloadBase.contents as any[]),
      { role: "user", parts: [{ text: subjectPrompt }] },
    ],
  };
  const posePayload = {
    ...payloadBase,
    contents: [
      ...(payloadBase.contents as any[]),
      { role: "user", parts: [{ text: posePrompt }] },
    ],
  };

  let bgText: string | null = null;
  let subjText: string | null = null;
  let poseText: string | null = null;
  let bgErr: string | null = null;
  let subjErr: string | null = null;
  let poseErr: string | null = null;

  try {
    const [bgResp, subjResp, poseResp] = await Promise.all([
      googleAiFetch<any>(bgPayload, { cache: "no-store" }).catch((e) => ({ __error: String(e?.message || e) })),
      googleAiFetch<any>(subjPayload, { cache: "no-store" }).catch((e) => ({ __error: String(e?.message || e) })),
      googleAiFetch<any>(posePayload, { cache: "no-store" }).catch((e) => ({ __error: String(e?.message || e) })),
    ]);

    if ((bgResp as any).__error) bgErr = (bgResp as any).__error as string; else bgText = extractFirstTextPart(bgResp);
    if ((subjResp as any).__error) subjErr = (subjResp as any).__error as string; else subjText = extractFirstTextPart(subjResp);
    if ((poseResp as any).__error) poseErr = (poseResp as any).__error as string; else poseText = extractFirstTextPart(poseResp);

    if (bgText) bgText = sanitizeNoPersons(bgText);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }

  // Ensure table/columns
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

  const saved: { background?: { id: string; descriptionText: string }; subject?: { id: string; descriptionText: string }; pose?: { id: string; descriptionText: string } } = {};

  async function saveOne(kind: 'background'|'subject'|'pose', text: string) {
    const id = randomUUID();
    const origin = kind === 'background' ? 'admin_background_v1' : kind === 'subject' ? 'admin_subject_v1' : 'admin_pose_v1';
    const description = { title: null, descriptionText: text, attributes: {}, origin, kind } as Record<string, unknown>;
    await query(
      `INSERT INTO history_items (id, session_id, created_at, source_image, results, description)
       VALUES ($1, $2, NOW(), $3, $4::jsonb, $5::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         source_image = EXCLUDED.source_image,
         results = EXCLUDED.results,
         description = EXCLUDED.description`,
      [id, session.user.id, storedSource, JSON.stringify([]), JSON.stringify(description)]
    );
    (saved as any)[kind] = { id, descriptionText: text };
  }

  try {
    const ops: Promise<void>[] = [];
    if (bgText) ops.push(saveOne('background', bgText));
    if (subjText) ops.push(saveOne('subject', subjText));
    if (poseText) ops.push(saveOne('pose', poseText));
    await Promise.all(ops);
  } catch (e) {
    // continue; some may have saved already
  }

  return NextResponse.json({
    background: saved.background || (bgErr ? { error: bgErr } : null),
    subject: saved.subject || (subjErr ? { error: subjErr } : null),
    pose: saved.pose || (poseErr ? { error: poseErr } : null),
    source: storedSource,
  });
}
