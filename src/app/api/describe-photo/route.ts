import { NextRequest, NextResponse } from "next/server";
import {
  openrouterFetch,
  OpenRouterChatCompletionResponse,
  OpenRouterChatMessage,
} from "@/lib/openrouter";

function getTextModel() {
  return (
    process.env.OPENROUTER_TEXT_MODEL ||
    process.env.TEXT_MODEL ||
    // default requested by user
    "openai/gpt-5-mini"
  );
}

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

  const messages: OpenRouterChatMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        { type: "text", text: instruction },
        { type: "text", text: requiredJsonShape },
        { type: "text", text: metaText },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ];

  const payload = {
    model: getTextModel(),
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
