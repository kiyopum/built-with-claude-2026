"use client";

// 画面2：商品ドラフト確認（店主用）
// 店主は「このまま公開」「修正を頼む」「却下」の三択。
// 公開ページ・シェア・QR・購入ボタンは後の段階で付ける。
import { useEffect, useState } from "react";

type Draft = {
  id: number;
  shop_name: string;
  name: string;
  description: string;
  price_yen: number;
  recommend_reason: string;
  target_customer: string;
  status: "draft" | "published" | "rejected";
  revision_note: string;
};

const STATUS_LABEL = {
  draft: { text: "確認待ち", cls: "bg-carrot/15 text-carrot" },
  published: { text: "公開中", cls: "bg-leaf/15 text-leaf" },
  rejected: { text: "却下", cls: "bg-black/10 text-black/50" },
};

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);

  async function load() {
    const r = await fetch("/api/drafts");
    const j = (await r.json()) as { drafts: Draft[] };
    setDrafts(j.drafts);
  }

  useEffect(() => {
    fetch("/api/drafts")
      .then((r) => r.json())
      .then((j: { drafts: Draft[] }) => setDrafts(j.drafts));
  }, []);

  if (drafts === null) return <p className="text-black/50">読み込み中…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">商品の下書き</h1>
      {drafts.length === 0 && (
        <p className="text-black/60">まだ下書きはありません。パートナーがヒアリングを送ると、ここに届きます。</p>
      )}
      {drafts.map((d) => (
        <DraftCard key={d.id} d={d} onChanged={load} />
      ))}
    </div>
  );
}

function DraftCard({ d, onChanged }: { d: Draft; onChanged: () => void }) {
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const st = STATUS_LABEL[d.status];

  async function act(action: "publish" | "reject" | "revise") {
    setError("");
    setBusy(true);
    const r = await fetch(`/api/drafts/${d.id}`, { method: "POST", body: JSON.stringify({ action, note }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error);
    setRevising(false);
    setNote("");
    onChanged();
  }

  return (
    <article className={`rounded-2xl bg-white p-5 shadow-sm border border-black/5 space-y-3 ${d.status === "rejected" ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-black/50">{d.shop_name}</span>
        <span className={`rounded-full px-2 py-0.5 font-bold ${st.cls}`}>{st.text}</span>
      </div>
      <h2 className="text-lg font-bold leading-snug">{d.name}</h2>
      <div className="text-2xl font-bold text-carrot">
        {d.price_yen.toLocaleString()}
        <span className="text-sm text-black/60 font-normal"> 円（税込）</span>
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{d.description}</p>
      <dl className="grid gap-2 text-sm">
        <div className="rounded-xl bg-leaf/5 p-3">
          <dt className="font-bold text-leaf">おすすめ理由</dt>
          <dd>{d.recommend_reason}</dd>
        </div>
        <div className="rounded-xl bg-carrot/5 p-3">
          <dt className="font-bold text-carrot">こんな方に</dt>
          <dd>{d.target_customer}</dd>
        </div>
      </dl>
      {d.status === "published" && (
        <a href={`/p/${d.id}`} className="block rounded-xl border border-leaf/30 bg-leaf/5 p-3 text-sm text-leaf font-bold">
          公開ページを開く →
        </a>
      )}
      {d.revision_note && <p className="text-xs text-black/50">前回の修正依頼：{d.revision_note}</p>}

      {d.status === "draft" && !revising && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button className="rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-50" disabled={busy} onClick={() => act("publish")}>
            このまま公開
          </button>
          <button className="rounded-xl border-2 border-carrot text-carrot py-3 font-bold disabled:opacity-50" disabled={busy} onClick={() => setRevising(true)}>
            修正を頼む
          </button>
          <button className="rounded-xl border border-black/20 text-black/60 py-3 disabled:opacity-50" disabled={busy} onClick={() => act("reject")}>
            却下
          </button>
        </div>
      )}

      {revising && (
        <div className="space-y-2">
          <textarea
            className="w-full min-h-24 rounded-xl border border-black/15 p-3 text-base"
            placeholder="例：値段は1,200円にして。もっと素朴な感じに。"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="flex-1 rounded-xl bg-carrot text-white py-3 font-bold disabled:opacity-50" disabled={busy || !note.trim()} onClick={() => act("revise")}>
              {busy ? "Claude が作り直しています…" : "この内容で作り直す"}
            </button>
            <button className="rounded-xl border border-black/15 px-4" disabled={busy} onClick={() => setRevising(false)}>
              やめる
            </button>
          </div>
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    </article>
  );
}
