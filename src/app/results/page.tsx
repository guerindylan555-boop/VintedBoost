"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addHistory, HistoryItem } from "@/lib/history";

const steps = [
  "Analyzing photos",
  "Building product details",
  "Writing description",
  "Creating images",
];

export default function ResultsPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("vintedboost_pending");
    if (!raw) {
      router.replace("/generate");
      return;
    }
    const pending = JSON.parse(raw) as {
      source: string;
      options: Record<string, unknown>;
    };

    async function run() {
      setStep(0);
      await new Promise((r) => setTimeout(r, 500));
      setStep(1);
      await new Promise((r) => setTimeout(r, 500));
      setStep(2);
      await new Promise((r) => setTimeout(r, 500));
      setStep(3);
      try {
        const res = await fetch("/api/generate-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: pending.source,
            options: pending.options || {},
            count: 3,
          }),
        });
        const json = await res.json();
        const imgs = (json.images || []) as string[];
        setImages(imgs);
        const item: HistoryItem = {
          id: `${Date.now()}`,
          createdAt: Date.now(),
          source: pending.source,
          results: imgs,
        };
        addHistory(item);
      } catch {
        // ignore errors
      }
      setLoading(false);
    }
    run();
  }, [router]);

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.push("/generate")}>Close</button>
        <h1 className="text-base font-medium">
          {loading ? "Generating…" : "Results"}
        </h1>
        <div />
      </header>
      <main className="flex-1 p-4 space-y-4">
        {loading ? (
          <div className="space-y-4">
            <ol className="space-y-2 text-sm">
              {steps.map((s, i) => (
                <li key={s} className={i <= step ? "text-gray-900" : "text-gray-400"}>
                  {i < step ? "✔ " : "• "}
                  {s}
                </li>
              ))}
            </ol>
            <div className="h-24 w-full rounded-md bg-gray-100 animate-pulse" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-24 bg-gray-100 animate-pulse" />
              <div className="h-24 bg-gray-100 animate-pulse" />
              <div className="h-24 bg-gray-100 animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-4">
              <h2 className="font-medium mb-2">Generated description</h2>
              <p className="text-sm text-gray-600">
                Description not implemented.
              </p>
              <button
                className="mt-2 rounded border px-3 py-1 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText("Description not implemented.");
                }}
              >
                Copy
              </button>
            </div>
            <div className="grid gap-3">
              {images.map((u, i) => (
                <a
                  key={i}
                  href={`/editor?image=${encodeURIComponent(u)}`}
                  className="block overflow-hidden rounded border"
                >
                  <img src={u} alt={`result ${i + 1}`} className="w-full" />
                </a>
              ))}
            </div>
          </div>
        )}
      </main>
      {!loading && (
        <footer className="sticky bottom-0 border-t bg-white p-4">
          <button className="w-full rounded bg-blue-600 px-4 py-3 text-white">
            Save listing
          </button>
          <div className="mt-2 text-center">
            <button className="text-sm text-gray-600">Download all (ZIP)</button>
          </div>
        </footer>
      )}
    </div>
  );
}
