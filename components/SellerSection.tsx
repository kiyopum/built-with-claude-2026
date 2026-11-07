"use client";

// 販売者の情報（ネット販売の表示用）。ヒアリングでは聞かず、名刺を撮って読み取る or 手で入れる
import { useRef, useState } from "react";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";

export type Seller = { seller_name: string; seller_rep: string; seller_address: string; seller_phone: string; seller_email: string };

const FIELDS: { key: keyof Seller; label: string; placeholder: string; type?: string }[] = [
  { key: "seller_name", label: "販売業者名（会社名・屋号）", placeholder: "例：みどりの台所（架空）" },
  { key: "seller_rep", label: "代表者・責任者", placeholder: "例：山田 花子（架空）" },
  { key: "seller_address", label: "住所", placeholder: "例：埼玉県○○市…（架空）" },
  { key: "seller_phone", label: "電話番号", placeholder: "例：048-000-0000", type: "tel" },
  { key: "seller_email", label: "メールアドレス", placeholder: "例：info@example.com", type: "email" },
];

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error("変換できませんでした"))), "image/jpeg", 0.85));
}

export function SellerSection({ shopId, initial }: { shopId: number; initial: Seller }) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "card" | "save">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const filled = FIELDS.filter((f) => saved[f.key]).length;

  async function readCard(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setNote("");
    setBusy("card");
    try {
      const fd = new FormData();
      fd.append("photo", await shrink(files[0]), "card.jpg");
      const r = await apiFetch(`/api/shops/${shopId}/seller/card`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      // 読めた項目だけ上書きする（読めなかった項目は今の入力を残す）
      setForm((f) => {
        const next = { ...f };
        for (const { key } of FIELDS) if (j[key]) next[key] = j[key];
        return next;
      });
      setNote("名刺を読み取りました。間違いがないか確かめて、必要なら直してから保存してください。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "名刺を読み取れませんでした");
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function save() {
    setError("");
    setBusy("save");
    const r = await apiFetch(`/api/shops/${shopId}/seller`, { method: "POST", body: JSON.stringify(form) });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    setSaved(form);
    setNote("");
    setOpen(false);
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-leaf">販売者の情報（ネット販売の表示用）</div>
        <span className={`text-xs ${filled === FIELDS.length ? "text-leaf" : "text-red-600"}`}>
          {filled}/{FIELDS.length} 入力済み
        </span>
      </div>

      {!open ? (
        <>
          {filled > 0 ? (
            <dl className="text-sm space-y-0.5">
              {FIELDS.filter((f) => saved[f.key]).map((f) => (
                <div key={f.key} className="flex gap-2">
                  <dt className="text-black/50 w-24 shrink-0 text-xs pt-0.5">{f.label.replace(/（.*）/, "")}</dt>
                  <dd className="break-all">{saved[f.key]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-black/60">住所や電話番号は、聞き取りでは間違いやすいので、名刺を撮るか手で入れてください。</p>
          )}
          <button className="w-full rounded-xl border border-leaf/40 text-leaf py-3 font-bold" onClick={() => setOpen(true)}>
            {filled > 0 ? "修正する" : "入力する"}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <button
            className="w-full rounded-xl bg-ai text-white py-3 font-bold disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== ""}
          >
            {busy === "card" ? <Working text="Claude が名刺を読んでいます" est={5} /> : "📷 名刺を撮って読み取る"}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => readCard(e.target.files)} />
          {note && <p className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">{note}</p>}
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-bold text-black/60 mb-1">{f.label}</label>
              <input
                className="w-full rounded-xl border border-black/15 p-3 text-base"
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <p className="text-xs text-black/50">名刺の写真はサーバーに残しません（読み取った文字だけを保存します）。</p>
          <div className="flex gap-2">
            <button className="flex-1 rounded-xl bg-carrot text-white py-3 font-bold disabled:opacity-50" onClick={save} disabled={busy !== ""}>
              保存する
            </button>
            <button
              className="rounded-xl border border-black/15 px-4"
              disabled={busy !== ""}
              onClick={() => {
                setForm(saved);
                setNote("");
                setOpen(false);
              }}
            >
              やめる
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    </section>
  );
}
