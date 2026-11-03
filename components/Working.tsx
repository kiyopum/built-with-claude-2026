"use client";

// Claude が作業中であることを見せる表示（ボタンの中に入れる）
// くるくる回る輪＋流れるバー＋経過秒数。止まって見えて不安にならないように。
// 目安の時間（est）は実測から。目安の2倍を超えたら「いつもより時間がかかっています」と出す。
import { useEffect, useState } from "react";

export function Working({ text, est }: { text: string; est?: number }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const slow = est !== undefined && sec > est * 2;
  return (
    <span className="yb-working flex flex-col items-center gap-1.5 w-full" role="status" aria-live="polite">
      <span className="flex items-center justify-center gap-2">
        <span className="inline-block w-5 h-5 shrink-0 rounded-full border-[3px] border-current border-t-transparent animate-spin" aria-hidden />
        <span>{text}</span>
      </span>
      <span className="text-xs font-normal opacity-90">
        {sec}秒{est !== undefined && !slow && `（いつも${est >= 60 ? `${Math.round(est / 60)}分` : `${est}秒`}ほど）`}
        {slow && "　いつもより時間がかかっています。このままお待ちください"}
      </span>
      <span className="block w-full h-1 rounded-full bg-current/20 overflow-hidden" aria-hidden>
        <span className="yb-bar block h-full w-1/3 rounded-full bg-current" />
      </span>
    </span>
  );
}
