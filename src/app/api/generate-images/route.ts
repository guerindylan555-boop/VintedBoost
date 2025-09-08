import { NextRequest, NextResponse } from "next/server";
import {
  openrouterFetch,
  OpenRouterChatCompletionResponse,
  OpenRouterChatMessage,
} from "@/lib/openrouter";
import { MannequinOptions, buildInstruction } from "@/lib/prompt";

export const runtime = "nodejs";

function getImageModel() {
  return (
    process.env.OPENROUTER_IMAGE_MODEL ||
    "google/gemini-2.5-flash-image-preview"
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
