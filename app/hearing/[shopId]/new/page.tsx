"use client";

// パートナー：商品を1つ追加する。写真を撮る → Claude がラベルを読んで質問を作る → 録音 → 商品ページ1件
//   ?kind=service：サービス（ライブ配信・講座・体験など）。写真はなくてもよい。送らないので送料も要らない
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { VoiceInput, appendRecordings } from "@/components/VoiceInput";
import { PhotoPicker, type PickedPhoto } from "@/components/PhotoPicker";
import { QuestionList, type Question } from "@/components/QuestionList";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";

type Analysis = {
  product_guess: string;
  label_read: { name: string; value: string | null }[];
  questions: Question[];
};

function NewProductInner() {
  const { shopId } = useParams<{ shopId: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const service = params.get("kind") === "service";
  // 「次の商品を提案する」の案から来たとき（?seed=案の番号）。案の中身はサーバーに残してあるものを見せる
  const seed = service ? params.get("seed") : null;
  const [idea, setIdea] = useState<{ name: string; form: string; what: string; check: string } | null>(null);
  useEffect(() => {
    if (seed == null) return;
    fetch(`/api/shops/${shopId}`)
      .then((r) => r.json())
      .then((j) => setIdea(j.shop?.proposals?.[Number(seed)] ?? null))
      .catch(() => {});
  }, [shopId, seed]);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState<"" | "analyze" | "send">("");
  const [error, setError] = useState("");
  const voice = useVoiceInput((text) => setTranscript((t) => (t ? t.replace(/\s*$/, "\n") : "") + text));

  function photoForm() {
    const fd = new FormData();
    photos.forEach((p, i) => fd.append("photo", p.blob, `photo-${i + 1}.jpg`));
    if (service) fd.append("kind", "service");
    if (seed != null) fd.append("seed", seed);
    return fd;
  }

  async function analyze() {
    setError("");
    setBusy("analyze");
    const r = await apiFetch(`/api/shops/${shopId}/products/analyze`, { method: "POST", body: photoForm() });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    setAnalysis(j);
  }

  async function send() {
    setError("");
    if (voice.recording) voice.stop();
    setBusy("send");
    const fd = photoForm();
    fd.append("transcript", transcript);
    fd.append("label_read", JSON.stringify(analysis?.label_read ?? []));
    // kind は photoForm() が入れている
    appendRecordings(fd, voice);
    const r = await apiFetch(`/api/shops/${shopId}/products`, { method: "POST", body: fd });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    voice.clearRecordings();
    // 次の「＋商品を追加」で前の商品の写真や話が残らないように、全部空にしてから移る
    setPhotos([]);
    setAnalysis(null);
    setTranscript("");
    router.push(`/hearing/${shopId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/hearing/${shopId}`} className="text-sm text-biz">← 事業者のページ</Link>
        <h1 className="text-xl font-bold mt-1">{service ? "サービスを追加" : "商品を追加"}</h1>
        {service && <p className="text-sm text-black/60">ライブ配信・オンライン講座・教室・体験など、ものを送らないもの。申し込んだ人には、事業者さんからメールで案内を送ります。</p>}
      </div>

      {idea && (
        <section className="rounded-2xl bg-biz/10 p-4 space-y-1">
          <div className="text-xs font-bold text-biz">🌱 提案から始めます（{idea.form}）</div>
          <div className="font-bold">{idea.name}</div>
          <p className="text-sm">{idea.what}</p>
          <p className="text-xs text-black/60">これは案です。日時・値段・中身は、事業者さんのお話で決まります。聞いたとおりに申し込みページを作ります。</p>
          {idea.check && <p className="text-xs text-amber-700">出す前に確かめること：{idea.check}</p>}
        </section>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-biz">1) 写真を撮る{service && <span className="font-normal text-black/50">（チラシや講師・会場の写真。なくても大丈夫）</span>}</div>
        <PhotoPicker
          photos={photos}
          onChange={(p) => {
            setPhotos(p);
            setAnalysis(null);
          }}
          disabled={busy !== ""}
        />
        {(photos.length > 0 || service) && !analysis && (
          <button className="w-full rounded-xl bg-ai text-white py-3 font-bold disabled:opacity-50" onClick={analyze} disabled={busy !== ""}>
            {busy === "analyze" ? (
              <Working text={service ? "Claude が聞くことを考えています" : "Claude が写真とラベルを読んでいます"} est={25} />
            ) : service ? (
              photos.length ? "Claude に写真を見て、聞くことを作ってもらう" : "写真なしで、聞くことを作ってもらう"
            ) : (
              "Claude に写真を見てもらう"
            )}
          </button>
        )}
      </section>

      {analysis && (
        <>
          <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
            <div className="text-sm font-bold text-biz">{service ? "2) 申し込みページに書くこと" : "2) 写真から分かったこと"}</div>
            <p className="font-bold">{analysis.product_guess}</p>
            <table className="w-full text-sm">
              <tbody>
                {analysis.label_read.map((l, i) => (
                  <tr key={i} className="border-t border-black/5">
                    <th className="text-left font-normal text-black/60 py-1 pr-2 w-24 align-top">{l.name}</th>
                    <td className={`py-1 ${l.value ? "" : "text-red-600"}`}>{l.value ?? (service ? "まだ分からない → 聞く" : "読み取れず → 聞く")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
            <div className="text-sm font-bold text-biz">{service ? "3) 聞くこと" : "3) 聞くこと（写真で分かったことは省いています）"}</div>
            <QuestionList questions={analysis.questions} />
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
            <div className="text-sm font-bold text-biz">4) お話を聞く</div>
            <VoiceInput voice={voice} value={transcript} onChange={setTranscript} disabled={busy !== ""} />
          </section>
        </>
      )}

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      {analysis && (
        <button
          className="w-full rounded-2xl bg-ai text-white py-4 text-lg font-bold disabled:opacity-50"
          onClick={send}
          disabled={!transcript.trim() || busy !== ""}
        >
          {busy === "send" ? <Working text="Claude が法律に照らして、商品ページを作っています" est={90} /> : service ? "送信して、申し込みページを作る" : "送信して、商品ページを作る"}
        </button>
      )}
    </div>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <NewProductInner />
    </Suspense>
  );
}
