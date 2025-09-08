"use client";

import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";

export default function ThemeToggle() {
  const [enabled, setEnabled] = useState(false);

  // Initialize from localStorage or system preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      const preferDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = stored ? stored === "dark" : preferDark;
      setEnabled(isDark);
    } catch {}
  }, []);

  // Apply class to <html> and persist
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (enabled) {
        root.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        root.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
    } catch {}
  }, [enabled]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wide">Dark Mode</span>
      <Toggle checked={enabled} onChange={setEnabled} ariaLabel="Basculer le thème sombre" />
    </div>
  );
}

