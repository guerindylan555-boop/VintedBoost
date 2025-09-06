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
    // Requested default; if unavailable, callers can set env above
    "openai/gpt-5-mini"
  );
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // try to extract a JSON object from text
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

export const runtime = "nodejs"; // ensures Node runtime for fetch/env

export async function POST(req: NextRequest) {
  const { productReference, options, hints } = (await req.json()) as {
    productReference: string;
    options?: {
      gender?: string;
      morphology?: string;
      style?: string;
    };
    hints?: string;
  };

  if (!productReference || typeof productReference !== "string") {
    return NextResponse.json(
      { error: "Missing productReference" },
      { status: 400 }
    );
  }

  const systemPrompt = `Tu es un assistant e-commerce expert Vinted. Tu écris en FRANÇAIS uniquement, ton style est clair, concis et vendeur sans superlatifs abusifs. Tu sors un JSON strict sans texte hors JSON.`;

  const userPrompt = `À partir de la référence produit (marque/modèle/EAN ou lien) et des indices fournis, extrait les informations utiles et rédige une fiche Vinted structurée. Retourne UNIQUEMENT un JSON avec:
{
  "title": string,
  "brand": string | null,
  "model": string | null,
  "category": string | null,
  "condition": string, // neuf, très bon état, bon état, satisfaisant
  "defects": string[], // ex: "micro-traces manche", "étiquette manquante"
  "measurements": { "longueur": string|null, "poitrine": string|null, "épaules": string|null, "manches": string|null },
  "care": string[], // conseils d’entretien
  "keywords": string[],
  "bulletPoints": string[],
  "descriptionText": string // 3–5 phrases, ton naturel et précis
}

Référence produit: ${productReference}
Options mannequin (pour le ton et sizing si utile): ${JSON.stringify(
    options || {}
  )}
Indices: ${hints || "(aucun)"}`;

  const messages: OpenRouterChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const payload = {
    model: getTextModel(),
    messages,
    // Prefer JSON output if supported by provider
    response_format: { type: "json_object" },
  };

  try {
    const data = await openrouterFetch<OpenRouterChatCompletionResponse>(
      payload
    );
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse<Record<string, unknown>>(String(content));
    if (!parsed) {
      return NextResponse.json({ raw: content }, { status: 200 });
    }
    return NextResponse.json(parsed, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
