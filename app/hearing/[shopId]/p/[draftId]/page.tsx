"use client";

// パートナー：商品の「2) 法律チェックと修正」と「3) リリース」
//   写真の撮り直し・追加・並べ替え、文や価格の修正、AIへの一言修正
//   保存すると法律チェックをやり直し、事業者さんの確認待ちに戻る（公開中でも、もう一度確認してもらう）
//   リリースは事業者さんだけ：スマホを渡して、事業者さんの暗証番号を押してもらう
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhotoPicker, type PickedPhoto } from "@/components/PhotoPicker";
import { LegalPanel, type Legal } from "@/components/LegalPanel";
import { DraftFieldsForm, TodoNoteButton } from "@/components/DraftFieldsForm";
import { Working } from "@/components/Working";
import { OwnerApprove } from "@/components/OwnerApprove";
import { apiFetch } from "@/lib/api";
import { PackageCard } from "@/components/PackageCard";
import { MadeBy } from "@/components/MadeBy";
import type { Made } from "@/lib/made";
import { splitAmount } from "@/lib/split";

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
  size_class: string | null;
  weight_g: number | null;
  per_box: number;
  shop_prefecture: string | null;
  shop_shipping_yen: number | null;
  shop_online_label: number;
  kind: "goods" | "service";
  ymm_rate?: number | null;
  revise_left: number;
};
type Rates = { effective: number; goods: number; service: number };

