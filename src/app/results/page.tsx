"use client";

import Link from "next/link";

export default function ResultsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between p-4">
          <Link href="/generate" className="text-sm text-blue-600">
            Close
          </Link>
          <h1 className="text-base font-semibold">Generating…</h1>
          <div />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 p-4">
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Analyzing photos…</p>
          <div className="h-24 w-full animate-pulse rounded-md bg-gray-100" />
          <div className="grid grid-cols-3 gap-2">
            <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-gray-100" />
            <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-gray-100" />
            <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-gray-100" />
          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t bg-white p-4">
        <button className="w-full rounded-md bg-blue-600 px-4 py-2 text-white">
          Save listing
        </button>
        <div className="mt-2 text-center">
          <button className="text-sm text-gray-500" type="button">
            Download all (ZIP)
          </button>
        </div>
      </footer>
    </div>
  );
}
