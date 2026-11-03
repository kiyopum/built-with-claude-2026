"use client";

// みんなの商品：ほかのパートナーがリリースした商品も、気に入ったら紹介できる
// 紹介から売れたら、パートナーの取り分を担当の人と半分ずつ
import Link from "next/link";
import { useEffect, useState } from "react";

type P = {
  id: number;
  shop_id: number;
  name: string;
  price_yen: number;
  shop_name: string;
  category: string;
  partner_name: string | null;
  photo: string | null;
  sold: number;
  mine: boolean;
};

export default function EveryonePage() {
  const [list, setList] = useState<P[] | null>(null);
  const [filter, setFilter] = useState<"all" | "others" | "mine">("all");

  useEffect(() => {
    fetch("/api/everyone")
      .then((r) => r.json())
      .then((j: { products?: P[] }) => setList(j.products ?? []));
  }, []);

  if (!list) return <p className="text-black/50">読み込み中…</p>;
  const shown = list.filter((p) => (filter === "all" ? true : filter === "mine" ? p.mine : !p.mine));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">みんなの商品</h1>
        <p className="text-sm text-black/60">
          ほかのパートナーさんのお店の商品も紹介できます。「これはいい！」と思ったら紹介してください。売れたら、報酬を担当の人と半分ずつ受け取れます（担当のいないお店なら全部）。
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1 text-sm font-bold">
        {(
          [
            ["all", "ぜんぶ"],
            ["others", "ほかの人のお店"],
            ["mine", "自分の担当"],
          ] as const
        ).map(([k, t]) => (
          <button key={k} className={`rounded-xl py-2 ${filter === k ? "bg-leaf text-white" : "bg-white border border-black/10"}`} onClick={() => setFilter(k)}>
            {t}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-black/60">まだありません。</p>}
      <div className="grid gap-3">
        {shown.map((p) => (
          <div key={p.id}>
            <Link href={`/p/${p.id}`} className="flex gap-3 rounded-t-2xl bg-white p-3 shadow-sm border border-black/5 active:opacity-70">
              <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.photo && <img src={p.photo} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-snug line-clamp-2">{p.name}</div>
                <div className="text-sm">{p.price_yen.toLocaleString()}円</div>
                <div className="text-xs text-black/50 mt-0.5">
                  {p.shop_name}・{p.mine ? "あなたの担当" : `担当 ${p.partner_name ?? "なし"}`}
                  {p.sold > 0 && `・${p.sold}件売れました`}
                </div>
              </div>
            </Link>
            <Link href={`/hearing/${p.shop_id}/p/${p.id}/share?from=everyone`} className="block rounded-b-2xl bg-carrot text-white text-center py-3 font-bold shadow-sm">
              📷 Instagram で紹介する{p.mine ? "" : p.partner_name ? "（報酬は担当と半分ずつ）" : "（担当なし：報酬は全部あなたに）"}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