const STATUS = { draft: "事業者さんの確認待ち", published: "公開中", rejected: "却下" };

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
  const [rates, setRates] = useState<Rates | null>(null); // YMM 管理のときだけ届く
  const [made, setMade] = useState<Made | null>(null); // 公開したあとの記録（人がしたこと／AI がしたこと）

  // 送り方を保存したあとに、送り方の欄だけ読み直す（写真や入力中の文は消さない）
  const reloadPackage = () =>
    fetch(`/api/drafts/${draftId}`)
      .then((r) => r.json())
      .then((j: { draft: Draft }) => setDraft((old) => (old ? { ...old, size_class: j.draft.size_class, weight_g: j.draft.weight_g, per_box: j.draft.per_box } : old)));

  useEffect(() => {
    fetch(`/api/drafts/${draftId}`)
      .then((r) => r.json())
      .then(async (j: { draft: Draft; rates: Rates | null; made: Made | null }) => {
        const d = j.draft;
        setDraft(d);
        setRates(j.rates);
        setMade(j.made);
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
        <Link href={`/hearing/${shopId}`} className="text-sm text-leaf">← 事業者のページ</Link>
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
          <div className="text-sm font-bold text-leaf">3) リリース（事業者さんだけ）</div>
          {blocked ? (
            <p className="text-sm text-red-600">「このままでは販売できない」ので、まだリリースできません。下の赤いところを直して保存してください。</p>
          ) : unsaved ? (
            <p className="text-sm text-amber-700">直したところがあります。先に下の「保存して、法律チェック」を押してください。</p>
          ) : (
            <p className="text-sm">事業者さんに、写真と文を上から下まで見てもらってください。よければ、事業者さんの暗証番号で公開します。</p>
          )}
          <OwnerApprove
            button="事業者さんに見てもらって、リリースする"
            label="事業者さん：事業者さんの暗証番号"
            onPin={release}
            disabled={blocked || unsaved || busy !== ""}
            workingText="公開しています"
          />
        </section>
      )}

      {draft.status === "published" && made && <MadeBy made={made} svc={draft.kind === "service"} />}

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

      {draft.kind === "service" ? (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-1 text-sm">
          <div className="font-bold text-leaf">お届け</div>
          <p>サービスなので送りません（送料なし）。申し込んだ人には、事業者さんからメールで案内（配信の URL など）を送ってください。申し込んだ人のメールアドレスは、事業者のページの「注文」に出ます。</p>
        </section>
      ) : (
      <PackageCard
        draftId={draft.id}
        price={Number(fields.price_yen) || draft.price_yen}
        initial={{ size_class: draft.size_class, weight_g: draft.weight_g, per_box: draft.per_box }}
        shopPrefecture={draft.shop_prefecture}
        shopFlatYen={draft.shop_shipping_yen}
        onlineLabel={!!draft.shop_online_label}
        onSaved={reloadPackage}
      />
      )}

      {rates && <RateCard draftId={draft.id} kind={draft.kind} rates={rates} custom={draft.ymm_rate ?? null} onSaved={(r) => setRates(r)} />}

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      <div className="space-y-2">
        <button
          className="w-full rounded-2xl bg-carrot text-white py-4 text-lg font-bold disabled:opacity-50"
          onClick={save}
          disabled={busy !== "" || (draft.kind !== "service" && photos.length === 0)}
        >
          {busy === "save" ? <Working text="保存して、法律チェックをやり直しています" est={45} /> : "保存して、法律チェック"}
        </button>
        <p className="text-xs text-black/50">
          保存すると、直した文のまま Claude が法律チェックをやり直します（写真を変えたときは新しいラベルも読みます）。そのあと事業者さんにもう一度確認してもらいます。
        </p>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
        <div className="text-sm font-bold text-carrot">AI に直してもらう</div>
        <TodoNoteButton legal={legal} setNote={setNote} />
        <textarea
          className={`${input} min-h-20`}
          placeholder="例：事業者さんが『もっと素朴に』と言っていた。容量は300gに変わった。"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="w-full rounded-xl border-2 border-carrot text-carrot py-3 font-bold disabled:opacity-50" onClick={revise} disabled={busy !== "" || !note.trim() || draft.revise_left <= 0}>
          {busy === "revise" ? <Working text="Claude が作り直して、法律も確かめ直しています" est={60} /> : draft.revise_left > 0 ? `この内容で作り直す（あと${draft.revise_left}回）` : "作り直しは5回まで使いました"}
        </button>
        {draft.revise_left <= 0 && <p className="text-xs text-black/60">ここからは上の「手で直す」で直してください。保存すると法律チェックはやり直します。</p>}
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

// ---------- 分け方（YMM 管理だけ。この商品の YMM の取り分を決める） ----------

function RateCard({ draftId, kind, rates, custom, onSaved }: { draftId: number; kind: "goods" | "service"; rates: Rates; custom: number | null; onSaved: (r: Rates) => void }) {
  const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;
  const def = kind === "service" ? rates.service : rates.goods;
  const [other, setOther] = useState(custom != null ? String(Math.round(custom * 1000) / 10) : "");
  const [cur, setCur] = useState<number | null>(custom);
  const [msg, setMsg] = useState("");
  const effective = cur ?? def;
  const per = (r: number) => splitAmount(10000, r, 0.036, 0.5);
  async function set(rate: number | null) {
    setMsg("");
    const r = await apiFetch("/api/admin", { method: "POST", body: JSON.stringify({ action: "setDraftRate", draftId, rate }) });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error);
    setCur(rate);
    onSaved({ ...rates, effective: rate ?? def });
    setMsg("保存しました。これからの注文に使います（これまでの注文はそのままです）。");
  }
  const btn = (on: boolean) => `rounded-xl py-2 px-3 text-sm font-bold border ${on ? "bg-sky-700 text-white border-sky-700" : "border-black/15"}`;
  const ex = per(effective);
  return (
    <section className="rounded-2xl bg-sky-50 p-4 border border-sky-200 space-y-2 text-sm">
      <div className="font-bold text-sky-800">分け方（YMM 管理だけに見えています）</div>
      <p className="text-xs text-black/60">YMM の取り分の割合。そこから決済手数料を引いた残りを、YMM とパートナーで半分ずつ。</p>
      <div className="flex flex-wrap gap-2">
        <button className={btn(cur === null)} onClick={() => set(null)}>
          {kind === "service" ? "サービスの既定" : "物販の既定"}（{pct(def)}）
        </button>
        <span className="flex items-center gap-1">
          <input className="w-16 rounded-xl border border-black/15 p-2 text-right" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, ""))} placeholder="50" />
          <span>%</span>
          <button className={btn(cur !== null)} disabled={!other} onClick={() => set(Math.round(Number(other) * 10) / 1000)}>
            この割合にする
          </button>
        </span>
      </div>
      <p className="text-xs">いま：{pct(effective)}。1万円売れると、事業者 {ex.owner.toLocaleString()}円・YMM {ex.ymm.toLocaleString()}円・パートナー {ex.partner.toLocaleString()}円（手数料 3.6%・パートナーへ半分の場合）</p>
      {msg && <p className="text-xs text-sky-800">{msg}</p>}
    </section>
  );
}
