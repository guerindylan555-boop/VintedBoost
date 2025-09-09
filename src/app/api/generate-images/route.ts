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
  return (process.env.IMAGE_PROVIDER || "google").toLowerCase();
}

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
    const parts = (
      resp as { candidates?: Array<{ content?: { parts?: unknown[] } }> }
    )?.candidates?.[0]?.content?.parts || [];
    type Part = {
      inline_data?: { data?: string; mime_type?: string };
      inlineData?: { data?: string; mimeType?: string };
    };
    for (const p of parts as Part[]) {
      const d =
        (p.inline_data ?? p.inlineData) as {
          data?: string;
          mime_type?: string;
          mimeType?: string;
        };
      const mime = d.mime_type || d.mimeType;
      if (d.data && mime) {
        urls.push(`data:${mime};base64,${d.data}`);
      }
    }
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
        const parts = [
          { text: instruction },
          { inlineData: { mimeType, data: base64Data } },
        ];
        const payload = { contents: [{ role: "user", parts }] };
        const data = await googleAiFetch(payload, { cache: "no-store" });
        const urls = extractGoogleImageUrls(data);
        if (urls[0]) imagesOut.push(urls[0]);
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
