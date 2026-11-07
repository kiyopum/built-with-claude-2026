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
        {/* 上のメニュー：ロゴの AI ダークブルー〜企業ブルー。下の細い線は、ロゴの3色（青・緑・オレンジ） */}
        <header className="bg-gradient-to-r from-leaf-dark to-leaf text-white border-b-4 border-transparent [border-image:linear-gradient(90deg,#1685d3,#29b9e8,#76c442,#f6a21a)_1]">
          <div className="mx-auto max-w-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-wide">
              {/* ロゴのシンボル（2026-11-07）。元の画像の黒い背景を透明にした小さな版（public/brand/yaobiz-mark.png） */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/yaobiz-mark.png" alt="" className="h-9 w-auto" />
              <span>
                Yao<span className="text-[#f6a21a]">Biz</span>
              </span>
            </Link>
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
