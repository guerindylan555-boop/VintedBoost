import type { Metadata } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-geist-sans",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VintedBoost — Try‑On + Fiche Vinted",
  description: "Accélérez vos annonces Vinted: description FR + 3 photos portées.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${poppins.variable} ${geistMono.variable} antialiased font-sans`}
      >
        {/* Prevent theme flash on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const t = localStorage.getItem('theme'); const d = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; const e = document.documentElement; d ? e.classList.add('dark') : e.classList.remove('dark'); } catch(_) {} })();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
