"use client";

// パートナー：商品の修正。写真の撮り直し・追加・並べ替え、文や価格の修正、AIへの一言修正
// 保存すると法律チェックをやり直し、店主さんの確認待ちに戻る（公開中でも、もう一度確認してもらう）
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhotoPicker, type PickedPhoto } from "@/components/PhotoPicker";
import { LegalPanel, type Legal } from "@/components/LegalPanel";

type Draft = {
  id: number;
  name: string;
  description: string;
  price_yen: number;
  recommend_reason: string;
  target_customer: string;
  status: "draft" | "published" | "rejected";
  legal_json: string | null;
  photos: string[];
};

const STATUS = { draft: "店主さんの確認待ち", published: "公開中", rejected: "却下" };

async function toPicked(urls: string[]): Promise<PickedPhoto[]> {
  return Promise.all(
    urls.map(async (u) => {
      const blob = await (await fetch(u)).blob();
      return { blob, url: URL.createObjectURL(blob) };
    }),
  );
}

function EditInner() {
  const { shopId, draftId } = useParams<{ shopId: string; draftId: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [photosChanged, setPhotosChanged] = useState(false);
  const [fields, setFields] = useState({ name: "", price_yen: "", description: "", recommend_reason: "", target_customer: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "revise">("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/drafts/${draftId}`)
      .then((r) => r.json())
      .then(async (j: { draft: Draft }) => {
        const d = j.draft;
        setDraft(d);
        setFields({
          name: d.name,
          price_yen: String(d.price_yen),
          description: d.description,
          recommend_reason: d.recommend_reason,
          target_customer: d.target_customer,
        });
        setPhotos(await toPicked(d.photos));
      });
  }, [draftId]);

  async function call(url: string, init: RequestInit) {
    const r = await fetch(url, init);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "うまくいきませんでした");
  }

  async function uploadPhotosIfChanged() {
    if (!photosChanged) return;
    const fd = new FormData();
    photos.forEach((p, i) => fd.append("photo", p.blob, `photo-${i + 1}.jpg`));
    await call(`/api/drafts/${draftId}/photos`, { method: "POST", body: fd });
    setPhotosChanged(false);
  }

  async function save() {
    setError("");
    setBusy("save");
    try {
      await uploadPhotosIfChanged();
      await call(`/api/drafts/${draftId}`, {
        method: "POST",
        body: JSON.stringify({ action: "edit", by: "partner", fields: { ...fields, price_yen: Number(fields.price_yen) } }),
      });
      router.push(`/hearing/${shopId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
      setBusy("");
    }
  }

  async function revise() {
    setError("");
    setBusy("revise");
    try {
      await uploadPhotosIfChanged();
      await call(`/api/drafts/${draftId}`, { method: "POST", body: JSON.stringify({ action: "revise", note }) });
      router.push(`/hearing/${shopId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作り直せませんでした");
      setBusy("");
    }
  }

  if (!draft) return <p className="text-black/50">読み込み中…</p>;
  const legal = draft.legal_json ? (JSON.parse(draft.legal_json) as Legal) : null;
  const input = "w-full rounded-xl border border-black/15 p-3 text-base";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/hearing/${shopId}`} className="text-sm text-leaf">← お店のページ</Link>
        <h1 className="text-xl font-bold mt-1">商品を修正</h1>
        <p className="text-xs text-black/50">いまの状態：{STATUS[draft.status]}</p>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">写真（撮り直し・追加・メインの入れ替え）</div>
        <PhotoPicker
          photos={photos}
          onChange={(p) => {
            setPhotos(p);
            setPhotosChanged(true);
          }}
          disabled={busy !== ""}
        />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
        <div className="text-sm font-bold text-leaf">商品ページの文</div>
        <label className="block text-xs font-bold text-black/60">商品名</label>
        <input className={input} value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} />
        <label className="block text-xs font-bold text-black/60">価格（税込・円）</label>
        <input className={input} inputMode="numeric" value={fields.price_yen} onChange={(e) => setFields({ ...fields, price_yen: e.target.value.replace(/[^\d]/g, "") })} />
        <label className="block text-xs font-bold text-black/60">紹介文</label>
        <textarea className={`${input} min-h-48 leading-relaxed`} value={fields.description} onChange={(e) => setFields({ ...fields, description: e.target.value })} />
        <label className="block text-xs font-bold text-black/60">おすすめ理由</label>
        <textarea className={`${input} min-h-20`} value={fields.recommend_reason} onChange={(e) => setFields({ ...fields, recommend_reason: e.target.value })} />
        <label className="block text-xs font-bold text-black/60">こんな方に</label>
        <textarea className={`${input} min-h-20`} value={fields.target_customer} onChange={(e) => setFields({ ...fields, target_customer: e.target.value })} />
      </section>

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      <div className="space-y-2">
        <button
          className="w-full rounded-2xl bg-carrot text-white py-4 text-lg font-bold disabled:opacity-50"
          onClick={save}
          disabled={busy !== "" || photos.length === 0}
        >
          {busy === "save" ? "保存して、法律チェックをやり直しています…" : "保存して、法律チェック"}
        </button>
        <p className="text-xs text-black/50">
          保存すると、直した文のまま Claude が法律チェックをやり直します（写真を変えたときは新しいラベルも読みます）。そのあと店主さんにもう一度確認してもらいます。
        </p>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
        <div className="text-sm font-bold text-carrot">AI に直してもらう</div>
        <textarea
          className={`${input} min-h-20`}
          placeholder="例：店主さんが『もっと素朴に』と言っていた。容量は300gに変わった。"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="w-full rounded-xl border-2 border-carrot text-carrot py-3 font-bold disabled:opacity-50" onClick={revise} disabled={busy !== "" || !note.trim()}>
          {busy === "revise" ? "Claude が作り直して、法律も確かめ直しています…" : "この内容で作り直す"}
        </button>
      </section>

      {legal && (
        <div className="space-y-2">
          <div className="text-sm font-bold">いまの法律チェック</div>
          <LegalPanel legal={legal} />
        </div>
      )}
    </div>
  );
}

export default function EditProductPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <EditInner />
    </Suspense>
  );
}
