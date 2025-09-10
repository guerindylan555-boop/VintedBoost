import Spinner from "@/components/Spinner";

export default function LoadingAnnonces() {
  return (
    <div className="mx-auto max-w-screen-md p-4 overflow-x-hidden">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold uppercase tracking-widest">Mes annonces</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Retrouvez vos annonces générées et reprenez là où vous en étiez.</p>
        </div>
        <div className="flex items-center gap-2"><Spinner size="xs" label="Chargement…" /></div>
      </header>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm min-h-40 overflow-x-hidden">
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-2 animate-pulse">
              <div className="h-16 w-16 rounded-md bg-gray-200 dark:bg-gray-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
                <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
