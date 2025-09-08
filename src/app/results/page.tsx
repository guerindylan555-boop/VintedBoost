"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Item {
  id: string;
  createdAt: number;
  source: string;
  results: string[];
}

export default function Results() {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vintedboost_last");
      if (raw) setItem(JSON.parse(raw));
    } catch {}
  }, []);

  if (!item) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-gray-500">
        No result available
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto w-full max-w-screen-sm px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.push("/generate")} className="text-sm">
            Close
          </button>
          <h1 className="text-lg font-semibold">Results</h1>
          <div />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-screen-sm p-4 space-y-6">
        <section className="rounded-xl border p-4">
          <h2 className="font-semibold">Description</h2>
          <p className="mt-2 text-sm text-gray-600">
            Generated description will appear here.
          </p>
          <div className="mt-2 flex gap-3 text-sm">
            <button className="text-blue-600">Copy</button>
            <button className="text-blue-600">Edit text</button>
          </div>
        </section>

        <section className="space-y-4">
          {item.results.map((u, i) => (
            <div key={i} className="space-y-2">
              <img
                src={u}
                alt={`out-${i}`}
                className="w-full rounded-md border object-cover"
                style={{ aspectRatio: "4 / 5" }}
              />
              <div className="flex gap-2 text-sm">
                <button
                  onClick={() => router.push(`/editor/${i}`)}
                  className="flex-1 rounded-md border px-3 py-1"
                >
                  Continue editing
                </button>
                <a
                  href={u}
                  download={`result_${i + 1}.png`}
                  className="rounded-md border px-3 py-1"
                >
                  Download
                </a>
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer className="sticky bottom-0 border-t bg-white p-4 space-y-2">
        <button className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Save listing
        </button>
        <button className="w-full rounded-md border px-4 py-2 text-sm">
          Download all (ZIP)
        </button>
      </footer>
    </div>
  );
}

