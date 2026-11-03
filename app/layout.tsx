import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "YaoBiz",
  description: "眠っている商いを、空いた時間で掘り起こして売る。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="bg-leaf text-white">
          <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between gap-2">
            <Link href="/" className="font-bold text-lg">YaoBiz</Link>
            {/* デモ用の役割切り替え（本番はログインで分ける） */}
            <nav className="flex gap-1 text-sm">
              <Link href="/hearing" className="rounded-full bg-white/15 px-3 py-1">パートナー</Link>
              <Link href="/drafts" className="rounded-full bg-white/15 px-3 py-1">店主</Link>
              <Link href="/shop" className="rounded-full bg-white/15 px-3 py-1">お客さま</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <footer className="text-center text-xs text-black/50 py-4">株式会社山崎メディアミックス</footer>
      </body>
    </html>
  );
}
