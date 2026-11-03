"use client";

// パートナー：お店のヒアリング（理念・思い。1回だけ）
import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { VoiceInput, appendRecordings } from "@/components/VoiceInput";
import { QuestionList, type Question } from "@/components/QuestionList";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";

function AboutInner() {
  const { shopId } = useParams<{ shopId: string }>();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState<"" | "q" | "send">("");
  const [error, setError] = useState("");
  const voice = useVoiceInput((text) => setTranscript((t) => (t ? t.replace(/\s*$/, "\n") : "") + text));

  async function makeQuestions() {
    setError("");
    setBusy("q");
    const r = await apiFetch(`/api/shops/${shopId}/about/questions`, { method: "POST" });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    setQuestions(j.questions);
  }

  async function send() {
    setError("");
    if (voice.recording) voice.stop();
    setBusy("send");
    const fd = new FormData();
    fd.append("transcript", transcript);
    appendRecordings(fd, voice);
    const r = await apiFetch(`/api/shops/${shopId}/about`, { method: "POST", body: fd });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    voice.clearRecordings();
    setTranscript("");
    router.push(`/hearing/${shopId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/hearing/${shopId}`} className="text-sm text-leaf">← お店のページ</Link>
        <h1 className="text-xl font-bold mt-1">お店のヒアリング</h1>
        <p className="text-sm text-black/60">お店を始めたきっかけや、大事にしていることを聞きます。商品のことは、あとで写真を撮りながら1つずつ聞きます。</p>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">1) 聞くことリスト</div>
        {questions.length === 0 ? (
          <button className="w-full rounded-xl border-2 border-leaf text-leaf py-3 font-bold disabled:opacity-50" onClick={makeQuestions} disabled={busy !== ""}>
            {busy === "q" ? <Working text="Claude が質問を考えています" est={15} /> : "このお店向けの質問を Claude に作ってもらう"}
          </button>
        ) : (
          <QuestionList questions={questions} />
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">2) お話を聞く</div>
        <VoiceInput voice={voice} value={transcript} onChange={setTranscript} disabled={busy !== ""} />
      </section>

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
      <button
        className="w-full rounded-2xl bg-carrot text-white py-4 text-lg font-bold disabled:opacity-50"
        onClick={send}
        disabled={!transcript.trim() || busy !== ""}
      >
        {busy === "send" ? <Working text="Claude がお店の紹介を書いています" est={10} /> : "送信して、お店の紹介を作る"}
      </button>
    </div>
  );
}

export default function AboutPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <AboutInner />
    </Suspense>
  );
}
