"use client";

// 暗証番号4けたの入力。キーボードを出さず、大きな数字ボタンで押す（IT に慣れていない人向け）
// 4けた押すと自動で onDone を呼ぶ
import { useState } from "react";

export function PinPad({ onDone, busy, label }: { onDone: (pin: string) => Promise<boolean | void> | void; busy?: boolean; label?: string }) {
  const [pin, setPin] = useState("");

  async function press(d: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      const ok = await onDone(next);
      // 失敗したら消して、もう一度押せるようにする
      if (ok === false) setPin("");
    }
  }

  return (
    <div className="space-y-4">
      {label && <p className="text-center font-bold">{label}</p>}
      <div className="flex justify-center gap-4" aria-label={`${pin.length}けた入力済み`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`w-5 h-5 rounded-full border-2 border-leaf ${i < pin.length ? "bg-leaf" : ""}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="rounded-2xl bg-white border border-black/10 shadow-sm py-4 text-2xl font-bold active:bg-leaf/10" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className="rounded-2xl py-4 text-sm text-black/60" onClick={() => setPin("")}>
          けす
        </button>
        <button type="button" className="rounded-2xl bg-white border border-black/10 shadow-sm py-4 text-2xl font-bold active:bg-leaf/10" onClick={() => press("0")}>
          0
        </button>
        <button type="button" className="rounded-2xl py-4 text-sm text-black/60" onClick={() => setPin(pin.slice(0, -1))}>
          ← 1つ戻す
        </button>
      </div>
    </div>
  );
}
