"use client";

// パートナー：事業者のヒアリング（理念・思い。1回だけ）
//   ホームページがあれば先に Claude に読んでもらい、ヒアリングはそれを補う（Instagram だけの事業者は今までどおりヒアリング）
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
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
  const [busy, setBusy] = useState<"" | "q" | "send" | "web" | "find">("");
  const [shopLabel, setShopLabel] = useState("");
  const [cands, setCands] = useState<{ url: string; title: string; kind: string; reason: string }[] | null>(null);
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [prepared, setPrepared] = useState(false);

  useEffect(() => {
    fetch(`/api/shops/${shopId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.shop) setShopLabel([j.shop.name, j.shop.area].filter(Boolean).join("・"));
        if (j.shop?.website_url) setUrl(j.shop.website_url);
        if (j.shop?.website_notes) setNotes(j.shop.website_notes);
        if (j.shop?.prepared) setPrepared(true);
      })
      .catch(() => {});
  }, [shopId]);

  async function findWebsite() {
    setError("");
    setBusy("find");
    const r = await apiFetch(`/api/shops/${shopId}/about/website`, { method: "POST", body: JSON.stringify({ search: true }) });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    setCands(j.candidates);
  }

  async function readWebsite(target = url) {
    setError("");
    setUrl(target);
    setBusy("web");
    const r = await apiFetch(`/api/shops/${shopId}/about/website`, { method: "POST", body: JSON.stringify({ url: target }) });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    setNotes(j.website_notes);
    setUrl(j.website_url);
    setShowNotes(true);
    setPrepared(false);
    setQuestions([]); // 質問はホームページの中身に合わせて作り直す
  }
  async function clearWebsite() {
    setError("");
    const r = await apiFetch(`/api/shops/${shopId}/about/website`, { method: "POST", body: JSON.stringify({ clear: true }) });
    if (!r.ok) return setError((await r.json()).error);
    setNotes(null);
    setUrl("");
    setCands(null);
    setPrepared(false);
    setQuestions([]);
  }
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
        <Link href={`/hearing/${shopId}`} className="text-sm text-leaf">← 事業者のページ</Link>
        <h1 className="text-xl font-bold mt-1">事業者のヒアリング</h1>
        <p className="text-sm text-black/60">事業を始めたきっかけや、大事にしていることを聞きます。商品のことは、あとで写真を撮りながら1つずつ聞きます。</p>
      </div>
      {prepared && (
        <p className="rounded-2xl bg-leaf/10 p-3 text-sm">
          ✅ <b>事務局が先に調べてあります</b>（ホームページ・法律・聞くことリスト）。下の「聞くことリスト」を開いて、そのままお話を聞いてください。
        </p>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">1) 事業者のホームページ（あれば）</div>
        <p className="text-xs text-black/60">
          事業者の名前と地域で Claude がホームページを探して、読みます。お話は、ホームページに載っていないことを聞くだけで済みます。Instagram だけの事業者は、ここを飛ばしてお話を聞いてください。
        </p>
        {notes ? (
          <div className="space-y-2">
            <div className="rounded-xl bg-leaf/10 p-3 text-sm">
              <div className="font-bold text-leaf">✅ ホームページを読みました</div>
              <div className="text-xs text-black/60 break-all">{url}</div>
            </div>
            <button className="text-sm text-leaf underline" onClick={() => setShowNotes(!showNotes)}>
              {showNotes ? "まとめを閉じる" : "Claude のまとめを見る"}
            </button>
            {showNotes && <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-black/[0.03] rounded-xl p-3 font-sans">{notes}</pre>}
            <button className="block text-xs text-black/50 underline" onClick={clearWebsite} disabled={busy !== ""}>
              ホームページを使わない（読んだ内容を消す）
            </button>
          </div>
        ) : busy === "web" ? (
          <div className="rounded-xl bg-black/[0.03] p-3 text-sm space-y-1">
            <Working text="Claude がホームページを読んでいます" est={40} />
            <div className="text-xs text-black/50 break-all">{url}</div>
          </div>
        ) : (
          <div className="space-y-3">
            {prepared ? (
              // 事務局が探して、使えるホームページがなかった（SNS だけ・見つからない）。もう一度 Claude に探させない
              <p className="rounded-xl bg-black/[0.03] p-3 text-sm">事務局が探しましたが、使えるホームページはありませんでした。このまま下でお話を聞いてください。</p>
            ) : (
              <button className="w-full rounded-xl border-2 border-leaf text-leaf py-3 font-bold disabled:opacity-50" onClick={findWebsite} disabled={busy !== ""}>
                {busy === "find" ? <Working text="Claude が探しています" est={20} /> : `🔍 ホームページを探す${shopLabel ? `（${shopLabel}）` : ""}`}
              </button>
            )}
            {cands && cands.length === 0 && (
              <p className="rounded-xl bg-black/[0.03] p-3 text-sm">見つかりませんでした。ホームページのない事業者は、このまま下でお話を聞いてください。</p>
            )}
            {cands && cands.length > 0 && (
              <ul className="space-y-2">
                <li className="text-xs text-black/60">この事業者のものを選んでください（事業者さんに「これですか？」と見せると確実です）</li>
                {cands.map((c) => (
                  <li key={c.url} className="rounded-xl border border-black/10 p-3 text-sm space-y-1">
                    <div className="flex justify-between gap-2">
                      <b className="line-clamp-2">{c.title}</b>
                      <span className="shrink-0 text-xs text-black/50">{c.kind}</span>
                    </div>
                    <div className="text-xs text-black/50 break-all">{c.url}</div>
                    <div className="text-xs text-black/70">{c.reason}</div>
                    {c.kind === "SNS" ? (
                      <div className="text-xs text-black/50">SNS は中身が読めないので、お話で聞いてください</div>
                    ) : (
                      <button className="w-full rounded-lg bg-leaf text-white py-2 font-bold" onClick={() => readWebsite(c.url)}>
                        これを Claude に読んでもらう
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!manual ? (
              <button className="text-xs text-black/50 underline" onClick={() => setManual(true)}>
                アドレスが分かっているときは、ここに入れる
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  className="w-full rounded-xl border border-black/15 p-3 text-base"
                  inputMode="url"
                  autoCapitalize="off"
                  placeholder="https://〜"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <button className="w-full rounded-xl border border-leaf text-leaf py-2 font-bold disabled:opacity-50" onClick={() => readWebsite()} disabled={!url.trim() || busy !== ""}>
                  このアドレスを読んでもらう
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">2) 聞くことリスト{notes && <span className="font-normal text-black/50">（ホームページに載っていないことだけ）</span>}</div>
        {questions.length === 0 ? (
          <button className="w-full rounded-xl border-2 border-leaf text-leaf py-3 font-bold disabled:opacity-50" onClick={makeQuestions} disabled={busy !== ""}>
            {busy === "q" ? <Working text="Claude が質問を考えています" est={15} /> : prepared ? "事務局が用意した質問を開く" : "この事業者向けの質問を Claude に作ってもらう"}
          </button>
        ) : (
          <QuestionList questions={questions} />
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">3) お話を聞く{notes && <span className="font-normal text-black/50">（補足。短くても大丈夫）</span>}</div>
        <VoiceInput voice={voice} value={transcript} onChange={setTranscript} disabled={busy !== ""} />
      </section>

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
      <button
        className="w-full rounded-2xl bg-carrot text-white py-4 text-lg font-bold disabled:opacity-50"
        onClick={send}
        disabled={(!transcript.trim() && !notes) || busy !== ""}
      >
        {busy === "send" ? <Working text="Claude が事業者の紹介を書いています" est={10} /> : !transcript.trim() && notes ? "ホームページだけで、事業者の紹介を作る" : "送信して、事業者の紹介を作る"}
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
