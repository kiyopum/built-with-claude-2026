"use client";

// パートナー：公開した商品を Instagram で紹介する（中身は components/ShareFlow.tsx）
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ShareFlow } from "@/components/ShareFlow";

function Inner() {
  const { shopId, draftId } = useParams<{ shopId: string; draftId: string }>();
  const fromEveryone = useSearchParams().get("from") === "everyone";
  return <ShareFlow draftId={draftId} backHref={fromEveryone ? "/everyone" : `/hearing/${shopId}`} />;
}

export default function SharePage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <Inner />
    </Suspense>
  );
}
