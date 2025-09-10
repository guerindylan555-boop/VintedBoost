export const GOOGLE_AI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent";

export async function googleAiFetch<T = unknown>(payload: Record<string, unknown>, init?: RequestInit): Promise<T> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY. Add it to .env.local (see .env.example).");
  }
  const res = await fetch(`${GOOGLE_AI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google AI error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

/**
 * Generic Gemini generateContent call for any model name.
 * Example models: "gemini-2.5-flash", "gemini-2.5-pro".
 */
export async function googleAiGenerate<T = unknown>(model: string, payload: Record<string, unknown>, init?: RequestInit): Promise<T> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY. Add it to .env.local (see .env.example).");
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(`${endpoint}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google AI error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}
