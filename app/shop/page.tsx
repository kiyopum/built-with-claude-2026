"use client";

// 公開ページ（お客さま向け）：公開中の商品の一覧
import Link from "next/link";
import { useEffect, useState } from "react";

type Product = { id: number; name: string; description: string; price_yen: number; shop_name: string; photo: string | null; pieces: number; incl_min: number | null; unit_total: number };

export default function ShopPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((j: { products: Product[] }) => setProducts(j.products));
  }, []);

  if (products === null) return <p className="text-black/50">読み込み中…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">地域の事業者の商品</h1>
      {products.length === 0 && <p className="text-black/60">公開中の商品はまだありません。</p>}
      {products.map((p) => (
        <Link key={p.id} href={`/p/${p.id}`} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm border border-black/5">
          <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.photo && <img src={p.photo} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-black/50">{p.shop_name}</div>
            <div className="font-bold leading-snug line-clamp-2">{p.name}</div>
            <div className="text-carrot font-bold">
              {p.incl_min != null ? (
                <>
                  {p.pieces > 1 && <span className="text-xs text-black/60 font-normal">{p.pieces}個入り </span>}
                  <span className="text-xs font-normal">送料込み </span>
                  {p.incl_min.toLocaleString()}円{p.pieces > 1 ? "" : "〜"}
                </>
              ) : (
                <>
                  {p.pieces > 1 && <span className="text-xs text-black/60 font-normal">{p.pieces}個入り </span>}
                  {p.unit_total.toLocaleString()}円
                </>
              )}
            </div>
            <p className="text-sm text-black/60 line-clamp-2">{p.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
