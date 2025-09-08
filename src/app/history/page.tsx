"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadHistory, removeHistory, HistoryItem } from "@/lib/history";

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setItems(loadHistory());
  }, []);

  function handleDelete(id: string) {
    setItems(removeHistory(id));
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.back()}>Close</button>
        <h1 className="text-base font-medium">History</h1>
        <div />
      </header>
      <main className="flex-1 p-4 space-y-4">
        {items.length === 0 ? (
          <div className="text-center text-sm text-gray-500">
            No listings yet
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-3 rounded border p-2"
              >
                <img
                  src={it.source}
                  alt="thumb"
                  className="h-16 w-16 rounded object-cover"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {new Date(it.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  className="text-xs text-blue-600"
                  onClick={() => {
                    localStorage.setItem(
                      "vintedboost_pending",
                      JSON.stringify({ source: it.source, options: {} })
                    );
                    router.push("/results");
                  }}
                >
                  Edit
                </button>
                <button
                  className="text-xs text-red-600"
                  onClick={() => handleDelete(it.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
