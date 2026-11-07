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
        {/* 上のメニュー：価値創造オレンジ #F6A21A（2026-11-07 きよさん「ロゴの背景は価値」）。文字はロゴ文字ネイビー #082D5C */}
        <header className="bg-[#f6a21a] text-navy">
          <div className="mx-auto max-w-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-wide">
              {/* ロゴのシンボル（2026-11-07）。きよさんが作った 180×144 の透明 PNG をそのまま（public/brand/yaobiz-mark-2.png。名前を変えたのは Safari のキャッシュ対策） */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/yaobiz-mark-2.png" alt="" className="h-9 w-auto" />
              <span>YaoBiz</span>
            </Link>
            <Suspense fallback={null}>
              <Nav />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <footer className="text-center text-xs text-black/50 py-4 space-y-1">
          {/* 色の意味（ロゴの Y の3方向と中央） */}
          <div className="flex justify-center gap-3">
            <span><span className="inline-block w-2 h-2 rounded-full bg-biz mr-1" aria-hidden />企業向け</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-partner mr-1" aria-hidden />パートナー向け</span>
            <span><span className="inline-block w-2 h-2 rounded-full border border-white bg-ai mr-1" aria-hidden />システム</span>
          </div>
          <div>株式会社山崎メディアミックス</div>
        </footer>
      </body>
    </html>
  );
}
