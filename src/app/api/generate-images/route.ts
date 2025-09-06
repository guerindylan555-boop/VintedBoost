import { NextRequest, NextResponse } from "next/server";
import {
  openrouterFetch,
  OpenRouterChatCompletionResponse,
  OpenRouterChatMessage,
} from "@/lib/openrouter";

type MannequinOptions = {
  gender?: string; // "femme", "homme", "unisex", "enfant"
  morphology?: string; // ex: "S", "M", "L", "athletic", "petite"
  pose?: string; // ex: "face", "trois-quarts", "assis", "marche"
  background?: string; // ex: "fond blanc", "gris neutre", "béton"
};

export const runtime = "nodejs";

function getImageModel() {
  return (
    process.env.OPENROUTER_IMAGE_MODEL ||
    "google/gemini-2.5-flash-image-preview"
  );
}

function buildInstruction(
  opts: MannequinOptions,
  productReference?: string,
  variantLabel?: string
) {
  const gender = opts.gender || "unisex";
  const morph = opts.morphology || "standard";
  const pose = opts.pose || "face";
  const bg = opts.background || "fond blanc studio";

  const refText = productReference
    ? `Référence produit: ${productReference}. `
    : "";

  const variant = variantLabel ? `Variante: ${variantLabel}. ` : "";

  return (
    `${refText}${variant}` +
    `Transforme la photo du vêtement non porté en une photo portée réaliste.` +
    ` Garde la fidélité des couleurs, matières, motifs et coutures.` +
    ` Présente le vêtement sur un mannequin/humain (${gender}, morphologie ${morph}),` +
    ` en pose ${pose}, fond ${bg}.` +
    ` Style: studio e-commerce, éclairage doux diffus, 50mm équivalent.` +
    ` Ratio 4:5, définition haute, sans texte ni watermark.` +
    ` Respecte la perspective et la structure du vêtement original.`
  );
}

export async function POST(req: NextRequest) {
  const { imageDataUrl, options, productReference, count } = (await req.json()) as {
    imageDataUrl: string; // Data URL (data:image/...;base64,...)
    options?: MannequinOptions;
    productReference?: string;
    count?: number; // default 1
  };

  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return NextResponse.json({ error: "Missing imageDataUrl" }, { status: 400 });
  }

  const n = Math.min(Math.max(Number(count) || 1, 1), 3);

  const imagesOut: string[] = [];
  try {
    for (let i = 0; i < n; i++) {
      const instruction = buildInstruction(
        options || {},
        productReference,
        i === 0 ? "pose principale" : i === 1 ? "léger mouvement" : "trois-quarts"
      );
      const messages: OpenRouterChatMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ];
      const payload = {
        model: getImageModel(),
        messages,
        modalities: ["image", "text"],
      };

      const data = await openrouterFetch<OpenRouterChatCompletionResponse>(
        payload,
        { cache: "no-store" }
      );
      const imgs =
        data?.choices?.[0]?.message?.images ||
        data?.choices?.[0]?.delta?.images ||
        [];
      const firstUrl = imgs[0]?.image_url?.url;
      if (firstUrl) imagesOut.push(firstUrl);
    }

    if (imagesOut.length === 0) {
      return NextResponse.json(
        { error: "No image in response" },
        { status: 502 }
      );
    }
    return NextResponse.json({ images: imagesOut }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
