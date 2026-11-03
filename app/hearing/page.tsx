"use client";

// パートナー：お店を選ぶ／新しく登録する
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Shop = { id: number; name: string; category: string; area: string };

export default function HearingTop() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", area: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/shops")
      .then((r) => r.json())
      .then((j: { shops?: Shop[] }) => setShops(j.shops ?? []));
  }, []);

  async function add() {
    setError("");
    const r = await apiFetch("/api/shops", { method: "POST", body: JSON.stringify(form) });
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    router.push(`/hearing/${j.id}`);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">担当のお店</h1>
      {shops?.length === 0 && <p className="text-sm text-black/60">まだ担当のお店がありません。下から登録するか、YMM にお店を割り当ててもらってください。</p>}
      {shops === null && <p className="text-black/50">読み込み中…</p>}
      <div className="grid gap-3">
        {shops?.map((s) => (
          <Link key={s.id} href={`/hearing/${s.id}`} className="block rounded-2xl bg-white p-4 shadow-sm border border-black/5">
            <div className="font-bold">{s.name}</div>
            <div className="text-sm text-black/60">{s.category}</div>
          </Link>
        ))}
      </div>

      {!adding ? (
        <button className="w-full rounded-2xl border-2 border-dashed border-leaf/50 text-leaf py-4 font-bold" onClick={() => setAdding(true)}>
          ＋ 新しいお店を登録する
        </button>
      ) : (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
          <div className="text-sm font-bold text-leaf">新しいお店</div>
          <input className="w-full rounded-xl border border-black/15 p-3 text-base" placeholder="店名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            className="w-full rounded-xl border border-black/15 p-3 text-base"
            placeholder="業種（例：手作り味噌と漬物の店）"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input className="w-full rounded-xl border border-black/15 p-3 text-base" placeholder="地域（なくても可）" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
          {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button className="flex-1 rounded-xl bg-leaf text-white py-3 font-bold" onClick={add}>
              登録する
            </button>
            <button className="rounded-xl border border-black/15 px-4" onClick={() => setAdding(false)}>
              やめる
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
