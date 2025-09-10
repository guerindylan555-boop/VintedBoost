import { NextRequest, NextResponse } from "next/server";
import {
  openrouterFetch,
  OpenRouterChatCompletionResponse,
  OpenRouterChatMessage,
} from "@/lib/openrouter";
import { googleAiFetch } from "@/lib/google-ai";
import { MannequinOptions, buildInstruction } from "@/lib/prompt";
import { normalizeImageDataUrl } from "@/lib/image";

export const runtime = "nodejs";

function getImageProvider() {
  const forced = (process.env.IMAGE_PROVIDER || "").toLowerCase();
  if (forced === "google" || forced === "openrouter") return forced;
  // Default to Google unless user explicitly selects OpenRouter
  return "google";
}

function getImageModel() {
  return (
    process.env.OPENROUTER_IMAGE_MODEL ||
    // Use a widely-available image model by default
    "fal-ai/flux-pro"
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

  function extractOpenRouterImageUrls(
    resp: OpenRouterChatCompletionResponse
  ): string[] {
    type ImagesPart = { image_url?: { url?: string } };
    type ChoiceMessage = { images?: ImagesPart[]; content?: unknown };
    type ChoiceDelta = { images?: ImagesPart[] };
    type Choice = { message?: ChoiceMessage; delta?: ChoiceDelta };

    const urls: string[] = [];
    const choice = (resp?.choices?.[0] || {}) as Choice;
    const direct = choice.message?.images || choice.delta?.images || [];
    for (const it of direct) {
      const u = it?.image_url?.url;
      if (typeof u === "string") urls.push(u);
    }
    const content = choice.message?.content;
    // Some providers may return a string content with embedded data URLs or http image links
    if (typeof content === "string") {
      const dataUrls = content.match(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g) || [];
      for (const u of dataUrls) urls.push(u);
      const httpUrls = content.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)/gi) || [];
      for (const u of httpUrls) urls.push(u);
    }
    // If content is array of parts with image_url
    if (Array.isArray(content)) {
      for (const part of content as Array<Record<string, unknown>>) {
        const u =
          (part?.image_url as { url?: string } | undefined)?.url ||
          (part?.url as string | undefined);
        if (typeof u === "string") urls.push(u);
      }
    }
    return Array.from(new Set(urls));
  }

  function extractGoogleImageUrls(resp: unknown): string[] {
    const urls: string[] = [];
    // Shape 1: Gemini generateContent style (inlineData)
    try {
      const parts = (
        resp as { candidates?: Array<{ content?: { parts?: unknown[] } }> }
      )?.candidates?.[0]?.content?.parts || [];
      for (const p of parts as Array<Record<string, unknown>>) {
        const d =
          (p as { inlineData?: { data?: string; mimeType?: string } }).inlineData ||
          (p as { inline_data?: { data?: string; mime_type?: string } }).inline_data;
        const data = d?.data as string | undefined;
        const mime =
          (d as { mimeType?: string })?.mimeType ||
          (d as { mime_type?: string })?.mime_type;
        if (data && mime) {
          urls.push(`data:${mime};base64,${data}`);
        }
      }
    } catch {}
    // Shape 2: Image Generation API (generatedImages[].image.bytesBase64Encoded)
    try {
      const gen = (resp as { generatedImages?: Array<{ image?: { bytesBase64Encoded?: string; mimeType?: string } }> })
        ?.generatedImages || [];
      for (const it of gen) {
        const b64 = it?.image?.bytesBase64Encoded as string | undefined;
        const mime = (it?.image?.mimeType as string | undefined) || "image/png";
        if (b64) urls.push(`data:${mime};base64,${b64}`);
      }
    } catch {}
    return Array.from(new Set(urls));
  }

  const match = safeImageDataUrl.match(
    /^data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)$/
  );
  if (!match) {
    return NextResponse.json(
      { error: "Invalid image data" },
      { status: 400 }
    );
  }
  const mimeType = match[1];
  const base64Data = match[2];

  const imagesOut: string[] = [];
  const instructionEchoes: string[] = [];
  const providerHeader = req.headers.get("x-image-provider");
  const provider =
    providerHeader === "openrouter" || providerHeader === "google"
      ? providerHeader
      : getImageProvider();
  try {
    for (let i = 0; i < n; i++) {
      const instruction = buildInstruction(
        options || {},
        productReference,
        i === 0 ? "pose principale" : i === 1 ? "léger mouvement" : "trois-quarts"
      );
      instructionEchoes.push(instruction);
      if (provider === "openrouter") {
        const messages: OpenRouterChatMessage[] = [
          {
            role: "system",
            content:
              "Tu génères UNIQUEMENT une image correspondant aux instructions. Ne retourne pas de texte.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: safeImageDataUrl } },
            ],
          },
        ];
        const payload = {
          model: getImageModel(),
          messages,
          modalities: ["image"],
          // Some providers honor this to prefer non-text responses
          max_output_tokens: 0,
        };
        const data = await openrouterFetch<OpenRouterChatCompletionResponse>(
          payload,
          { cache: "no-store" }
        );
        const urls = extractOpenRouterImageUrls(data);
        if (urls[0]) imagesOut.push(urls[0]);
      } else {
        // Google path: prefer Google always unless user explicitly switches provider
        {
          const parts = [
            { text: instruction },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ];
          const payload = {
            contents: [{ role: "user", parts }],
            // Relax safety where permitted by REST API enums
            safetySettings: [
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
            ],
          } as Record<string, unknown>;
          try {
            const data = await googleAiFetch(payload, { cache: "no-store" });
            const urls = extractGoogleImageUrls(data);
            if (urls[0]) imagesOut.push(urls[0]);
            // If still no image but we received text, surface it as an error hint
            if (!imagesOut[i]) {
              try {
                const firstText = ((data as any)?.candidates?.[0]?.content?.parts || [])
                  .map((p: any) => p?.text)
                  .filter((t: any) => typeof t === "string")[0];
                if (firstText) {
                  throw new Error(String(firstText).slice(0, 280));
                }
              } catch {}
            }
          } catch (e) {
            // If Google fails hard, we propagate the error after the loop
            throw e;
          }
        }
      }
    }

    if (imagesOut.length === 0) {
      return NextResponse.json(
        { error: "No image in response" },
        { status: 502 }
      );
    }
    const payload: { images: string[]; instructions?: string[] } = {
      images: imagesOut,
    };
    // Help debugging locally by returning the exact instructions
    try {
      if (process.env.NODE_ENV !== "production") {
        payload.instructions = instructionEchoes;
      }
    } catch {}
    return NextResponse.json(payload, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
