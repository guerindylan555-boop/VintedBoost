"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface EditorItem {
  index: number;
  image: string;
  data?: {
    pose?: string;
    style?: string;
    environment?: string;
  };
}

export default function EditorPage() {
  const router = useRouter();
  const [data, setData] = useState<EditorItem | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [pose, setPose] = useState("");
  const [style, setStyle] = useState("");
  const [env, setEnv] = useState("");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(1);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vb_editor_image");
      if (raw) {
        const parsed = JSON.parse(raw);
        setData(parsed);
        setImage(parsed.image);
        setPose(parsed.data?.pose || "");
        setStyle(parsed.data?.style || "");
        setEnv(parsed.data?.environment || "");
      } else router.replace("/run");
    } catch {
      router.replace("/run");
    }
  }, [router]);

  async function generateVariation() {
    if (!image) return;
    setLoading(true);
    try {
      const res = await fetch("/api/generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: image,
          options: { pose, style, environment: env },
          count: 1,
        }),
      });
      const json = await res.json();
      if (res.ok && json.images?.[0]) {
        setImage(json.images[0]);
        setVersion((v) => v + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  function saveAndReplace() {
    if (!image || !data) return;
    try {
      const last = localStorage.getItem("vb_last_result");
      if (last) {
        const parsed = JSON.parse(last);
        parsed.results[data.index] = image;
        localStorage.setItem("vb_last_result", JSON.stringify(parsed));
      }
    } catch {}
    router.back();
  }

  if (!image) return null;

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="sticky top-0 border-b bg-white px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-blue-600">
          Back
        </button>
        <div className="font-semibold">Edit image</div>
        <div className="text-sm text-gray-500">v{version}</div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <img src={image} alt="current" className="w-full rounded-xl" />
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Pose</label>
            <input
              type="text"
              value={pose}
              onChange={(e) => setPose(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Style</label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Environment</label>
            <input
              type="text"
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t bg-white p-4 flex gap-3">
        <button
          onClick={generateVariation}
          disabled={loading}
          className="flex-1 rounded-md bg-blue-600 text-white px-4 py-3 font-semibold"
        >
          {loading ? "Generating…" : "Generate variation"}
        </button>
        <button
          onClick={saveAndReplace}
          className="flex-1 rounded-md border px-4 py-3"
        >
          Save & replace
        </button>
      </footer>
    </div>
  );
}

