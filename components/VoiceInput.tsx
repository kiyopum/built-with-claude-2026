"use client";

// 録音ボタン（ど真ん中）＋話した言葉が入る欄。親で useVoiceInput を呼んで渡す
import type { useVoiceInput } from "@/lib/useVoiceInput";

type Voice = ReturnType<typeof useVoiceInput>;

export function VoiceInput({
  voice,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  voice: Voice;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const total = voice.recordings.reduce((a, r) => a + r.seconds, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-2">
        <button
          onClick={voice.recording ? voice.stop : voice.start}
          disabled={disabled}
          aria-label={voice.recording ? "録音を止める" : "録音を始める"}
          className={`w-32 h-32 rounded-full grid place-items-center text-white shadow-lg transition disabled:opacity-50 ${
            voice.recording ? "bg-red-600 animate-pulse" : "bg-carrot"
          }`}
        >
          {voice.recording ? (
            <span className="w-10 h-10 rounded-md bg-white" />
          ) : (
            <svg viewBox="0 0 24 24" className="w-14 h-14" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
            </svg>
          )}
        </button>
        <div className="text-sm font-bold">
          {voice.recording
            ? `録音中 ${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, "0")}　押すと止まります`
            : voice.recordings.length
              ? "押すと続きを録音します"
              : "押して録音を始める"}
        </div>
        {voice.recordings.length > 0 && (
          <div className="text-xs text-black/50">
            録音 {voice.recordings.length} 件（合計 {Math.floor(total / 60)}分{total % 60}秒）。送信するとまとめて保存します
          </div>
        )}
      </div>
      {voice.warning && <p className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">{voice.warning}</p>}
      <div>
        <textarea
          className="w-full min-h-48 rounded-xl border border-black/15 p-3 text-base leading-relaxed"
          placeholder={placeholder ?? "話した言葉がここに入ります。聞き間違いは手で直せます。録音できないときは、ここに直接書いてください。"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {voice.interim && <p className="text-sm text-black/40 px-1">…{voice.interim}</p>}
      </div>
    </div>
  );
}

// 録音ファイルを FormData に入れる
export function appendRecordings(fd: FormData, voice: Voice) {
  voice.recordings.forEach((rec, i) => {
    const ext = rec.blob.type.includes("mp4") ? "m4a" : "webm";
    fd.append("audio", rec.blob, `rec-${i + 1}.${ext}`);
  });
}
