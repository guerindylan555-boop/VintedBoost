"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Description {
  title?: string;
  bulletPoints?: string[];
  descriptionText?: string;
  [key: string]: unknown;
}

interface HistoryItem {
  id: string;
  createdAt: number;
  source: string;
  results: string[];
  description?: Description;
}

interface GenPayload {
  imageDataUrl: string;
  pose?: string;
  style?: string;
  environment?: string;
  language?: string;
}

export default function ResultsPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [imageStep, setImageStep] = useState(0);
  const [description, setDescription] = useState<Description | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = sessionStorage.getItem("vb_generate_payload");
    if (!raw) {
      router.replace("/generate");
      return;
    }
    const payload: GenPayload = JSON.parse(raw);
    async function run() {
      setStep(1); // analyzing photos
      await new Promise((r) => setTimeout(r, 300));
      setStep(2); // building product details
      let desc: Description | null = null;
      try {
        const res = await fetch("/api/describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productReference: "", options: {}, hints: "" }),
        });
        desc = await res.json();
      } catch {}
      setDescription(desc);
      setStep(3); // writing description
      await new Promise((r) => setTimeout(r, 300));
      setStep(4); // creating images
      const imgs: string[] = [];
      for (let i = 0; i < 3; i++) {
        setImageStep(i + 1);
        try {
          const res = await fetch("/api/generate-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageDataUrl: payload.imageDataUrl,
              options: {
                pose: payload.pose,
                style: payload.style,
                environment: payload.environment,
              },
              count: 1,
            }),
          });
          const json = await res.json();
          if (Array.isArray(json.images) && json.images[0]) {
            imgs.push(json.images[0]);
          }
        } catch {}
      }
      setImages(imgs);
      const item = {
        id: `${Date.now()}`,
        createdAt: Date.now(),
        source: payload.imageDataUrl,
        results: imgs,
        description: desc,
      };
      try {
        localStorage.setItem("vintedboost_last", JSON.stringify(item));
        const rawHist = localStorage.getItem("vintedboost_history");
        const hist = rawHist ? JSON.parse(rawHist) : [];
        hist.unshift(item);
        localStorage.setItem("vintedboost_history", JSON.stringify(hist.slice(0, 50)));
      } catch {}
      sessionStorage.setItem("vb_last_result", JSON.stringify(item));
      setLoading(false);
    }
    run();
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-gray-50 to-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between px-4 py-3">
          <button onClick={() => router.push("/generate")} className="text-sm text-gray-600">
            Close
          </button>
          <h1 className="text-base font-semibold">
            {loading ? "Generating…" : "Results"}
          </h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-sm flex-1 p-4 pb-24">
        {loading ? (
          <div className="space-y-4">
            <ol className="space-y-1 text-sm">
              <li className={step >= 1 ? "text-gray-900" : "text-gray-400"}>1. Analyzing photos</li>
              <li className={step >= 2 ? "text-gray-900" : "text-gray-400"}>2. Building product details</li>
              <li className={step >= 3 ? "text-gray-900" : "text-gray-400"}>3. Writing description</li>
              <li className={step >= 4 ? "text-gray-900" : "text-gray-400"}>
                4. Creating images ({imageStep}/3)
              </li>
            </ol>
            <div className="h-24 w-full animate-pulse rounded-md bg-gray-200" />
            <div className="grid grid-cols-3 gap-2">
              <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-gray-200" />
              <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-gray-200" />
              <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-gray-200" />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {description && (
              <div className="rounded-2xl border border-gray-200 bg-white/70 backdrop-blur p-4 shadow-sm">
                <h2 className="text-sm font-semibold mb-2">{description.title || "Description"}</h2>
                {Array.isArray(description.bulletPoints) && (
                  <ul className="list-disc pl-5 text-sm">
                    {description.bulletPoints.map((b: string, i: number) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => navigator.clipboard.writeText(description.descriptionText || "")}
                  className="mt-2 text-sm text-blue-600"
                >
                  Copy
                </button>
              </div>
            )}
            <div className="space-y-3">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  <img
                    src={img}
                    alt={`generated ${i + 1}`}
                    className="w-full rounded-lg border object-cover"
                    style={{ aspectRatio: "4/5" }}
                  />
                  <div className="mt-1 flex gap-2 text-xs">
                    <button
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = img;
                        a.download = `image_${i + 1}.png`;
                        a.click();
                      }}
                      className="text-blue-600"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => router.push(`/editor/${i}`)}
                      className="text-blue-600"
                    >
                      Continue editing
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="sticky bottom-0 border-t border-gray-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-screen-sm px-4 py-3 flex flex-col gap-2">
          <button className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Save listing
          </button>
          <button className="w-full text-sm text-gray-600">Download all (ZIP)</button>
        </div>
      </footer>
    </div>
  );
}
