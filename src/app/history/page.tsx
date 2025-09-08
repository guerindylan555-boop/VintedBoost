"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface HistItem {
  id: string;
  createdAt: number;
  source: string;
  results: string[];
}

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<HistItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vb_history");
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  function remove(id: string) {
    setItems((it) => {
      const next = it.filter((i) => i.id !== id);
      try {
        localStorage.setItem("vb_history", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function edit(item: HistItem) {
    try {
      localStorage.setItem(
        "vb_pending_generate",
        JSON.stringify({ photos: [item.source], reference: "" })
      );
    } catch {}
    router.push("/run");
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="sticky top-0 border-b bg-white px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-blue-600">
          Close
        </button>
        <div className="font-semibold">History</div>
        <div className="w-8" />
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {items.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            No listings yet
            <div>
              <button
                onClick={() => router.push("/generate")}
                className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-white text-sm"
              >
                Create your first listing
              </button>
            </div>
          </div>
        )}
        {items.map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-3 rounded-lg border p-2"
          >
            <img
              src={it.results[0] || it.source}
              alt="thumb"
              className="h-16 w-16 rounded object-cover"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {new Date(it.createdAt).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => edit(it)}
              className="text-sm text-blue-600"
            >
              Edit
            </button>
            <button
              onClick={() => remove(it.id)}
              className="text-sm text-red-600"
            >
              Delete
            </button>
          </div>
        ))}
      </main>
    </div>
  );
}

