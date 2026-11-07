"use client";

// 事業者さん：自分の事業者の商品を、事業者の Instagram で紹介する（ログインしない。事業者さんの暗証番号で開く）
// リンクにパートナー番号は入らないので、売れたらパートナーの取り分は全部事業者の担当へ
import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PinPad } from "@/components/PinPad";
import { ShareFlow } from "@/components/ShareFlow";
import { Working } from "@/components/Working";

function Inner() {
  const { id } = useParams<{ id: string }>();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check(p: string) {
    setBusy(true);
    setError("");
    const r = await apiFetch(`/api/drafts/${id}/sns`, { headers: { "x-shop-pin": p } });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(j.error ?? "開けませんでした");
      return false;
    }
    if (j.status !== "published") {
      setError("公開した商品だけ紹介できます");
      return false;
    }
    setPin(p);
  }

  if (pin) return <ShareFlow draftId={id} backHref={`/p/${id}`} shopPin={pin} />;

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/p/${id}`} className="text-sm text-biz">← 商品のページ</Link>
        <h1 className="text-xl font-bold mt-1">事業者の Instagram で紹介する</h1>
        <p className="text-sm text-black/60">事業者さん用です。事業者さんの暗証番号を押すと、紹介の画像と文章を Claude が作ります。</p>
      </div>
      {busy ? (
        <div className="py-8 text-center text-biz font-bold">
          <Working text="確かめています" />
        </div>
      ) : (
        <PinPad label="事業者さんの暗証番号" onDone={check} />
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm text-center">{error}</p>}
    </div>
  );
}

export default function OwnerSharePage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <Inner />
    </Suspense>
  );
}
