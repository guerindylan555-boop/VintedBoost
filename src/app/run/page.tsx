"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PendingData {
  photos: string[];
  reference: string;
  pose?: string;
  style?: string;
  environment?: string;
  language?: string;
  addNote?: boolean;
}

const steps = [
  "Analyzing photos",
  "Building product details",
  "Writing description",
  "Creating images",
];

export default function RunPage() {
  const router = useRouter();
  const [data, setData] = useState<PendingData | null>(null);
  const [step, setStep] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vb_pending_generate");
      if (raw) setData(JSON.parse(raw));
      else router.replace("/generate");
    } catch {
      router.replace("/generate");
    }
  }, [router]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    async function run() {
      for (let i = 0; i < steps.length - 1; i++) {
        setStep(i);
        await new Promise((r) => setTimeout(r, 500));
        if (cancelled) return;
      }
      setStep(3);
      try {
        const res = await fetch("/api/generate-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: data.photos?.[0],
            options: {
              pose: data.pose,
              style: data.style,
              environment: data.environment,
            },
            count: 3,
          }),
        });
        const json = await res.json();
        if (res.ok && Array.isArray(json.images)) {
          setImages(json.images);
          setDescription(`${data.reference} — generated`);
          const item = {
            id: `${Date.now()}`,
            createdAt: Date.now(),
            source: data.photos?.[0],
            results: json.images,
          };
          try {
            const raw = localStorage.getItem("vb_history");
            const hist = raw ? JSON.parse(raw) : [];
            localStorage.setItem(
              "vb_history",
              JSON.stringify([item, ...hist].slice(0, 50))
            );
            localStorage.setItem("vb_last_result", JSON.stringify(item));
          } catch {}
        } else {
          router.replace("/generate");
        }
      } catch {
        router.replace("/generate");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [data, router]);

  if (!data) return null;

  const loading = images.length === 0;

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="sticky top-0 border-b bg-white px-4 py-3 text-center font-semibold">
        {loading ? "Generating…" : "Results"}
      </header>

      {loading && (
        <div className="p-4 space-y-4">
          <ol className="space-y-2 text-sm">
            {steps.map((s, i) => (
              <li key={s} className={i <= step ? "text-gray-900" : "text-gray-400"}>
                {s}
              </li>
            ))}
          </ol>
          <div className="h-24 bg-gray-200 animate-pulse rounded" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-32 bg-gray-200 animate-pulse rounded" />
            <div className="h-32 bg-gray-200 animate-pulse rounded" />
            <div className="h-32 bg-gray-200 animate-pulse rounded" />
          </div>
        </div>
      )}

      {!loading && (
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-xl border p-4">
            <div className="font-medium mb-2">{description}</div>
            <button
              onClick={() => navigator.clipboard.writeText(description)}
              className="text-sm text-blue-600"
            >
              Copy
            </button>
          </div>
          <div className="space-y-3">
            {images.map((img, i) => (
              <div key={i} className="relative">
                <img src={img} alt={`result ${i}`} className="w-full rounded-xl" />
                <button
                  onClick={() => {
                    try {
                      localStorage.setItem(
                        "vb_editor_image",
                        JSON.stringify({ index: i, image: img, data })
                      );
                    } catch {}
                    router.push("/editor");
                  }}
                  className="absolute inset-0"
                  title="Continue editing"
                />
              </div>
            ))}
          </div>
        </main>
      )}

      {!loading && (
        <footer className="sticky bottom-0 border-t bg-white p-4 flex gap-3">
          <button className="flex-1 rounded-md bg-blue-600 text-white px-4 py-3 font-semibold">
            Save listing
          </button>
          <button className="flex-1 rounded-md border px-4 py-3">
            Download all
          </button>
        </footer>
      )}
    </div>
  );
}

