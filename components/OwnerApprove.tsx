"use client";

// 事業者さんの OK（パートナーのスマホを事業者さんに渡して、事業者さんの暗証番号を押してもらう）
// リリース・事業者の紹介の公開OK・注文と届け先を見る、で使う
import { useState } from "react";
import { PinPad } from "@/components/PinPad";
import { Working } from "@/components/Working";

export function OwnerApprove({
  button,
  label,
  onPin,
  disabled,
  workingText,
  est,
  note,
}: {
  button: string;
  label: string;
  onPin: (pin: string) => Promise<string>; // 失敗したらエラー文を返す。成功は ""
  disabled?: boolean;
  workingText?: string;
  est?: number;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function done(pin: string) {
    setBusy(true);
    setError("");
    const err = await onPin(pin);
    setBusy(false);
    if (err) {
      setError(err);
      return false;
    }
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <button className="w-full rounded-2xl bg-biz text-white py-4 text-lg font-bold disabled:opacity-30" disabled={disabled} onClick={() => setOpen(true)}>
          {button}
        </button>
        {note && <p className="text-xs text-black/50">{note}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-biz bg-biz/5 p-4 space-y-3">
      <p className="text-center text-sm">📱 スマホを事業者さんに渡してください</p>
      {busy ? (
        <div className="py-8 text-center text-biz font-bold">
          <Working text={workingText ?? "確かめています"} est={est} />
        </div>
      ) : (
        <PinPad label={label} onDone={done} />
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm text-center">{error}</p>}
      <button className="w-full text-sm text-black/50" disabled={busy} onClick={() => (setOpen(false), setError(""))}>
        やめる
      </button>
    </div>
  );
}
