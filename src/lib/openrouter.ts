export type OpenRouterChatMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface OpenRouterChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenRouterChatMessagePart[];
}

export interface OpenRouterImagesResponseImageUrl {
  type: "image_url";
  image_url: { url: string };
}

export interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
      images?: OpenRouterImagesResponseImageUrl[];
    };
    delta?: {
      images?: OpenRouterImagesResponseImageUrl[];
    };
  }>;
}

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function openrouterFetch<T = OpenRouterChatCompletionResponse>(
  payload: Record<string, unknown>,
  init?: RequestInit
): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Add it to .env.local (see .env.example)."
    );
  }
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(process.env.OPENROUTER_HTTP_REFERER
        ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
        : {}),
      ...(process.env.OPENROUTER_X_TITLE
        ? { "X-Title": process.env.OPENROUTER_X_TITLE }
        : {}),
    },
    body: JSON.stringify(payload),
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

