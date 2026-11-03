"use client";

// パートナー：お店のページ。上にお店の理念、下に商品の一覧と「＋商品を追加」
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Data = {
  shop: { id: number; name: string; category: string; philosophy_text: string | null; philosophy_status: "none" | "draft" | "approved" };
  products: { id: number; name: string; price_yen: number; status: string; verdict: string | null; photo: string | null }[];
};

const STATUS = { draft: "確認待ち", published: "公開中", rejected: "却下" } as Record<string, string>;
const VERDICT = {
  販売できる: "text-leaf",
  直せば販売できる: "text-amber-600",
  このままでは販売できない: "text-red-600",
} as Record<string, string>;

function ShopPageInner() {
  const { shopId } = useParams<{ shopId: string }>();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch(`/api/shops/${shopId}`)
      .then((r) => r.json())
      .then((j: Data) => setData(j));
  }, [shopId]);

  if (!data) return <p className="text-black/50">読み込み中…</p>;
  const { shop, products } = data;
  const aboutLabel = { none: "まだ聞いていません", draft: "店主さんの確認待ち", approved: "公開OK" }[shop.philosophy_status];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hearing" className="text-sm text-leaf">← お店の一覧</Link>
        <h1 className="text-xl font-bold mt-1">{shop.name}</h1>
        <p className="text-sm text-black/60">{shop.category}</p>
      </div>

      {/* お店の理念（1回だけ聞く） */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-leaf">お店の理念・思い</div>
          <span className="text-xs text-black/50">{aboutLabel}</span>
        </div>
        {shop.philosophy_text ? (
          <p className="text-sm leading-relaxed line-clamp-4 whitespace-pre-wrap">{shop.philosophy_text}</p>
        ) : (
          <p className="text-sm text-black/60">最初に一度だけ、お店を始めたきっかけや大事にしていることを聞きます。商品の紹介文にも生かされます。</p>
        )}
        <Link
          href={`/hearing/${shop.id}/about`}
          className={`block text-center rounded-xl py-3 font-bold ${shop.philosophy_text ? "border border-leaf/40 text-leaf" : "bg-leaf text-white"}`}
        >
          {shop.philosophy_text ? "聞き直す" : "お店のヒアリングを始める"}
        </Link>
      </section>

      {/* 商品（1つずつ、写真を撮って聞く） */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-bold">商品 {products.length}件</div>
        </div>
        <Link href={`/hearing/${shop.id}/new`} className="block text-center rounded-2xl bg-carrot text-white py-4 text-lg font-bold">
          ＋ 商品を追加
        </Link>
        {products.map((p) => (
          <div key={p.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm border border-black/5">
            <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-black/5 grid place-items-center text-black/30 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.photo ? <img src={p.photo} alt="" className="w-full h-full object-cover" /> : "写真なし"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold leading-snug line-clamp-2">{p.name}</div>
              <div className="text-sm">{p.price_yen.toLocaleString()}円</div>
              <div className="text-xs flex gap-2 mt-1">
                <span className="text-black/50">{STATUS[p.status] ?? p.status}</span>
                {p.verdict && <span className={`font-bold ${VERDICT[p.verdict] ?? ""}`}>{p.verdict}</span>}
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <ShopPageInner />
    </Suspense>
  );
}
