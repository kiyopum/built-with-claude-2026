"use client";

// パートナー：商品の「2) 法律チェックと修正」と「3) リリース」
//   写真の撮り直し・追加・並べ替え、文や価格の修正、AIへの一言修正
//   保存すると法律チェックをやり直し、店主さんの確認待ちに戻る（公開中でも、もう一度確認してもらう）
//   リリースは店主さんだけ：スマホを渡して、お店の暗証番号を押してもらう
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhotoPicker, type PickedPhoto } from "@/components/PhotoPicker";
import { LegalPanel, type Legal } from "@/components/LegalPanel";
import { DraftFieldsForm, TodoNoteButton } from "@/components/DraftFieldsForm";
import { Working } from "@/components/Working";
import { OwnerApprove } from "@/components/OwnerApprove";
import { apiFetch } from "@/lib/api";

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
      const blob = await (await apiFetch(u)).blob();
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
        setPhotosChanged(false);
        setError("");
      });
  }, [draftId]);

  async function call(url: string, init: RequestInit) {
    const r = await apiFetch(url, init);
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
      // Next 16 は画面の状態を覚えているので、作業中を解いてから移る（戻ったときに回り続けて見えるため）
      setBusy("");
      setNote("");
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
      // Next 16 は画面の状態を覚えているので、作業中を解いてから移る（戻ったときに回り続けて見えるため）
      setBusy("");
      setNote("");
      router.push(`/hearing/${shopId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作り直せませんでした");
      setBusy("");
    }
  }

  async function release(pin: string): Promise<string> {
    const r = await apiFetch(`/api/drafts/${draftId}`, { method: "POST", body: JSON.stringify({ action: "publish", shopPin: pin }) });
    const j = await r.json();
    if (!r.ok) return j.error ?? "リリースできませんでした";
    router.push(`/hearing/${shopId}`);
    return "";
  }

  if (!draft) return <p className="text-black/50">読み込み中…</p>;
  const legal = draft.legal_json ? (JSON.parse(draft.legal_json) as Legal) : null;
  const blocked = legal?.verdict === "このままでは販売できない";
  const unsaved =
    photosChanged ||
    fields.name !== draft.name ||
    fields.price_yen !== String(draft.price_yen) ||
    fields.description !== draft.description ||
    fields.recommend_reason !== draft.recommend_reason ||
    fields.target_customer !== draft.target_customer;
  const step = draft.status === "published" ? 4 : blocked || unsaved ? 2 : 3;
  const input = "w-full rounded-xl border border-black/15 p-3 text-base";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/hearing/${shopId}`} className="text-sm text-leaf">← お店のページ</Link>
        <h1 className="text-xl font-bold mt-1">{draft.status === "published" ? "商品を修正" : "法律チェックと修正・リリース"}</h1>
        <p className="text-xs text-black/50">いまの状態：{STATUS[draft.status]}</p>
      </div>

      {/* 3つのステップのどこにいるか */}
      <ol className="grid grid-cols-3 gap-1 text-center text-xs font-bold">
        {["1) ヒアリング", "2) 法律チェックと修正", "3) リリース"].map((t, i) => (
          <li key={t} className={`rounded-lg py-2 ${i + 1 < step ? "bg-leaf/15 text-leaf" : i + 1 === step ? "bg-carrot text-white" : "bg-black/5 text-black/40"}`}>
            {i + 1 < step ? "✓ " : ""}
            {t}
          </li>
        ))}
      </ol>

      {draft.status === "draft" && (
        <section className="rounded-2xl bg-white p-4 shadow-sm border-2 border-leaf/40 space-y-2">
          <div className="text-sm font-bold text-leaf">3) リリース（店主さんだけ）</div>
          {blocked ? (
            <p className="text-sm text-red-600">「このままでは販売できない」ので、まだリリースできません。下の赤いところを直して保存してください。</p>
          ) : unsaved ? (
            <p className="text-sm text-amber-700">直したところがあります。先に下の「保存して、法律チェック」を押してください。</p>
          ) : (
            <p className="text-sm">店主さんに、写真と文を上から下まで見てもらってください。よければ、お店の暗証番号で公開します。</p>
          )}
          <OwnerApprove
            button="店主さんに見てもらって、リリースする"
            label="店主さん：お店の暗証番号"
            onPin={release}
            disabled={blocked || unsaved || busy !== ""}
            workingText="公開しています"
          />
        </section>
      )}

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
        <DraftFieldsForm f={fields} setF={setFields} legal={legal} />
      </section>

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      <div className="space-y-2">
        <button
          className="w-full rounded-2xl bg-carrot text-white py-4 text-lg font-bold disabled:opacity-50"
          onClick={save}
          disabled={busy !== "" || photos.length === 0}
        >
          {busy === "save" ? <Working text="保存して、法律チェックをやり直しています" est={45} /> : "保存して、法律チェック"}
        </button>
        <p className="text-xs text-black/50">
          保存すると、直した文のまま Claude が法律チェックをやり直します（写真を変えたときは新しいラベルも読みます）。そのあと店主さんにもう一度確認してもらいます。
        </p>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
        <div className="text-sm font-bold text-carrot">AI に直してもらう</div>
        <TodoNoteButton legal={legal} setNote={setNote} />
        <textarea
          className={`${input} min-h-20`}
          placeholder="例：店主さんが『もっと素朴に』と言っていた。容量は300gに変わった。"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="w-full rounded-xl border-2 border-carrot text-carrot py-3 font-bold disabled:opacity-50" onClick={revise} disabled={busy !== "" || !note.trim()}>
          {busy === "revise" ? <Working text="Claude が作り直して、法律も確かめ直しています" est={60} /> : "この内容で作り直す"}
        </button>
      </section>

      {legal && (
        <details className="space-y-2">
          <summary className="text-sm font-bold">法律チェックの全項目（根拠・出典つき）</summary>
          <LegalPanel legal={legal} />
        </details>
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
