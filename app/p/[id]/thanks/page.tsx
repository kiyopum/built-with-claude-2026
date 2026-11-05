"use client";

// 決済完了ページ。Stripe に支払い状況を確かめて、注文を記録する
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

function ThanksPageInner() {
  const { id } = useParams<{ id: string }>();
  const sessionId = useSearchParams().get("session_id") ?? "";
  const [state, setState] = useState<"checking" | "paid" | "unpaid" | "error">("checking");
  const [amount, setAmount] = useState<number | null>(null);
  const [letter, setLetter] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/checkout/confirm", { method: "POST", body: JSON.stringify({ sessionId }) })
      .then((r) => r.json())
      .then((j: { paid?: boolean; amount?: number; letter?: string | null; error?: string }) => {
        if (j.error) return setState("error");
        setAmount(j.amount ?? null);
        setLetter(j.letter ?? null);
        setState(j.paid ? "paid" : "unpaid");
      })
      .catch(() => setState("error"));
  }, [sessionId]);

  return (
    <div className="space-y-5 text-center py-8">
      {state === "checking" && <p className="text-black/60">お支払いを確認しています…</p>}
      {state === "paid" && (
        <>
          <div className="text-5xl">🎉</div>
          <h1 className="text-2xl font-bold">ご購入ありがとうございます</h1>
          {amount !== null && <p className="text-lg">お支払い {amount.toLocaleString()}円</p>}
          <p className="text-sm text-black/60">デモのため、テスト用の決済です。商品は届きません。</p>
          {letter && (
            <Link href={`/t/${letter}`} className="block rounded-2xl bg-white border-2 border-leaf p-4 text-left">
              <div className="font-bold text-leaf">📮 お店に一言とどける</div>
              <div className="text-sm text-black/70">届いたあとでも大丈夫です。お店の人が読んで、お返事します。お返事は、このページ（とカードの QR）で読めます。</div>
            </Link>
          )}
        </>
      )}
      {state === "unpaid" && <p>お支払いがまだ完了していません。</p>}
      {state === "error" && <p className="text-red-700">お支払いを確認できませんでした。</p>}
      <Link href={`/p/${id}`} className="inline-block text-leaf underline">
        商品ページに戻る
      </Link>
    </div>
  );
}

// アドレスの番号を読むので、読み込み中の表示（Suspense）で包む
export default function ThanksPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <ThanksPageInner />
    </Suspense>
  );
}
