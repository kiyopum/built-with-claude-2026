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

  const pill = (href: string, text: string) => (
    <Link href={href} className={`rounded-full px-2.5 py-1 ${path.startsWith(href) ? "bg-white text-leaf font-bold" : "bg-white/15"}`}>
      {text}
    </Link>
  );

  return (
    <>
      <nav className="flex flex-wrap justify-end gap-1 text-[13px] whitespace-nowrap">
        {me ? (
          <>
            {pill("/hearing", "お店")}
            {pill("/everyone", "みんなの商品")}
            {pill("/statement", "明細")}
            {pill("/voices", "みんなの声")}
            {pill("/checkin", "月1")}
            {pill("/me", "歩み")}
            {me.role === "admin" && pill("/admin", "管理")}
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
          <span>
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
