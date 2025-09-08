"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Item {
  id: string;
  createdAt: number;
  source: string;
  results: string[];
}

export default function EditImage({ params }: { params: { index: string } }) {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const idx = Number(params.index);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vintedboost_last");
      if (raw) setItem(JSON.parse(raw));
    } catch {}
  }, []);

  const image = item?.results?.[idx];
  if (!image) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-gray-500">
        No image
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto w-full max-w-screen-sm px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.back()} className="text-sm">
            Back
          </button>
          <h1 className="text-lg font-semibold">Edit image</h1>
          <div className="text-sm text-gray-500">v1</div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-screen-sm p-4 space-y-4">
        <img
          src={image}
          alt="edit"
          className="w-full rounded-md border object-cover"
          style={{ aspectRatio: "4 / 5" }}
        />
        <div className="space-y-4 text-sm">
          <div>
            <label className="flex items-center gap-2">
              <input type="checkbox" /> Pose
            </label>
            <input
              placeholder="Describe pose"
              className="mt-2 w-full rounded-md border px-3 py-1"
            />
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input type="checkbox" /> Style
            </label>
            <input
              placeholder="Image style"
              className="mt-2 w-full rounded-md border px-3 py-1"
            />
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input type="checkbox" /> Environment
            </label>
            <input
              placeholder="Background/environment"
              className="mt-2 w-full rounded-md border px-3 py-1"
            />
          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t bg-white p-4 space-y-2">
        <button className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Generate variation
        </button>
        <button className="w-full rounded-md border px-4 py-2 text-sm">
          Save & replace
        </button>
      </footer>
    </div>
  );
}

