"use client";

// ありがとうの往復便：箱に入れるお手紙カード（はがきくらいの大きさ）。印刷するか、スマホの画面を見せる
import QRCode from "qrcode";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Data = { shop_name: string; product_name: string };

function CardInner() {
  const t = useSearchParams().get("t") ?? "";
  const [data, setData] = useState<Data | null>(null);
  const [qr, setQr] = useState("");
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/t/${t}`;

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/t/${t}`, { margin: 1, width: 360 }).then(setQr);
    fetch(`/api/letters/${t}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, [t]);

  if (!data) return <p className="text-black/50">読み込み中…</p>;
  return (
    <div className="space-y-4">
      <style>{`@media print { header, footer, .no-print { display: none !important; } main { padding: 0 !important; max-width: none !important; } @page { size: 148mm 100mm; margin: 6mm; } }`}</style>
      <div className="no-print flex gap-2">
        <button className="flex-1 rounded-xl bg-biz text-white py-3 font-bold" onClick={() => window.print()}>
          🖨 印刷する
        </button>
      </div>
      <p className="no-print text-xs text-black/50">はがきの横向きくらいの大きさで印刷されます。商品と一緒に箱に入れてください。</p>
      <div className="mx-auto max-w-[560px] rounded-2xl border-2 border-biz bg-white p-5 flex gap-4 items-center">
        <div className="flex-1 space-y-2">
          <div className="text-xs text-black/50">{data.product_name}</div>
          <div className="text-lg font-bold leading-snug">{data.shop_name}より</div>
          <p className="text-sm leading-relaxed">
            お選びいただき、ありがとうございます。
            <br />
            よかったら、届いた感想をひとこと聞かせてください。うれしかったことも、「こうだったらもっといい」も。事業者の人が読んで、お返事します。
          </p>
          <p className="text-xs text-black/50">お返事は、同じ QR を読みこむと読めます。</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt="事業者さんにひとことを送る QR" className="w-32 h-32 shrink-0" />}
      </div>
      <p className="no-print text-xs text-black/40 break-all text-center">{url}</p>
    </div>
  );
}

export default function CardPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <CardInner />
    </Suspense>
  );
}
