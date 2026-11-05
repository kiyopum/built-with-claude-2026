"use client";

// パートナー：公開した商品を Instagram で紹介する（中身は components/ShareFlow.tsx）
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ShareFlow } from "@/components/ShareFlow";

function Inner() {
  const { shopId, draftId } = useParams<{ shopId: string; draftId: string }>();
  const q = useSearchParams();
  const fromEveryone = q.get("from") === "everyone";
  // 「次の小さな一歩」から来たとき：行事と場面を選んだ状態で開く
  return <ShareFlow draftId={draftId} backHref={fromEveryone ? "/everyone" : `/hearing/${shopId}`} initialScene={q.get("scene") ?? undefined} gyoji={q.get("gyoji") ?? undefined} />;
}

export default function SharePage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <Inner />
    </Suspense>
  );
}
