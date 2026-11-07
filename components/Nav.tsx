"use client";

// 上のメニュー。ログインしている人に合わせて出し分ける（パートナー／YMM 管理）
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Me = { id: number; name: string; role: "partner" | "admin"; code: string } | null;

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j: { user: Me }) => setMe(j.user));
  }, [path]);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    router.push("/login");
  }

  // 行き先の役割を色の点で示す（biz＝事業者のこと／partner＝パートナー自身のこと／ai＝システム・管理）
  const DOT: Record<string, string> = { "/hearing": "bg-biz", "/everyone": "bg-partner", "/voices": "bg-partner", "/checkin": "bg-partner", "/me": "bg-partner", "/statement": "bg-ai border border-white/70", "/admin": "bg-ai border border-white/70", "/demo": "bg-ai border border-white/70", "/shop": "bg-biz", "/login": "bg-ai border border-white/70" };
  const pill = (href: string, text: string) => (
    <Link href={href} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${path.startsWith(href) ? "bg-white text-ai font-bold" : "bg-white/15"}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${DOT[href] ?? "bg-white/60"}`} aria-hidden />
      {text}
    </Link>
  );

  return (
    <>
      <nav className="flex flex-wrap justify-end gap-1 text-[13px] whitespace-nowrap">
        {me ? (
          <>
            {pill("/hearing", "事業者")}
            {pill("/everyone", "みんなの商品")}
            {pill("/statement", "明細")}
            {pill("/voices", "みんなの声")}
            {pill("/checkin", "月1")}
            {pill("/me", "歩み")}
            {me.role === "admin" && pill("/admin", "管理")}
            {pill("/demo", "見本")}
          </>
        ) : (
          me === null && (
            <>
              {pill("/shop", "お客さま")}
              {pill("/login", "ログイン")}
            </>
          )
        )}
      </nav>
      {me && (
        <div className="basis-full flex justify-end items-center gap-3 text-xs text-white/80">
          <span className="inline-flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-full ${me.role === "admin" ? "bg-ai border border-white/70" : "bg-partner"}`} aria-hidden />
            {me.name} さん（{me.role === "admin" ? "YMM 管理" : `パートナー番号 ${me.code}`}）
          </span>
          <button className="underline" onClick={logout}>
            ログアウト
          </button>
        </div>
      )}
    </>
  );
}
