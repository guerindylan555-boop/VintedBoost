import Link from "next/link";

export default function BottomDock() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigation principale"
    >
      <div className="mx-auto max-w-screen-md px-4">
        <div className="grid grid-cols-3 gap-2 py-2">
          <Link
            href="/annonces"
            className="flex flex-col items-center justify-center gap-1 rounded-md py-2 text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Mes annonces"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M9 6h12M9 12h12M9 18h12" />
              <path d="M5 6h.01M5 12h.01M5 18h.01" />
            </svg>
            <span className="text-[10px] font-medium uppercase tracking-wider">Mes annonces</span>
          </Link>

          <Link
            href="/creer"
            className="flex flex-col items-center justify-center gap-1 rounded-md py-2 bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
            aria-label="Créer une annonce"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <circle cx="12" cy="12" r="6" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-wider">Créer</span>
          </Link>

          <Link
            href="/parametres"
            className="flex flex-col items-center justify-center gap-1 rounded-md py-2 text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Paramètres"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <circle cx="12" cy="12" r="3.25" />
              <path d="M12 2.5V5.5M12 18.5V21.5M2.5 12H5.5M18.5 12H21.5M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M4.8 19.2l2.1-2.1M17.1 6.9l2.1-2.1" />
            </svg>
            <span className="text-[10px] font-medium uppercase tracking-wider">Paramètres</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
