"use client";

import Link from "next/link";

export default function HistoryPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between p-4">
          <Link href="/generate" className="text-sm text-blue-600">
            Close
          </Link>
          <h1 className="text-base font-semibold">History</h1>
          <button className="text-sm text-gray-600" type="button">
            Filter
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 p-4">
        <div className="rounded-md border p-8 text-center text-sm text-gray-500">
          No listings yet
        </div>
      </main>
    </div>
  );
}
