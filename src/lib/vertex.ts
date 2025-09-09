export async function vertexFetch(
  instruction: string,
  imageDataUrl: string,
): Promise<string[]> {
  const projectId = process.env.VERTEX_PROJECT_ID;
  const location = process.env.VERTEX_LOCATION;
  const apiKey = process.env.VERTEX_API_KEY;
  if (!projectId || !location || !apiKey) {
    throw new Error(
      "Missing VERTEX_PROJECT_ID, VERTEX_LOCATION or VERTEX_API_KEY. Add them to .env.local (see .env.example).",
    );
  }
  const model = process.env.VERTEX_IMAGE_MODEL || "gemini-2.5-flash-image-preview";
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent?key=${apiKey}`;

  const match = imageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  const mimeType = match[1];
  const data = match[2];

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: instruction },
          { inline_data: { mime_type: mimeType, data } },
        ],
      },
    ],
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vertex AI error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inline_data?: { mime_type?: string; data?: string } }> } }>;
  };
  const images: string[] = [];
  for (const c of json.candidates || []) {
    for (const p of c.content?.parts || []) {
      const d = p.inline_data?.data;
      if (d) {
        const mime = p.inline_data?.mime_type || mimeType || "image/png";
        images.push(`data:${mime};base64,${d}`);
      }
    }
  }
  return images;
}
