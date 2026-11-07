"use client";

// 商品の写真を撮る／アルバムから選ぶ。送る前に縮小して JPEG にする（通信と Claude の読み取りを軽くするため）
// 1枚目がメイン画像。ラベル（裏面）の写真も撮ってもらう。
import { useEffect, useRef, useState } from "react";

const MAX_EDGE = 1568; // Claude が画像を読むときの推奨の長辺

export type PickedPhoto = { blob: Blob; url: string };

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("写真を変換できませんでした"))), "image/jpeg", 0.85),
  );
}

export function PhotoPicker({ photos, onChange, disabled }: { photos: PickedPhoto[]; onChange: (p: PickedPhoto[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 画面を離れるときにプレビュー用のアドレスを片付ける
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    try {
      const added: PickedPhoto[] = [];
      for (const f of Array.from(files).slice(0, 6 - photos.length)) {
        const blob = await shrink(f);
        added.push({ blob, url: URL.createObjectURL(blob) });
      }
      onChange([...photos, ...added]);
    } catch {
      setError("写真を読み込めませんでした。別の写真で試してください。");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(i: number) {
    URL.revokeObjectURL(photos[i].url);
    onChange(photos.filter((_, j) => j !== i));
  }

  function makeMain(i: number) {
    onChange([photos[i], ...photos.filter((_, j) => j !== i)]);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <div key={p.url} className="relative aspect-square rounded-xl overflow-hidden bg-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={`商品の写真 ${i + 1}`} className="w-full h-full object-cover" />
            {i === 0 ? (
              <span className="absolute left-1 top-1 rounded-full bg-biz text-white text-[10px] font-bold px-2 py-0.5">メイン</span>
            ) : (
              <button onClick={() => makeMain(i)} className="absolute left-1 top-1 rounded-full bg-white/90 text-[10px] px-2 py-0.5">
                メインにする
              </button>
            )}
            <button
              onClick={() => remove(i)}
              aria-label="この写真を外す"
              className="absolute right-1 top-1 w-6 h-6 rounded-full bg-black/60 text-white text-sm leading-none"
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < 6 && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className="aspect-square rounded-xl border-2 border-dashed border-biz/50 text-biz grid place-items-center text-sm font-bold disabled:opacity-50"
          >
            {busy ? "読み込み中…" : photos.length ? "＋ 写真を追加" : "📷 写真を撮る"}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      <p className="text-xs text-black/50">商品の表と、ラベル（裏の表示）も撮ってください。ラベルの中身は Claude が読み取ります。最大6枚。</p>
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    </div>
  );
}
