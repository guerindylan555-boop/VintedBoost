import { NextRequest, NextResponse } from "next/server";
import {
  openrouterFetch,
  OpenRouterChatCompletionResponse,
  OpenRouterChatMessage,
} from "@/lib/openrouter";
import { googleAiGenerate } from "@/lib/google-ai";
import { normalizeImageDataUrl } from "@/lib/image";

// Models
const OPENROUTER_TEXT_MODEL = "openai/gpt-5-mini";
const GOOGLE_TEXT_MODEL = process.env.GOOGLE_TEXT_MODEL || "gemini-2.5-flash";

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}$/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { imageDataUrl, product, hints } = (await req.json()) as {
    imageDataUrl: string;
    product?: { brand?: string | null; model?: string | null; gender?: string | null; size?: string | null; condition?: string | null };
    hints?: string; // free text hints from UI if needed
  };

  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return NextResponse.json({ error: "Missing imageDataUrl" }, { status: 400 });
  }

  const meta = {
    brand: product?.brand || null,
    model: product?.model || null,
    gender: product?.gender || null,
    size: product?.size || null,
    condition: product?.condition || null,
  };

  const system =
    "Tu es un assistant e-commerce Vinted. Rédige en FRANÇAIS clair, précis et vendeur sans superlatifs excessifs. Réponds UNIQUEMENT en JSON strict (json_object).";

  const instruction =
    [
      "À partir de la photo du vêtement NON porté et des informations de la carte ‘Infos vêtement’ (marque, modèle, genre, taille, état quand présents), rédige UNE SEULE description Vinted complète.",
      "Respecte ces consignes (inspirées des meilleures pratiques Vinted) :",
      "- Structure claire: titre concis (type d’article + marque + taille/atout), puis détails (matière, couleur, coupe), usages/occasions, avantages concrets, état et défauts éventuels, conclusion rassurante (envoi soigné, dispo pour questions).",
      "- Ton: amical et professionnel, positif sans superlatifs vagues; phrases courtes, honnêtes et précises; orthographe soignée.",
      "- Mots-clés/hashtags: inclure 3–5 mots-clés pertinents (marque, catégorie, style, saison/occasion).",
      "- Transparence: ne rien inventer; si une info est incertaine sur la photo, rester neutre ou omettre.",
    ].join(" ");

  const requiredJsonShape = `Retourne strictement un JSON avec les clés suivantes:
{
  "title": string,
  "brand": string | null,
  "model": string | null,
  "category": string | null,
  "condition": string, // neuf, très bon état, bon état, satisfaisant
  "colors": string[] | null, // couleurs dominantes si visibles
  "materials": string[] | null, // si visibles
  "measurements": { "longueur": string|null, "poitrine": string|null, "epaules": string|null, "manches": string|null },
  "defects": string[],
  "care": string[],
  "keywords": string[],
  "hashtags": string[], // 3-5 tags pertinents
  "bulletPoints": string[],
  "descriptionText": string // 3–5 phrases, ton naturel, clair et vendeur
}`;

  const metaText = `Infos vêtement: ${JSON.stringify(meta)}\nIndices: ${hints || "(aucun)"}`;

  // Normalize input image (handle HEIC/unknown → JPEG, max 2048px)
  let safeImageDataUrl = imageDataUrl;
  try {
    safeImageDataUrl = await normalizeImageDataUrl(imageDataUrl);
  } catch {
    return NextResponse.json(
      { error: "The image data provided is invalid or unsupported." },
      { status: 400 }
    );
  }

  const messages: OpenRouterChatMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        { type: "text", text: instruction },
        { type: "text", text: requiredJsonShape },
        { type: "text", text: metaText },
        { type: "image_url", image_url: { url: safeImageDataUrl } },
      ],
    },
  ];

  // Provider selection: default to Google unless explicitly overridden
  const providerHeader = req.headers.get("x-image-provider");
  const provider = providerHeader === "openrouter" ? "openrouter" : "google";

  // Google path (default)
  if (provider === "google") {
    try {
      const parts = [
        { text: `${system}\n\n${instruction}\n\n${requiredJsonShape}\n\n${metaText}` },
        { inline_data: { mime_type: safeImageDataUrl.split(":")[1]?.split(";")[0] || "image/jpeg", data: safeImageDataUrl.split(",")[1] } },
      ];
      const payload = {
        contents: [{ role: "user", parts }],
        generationConfig: {
          // Bias for JSON outputs
          response_mime_type: "application/json",
        },
        safetySettings: [
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      } as Record<string, unknown>;
      const data = await googleAiGenerate(GOOGLE_TEXT_MODEL, payload);
      const content = (data as any)?.candidates?.[0]?.content;
      const text = Array.isArray(content?.parts)
        ? content.parts.map((p: any) => p?.text).filter((t: any) => typeof t === "string").join("\n")
        : "";
      const parsed = safeJsonParse<Record<string, unknown>>(String(text || ""));
      if (!parsed) {
        // Friendly error for policy blocks
        return NextResponse.json(
          { error: "Google a refusé la description (politique de sécurité). Modifiez l'image ou les options, puis réessayez." },
          { status: 422 }
        );
      }
      return NextResponse.json(parsed, { status: 200 });
    } catch (err: unknown) {
      // On Google errors, fall back to OpenRouter
    }
  }

  // OpenRouter fallback / explicit selection
  const payload = {
    model: OPENROUTER_TEXT_MODEL,
    messages,
    response_format: { type: "json_object" },
  };
  try {
    const data = await openrouterFetch<OpenRouterChatCompletionResponse>(payload);
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse<Record<string, unknown>>(String(content));
    if (!parsed) {
      return NextResponse.json({ raw: content }, { status: 200 });
    }
    return NextResponse.json(parsed, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
