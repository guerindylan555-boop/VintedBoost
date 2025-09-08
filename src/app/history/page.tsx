"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Item {
  id: string;
  createdAt: number;
  source: string;
  results: string[];
}

export default function History() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vintedboost_history");
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto w-full max-w-screen-sm px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.back()} className="text-sm">
            Close
          </button>
          <h1 className="text-lg font-semibold">History</h1>
          <div />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-screen-sm p-4">
        {items.length === 0 ? (
          <div className="mt-20 text-center text-sm text-gray-500">
            No listings yet
            <div className="mt-4">
              <button
                onClick={() => router.push("/generate")}
                className="rounded-md bg-blue-600 px-4 py-2 text-white"
              >
                Create your first listing
              </button>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-3 rounded-md border p-2"
              >
                <img
                  src={it.source}
                  alt="thumb"
                  className="h-14 w-14 rounded-md border object-cover"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {new Date(it.createdAt).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-gray-500">
                    {it.results.length} image(s)
                  </div>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem("vintedboost_last", JSON.stringify(it));
                    router.push("/results");
                  }}
                  className="text-sm text-blue-600"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

