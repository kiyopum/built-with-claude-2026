import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "YaoBiz",
  description: "眠っている商いを、空いた時間で掘り起こして売る。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="bg-leaf text-white">
          <div className="mx-auto max-w-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <Link href="/" className="font-bold text-lg">YaoBiz</Link>
            <Suspense fallback={null}>
              <Nav />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <footer className="text-center text-xs text-black/50 py-4">株式会社山崎メディアミックス</footer>
      </body>
    </html>
  );
}
