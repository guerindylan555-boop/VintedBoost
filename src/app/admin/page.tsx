"use client";

import { authClient } from "@/lib/auth-client";
import { isAdminEmail } from "@/lib/admin";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  const user = session?.user || null;
  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    if (!isPending) {
      if (!user) router.replace("/auth?next=/admin");
      else if (!isAdmin) router.replace("/creer");
    }
  }, [isPending, user?.email, isAdmin]);

  if (isPending || !user) {
    return <div className="mx-auto max-w-screen-md p-4">Chargement…</div>;
  }
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="mx-auto max-w-screen-md p-4">
      <h1 className="text-xl font-semibold uppercase tracking-widest">Admin</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Espace réservé aux administrateurs. (Fonctionnalités à venir)
      </p>
      <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Connecté en tant que <span className="font-medium">{user.email}</span>
        </div>
      </div>
    </div>
  );
}
