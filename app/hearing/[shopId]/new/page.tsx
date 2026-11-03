"use client";

// パートナー：商品を1つ追加する。写真を撮る → Claude がラベルを読んで質問を作る → 録音 → 商品ページ1件
import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { VoiceInput, appendRecordings } from "@/components/VoiceInput";
import { PhotoPicker, type PickedPhoto } from "@/components/PhotoPicker";
import { QuestionList, type Question } from "@/components/QuestionList";

type Analysis = {
  product_guess: string;
  label_read: { name: string; value: string | null }[];
  questions: Question[];
};

function NewProductInner() {
  const { shopId } = useParams<{ shopId: string }>();
  const router = useRouter();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState<"" | "analyze" | "send">("");
  const [error, setError] = useState("");
  const voice = useVoiceInput((text) => setTranscript((t) => (t ? t.replace(/\s*$/, "\n") : "") + text));

  function photoForm() {
    const fd = new FormData();
    photos.forEach((p, i) => fd.append("photo", p.blob, `photo-${i + 1}.jpg`));
    return fd;
  }

  async function analyze() {
    setError("");
    setBusy("analyze");
    const r = await fetch(`/api/shops/${shopId}/products/analyze`, { method: "POST", body: photoForm() });
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
    appendRecordings(fd, voice);
    const r = await fetch(`/api/shops/${shopId}/products`, { method: "POST", body: fd });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    voice.clearRecordings();
    router.push(`/hearing/${shopId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/hearing/${shopId}`} className="text-sm text-leaf">← お店のページ</Link>
        <h1 className="text-xl font-bold mt-1">商品を追加</h1>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">1) 写真を撮る</div>
        <PhotoPicker
          photos={photos}
          onChange={(p) => {
            setPhotos(p);
            setAnalysis(null);
          }}
          disabled={busy !== ""}
        />
        {photos.length > 0 && !analysis && (
          <button className="w-full rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-50" onClick={analyze} disabled={busy !== ""}>
            {busy === "analyze" ? "Claude が写真とラベルを読んでいます…" : "Claude に写真を見てもらう"}
          </button>
        )}
      </section>

      {analysis && (
        <>
          <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
            <div className="text-sm font-bold text-leaf">2) 写真から分かったこと</div>
            <p className="font-bold">{analysis.product_guess}</p>
            <table className="w-full text-sm">
              <tbody>
                {analysis.label_read.map((l, i) => (
                  <tr key={i} className="border-t border-black/5">
                    <th className="text-left font-normal text-black/60 py-1 pr-2 w-24 align-top">{l.name}</th>
                    <td className={`py-1 ${l.value ? "" : "text-red-600"}`}>{l.value ?? "読み取れず → 聞く"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
            <div className="text-sm font-bold text-leaf">3) 聞くこと（写真で分かったことは省いています）</div>
            <QuestionList questions={analysis.questions} />
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
            <div className="text-sm font-bold text-leaf">4) お話を聞く</div>
            <VoiceInput voice={voice} value={transcript} onChange={setTranscript} disabled={busy !== ""} />
          </section>
        </>
      )}

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      {analysis && (
        <button
          className="w-full rounded-2xl bg-carrot text-white py-4 text-lg font-bold disabled:opacity-50"
          onClick={send}
          disabled={!transcript.trim() || busy !== ""}
        >
          {busy === "send" ? "Claude が法律に照らして、商品ページを作っています…（1分ほど）" : "送信して、商品ページを作る"}
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
