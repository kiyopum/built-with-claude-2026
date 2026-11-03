"use client";

// パートナー：公開した商品を Instagram でシェアする（カルーセル4枚＋本文）
//   1) Claude が投稿文を作り、法律チェックもする（問題の言葉は欄の真下に出す）
//   2) 端末の中でカルーセル画像を作る（4枚目は、パートナー番号つきリンクの QR コード）
//   3) 本文をコピー → 画像を共有画面から Instagram へ。最後の「シェア」は人が押す
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Working } from "@/components/Working";
import { renderCarousel } from "@/components/carousel";
import type { Legal } from "@/components/LegalPanel";

type Post = {
  caption: string;
  hashtags: string[];
  slides: { cover: string; point_title: string; point_text: string; story_text: string };
};
type Saved = { post: Post; legal: Legal } | null;
type Product = { name: string; price_yen: number; shop_name: string; photos: string[] };

const VERDICT_STYLE = {
  販売できる: "bg-leaf text-white",
  直せば販売できる: "bg-amber-500 text-white",
  このままでは販売できない: "bg-red-600 text-white",
};
const REF_KEY = "yaobiz-partner-ref";

function textOf(p: Post) {
  return `${p.caption}\n\n${p.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`;
}

function ShareInner() {
  const { shopId, draftId } = useParams<{ shopId: string; draftId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [saved, setSaved] = useState<Saved>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [ref, setRef] = useState("P01");
  const [images, setImages] = useState<{ blob: Blob; url: string }[]>([]);
  const [busy, setBusy] = useState<"" | "generate" | "check" | "render">("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    Promise.all([apiFetch(`/api/products/${draftId}`).then((r) => r.json()), apiFetch(`/api/drafts/${draftId}/sns`).then((r) => r.json())]).then(
      ([p, s]) => {
        if (p.product) setProduct(p.product);
        else setError(p.error ?? "公開した商品だけシェアできます");
        setSaved(s.saved);
        setPost(s.saved?.post ?? null);
        // 前に入れたパートナー番号を使う（保存できない端末では毎回 P01）
        try {
          const r = localStorage.getItem(REF_KEY);
          if (r) setRef(r);
        } catch {
          /* そのまま P01 */
        }
      },
    );
  }, [draftId]);

  const url = typeof window === "undefined" ? "" : `${window.location.origin}/p/${draftId}?ref=${encodeURIComponent(ref)}`;
  const legal = saved?.legal ?? null;
  const edited = !!post && !!saved && JSON.stringify(post) !== JSON.stringify(saved.post);
  const blocked = legal?.verdict === "このままでは販売できない";
  const issues = legal?.items.filter((i) => i.status === "ng" || i.status === "fix" || i.status === "missing") ?? [];

  async function claude(action: "generate" | "check") {
    setError("");
    setBusy(action);
    const r = await apiFetch(`/api/drafts/${draftId}/sns`, { method: "POST", body: JSON.stringify({ action, post }) });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    setSaved(j);
    setPost(j.post);
    setImages([]);
  }

  async function makeImages() {
    if (!post || !product) return;
    setError("");
    setBusy("render");
    try {
      images.forEach((i) => URL.revokeObjectURL(i.url));
      const blobs = await renderCarousel({ photos: product.photos, name: product.name, price: product.price_yen, shopName: product.shop_name, url, slides: post.slides });
      setImages(blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像を作れませんでした");
    } finally {
      setBusy("");
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setError("コピーできませんでした。文を長押しして選んでコピーしてください。");
    }
  }

  async function shareImages() {
    setError("");
    const files = images.map((im, i) => new File([im.blob], `yaobiz-${draftId}-${i + 1}.jpg`, { type: "image/jpeg" }));
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
      } catch {
        /* 共有画面を閉じただけ */
      }
    } else {
      setError("この端末では画像をまとめて共有できません。下の画像を1枚ずつ長押しして保存し、Instagram から選んでください。");
    }
  }

  function saveRef(v: string) {
    const clean = v.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
    setRef(clean);
    setImages([]);
    try {
      localStorage.setItem(REF_KEY, clean);
    } catch {
      /* 保存できなくても使える */
    }
  }

  const input = "w-full rounded-xl border border-black/15 p-3 text-base";
  const warn = (text: string) =>
    issues
      .filter((i) => i.quote && text.includes(i.quote))
      .map((i, n) => (
        <div key={n} className={`rounded-lg border p-2 text-xs ${i.status === "ng" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          <span className={`font-bold ${i.status === "ng" ? "text-red-600" : "text-amber-700"}`}>{i.status === "ng" ? "× NG" : "△ 要修正"}</span>{" "}
          「<span className="font-bold underline decoration-wavy decoration-red-400">{i.quote}</span>」
          <div className="text-black/70 mt-0.5">{i.detail}</div>
        </div>
      ));
  const setSlide = (k: keyof Post["slides"], v: string) => post && setPost({ ...post, slides: { ...post.slides, [k]: v } });

  if (!product && !error) return <p className="text-black/50">読み込み中…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/hearing/${shopId}`} className="text-sm text-leaf">← お店のページ</Link>
        <h1 className="text-xl font-bold mt-1">Instagram でシェア</h1>
        {product && <p className="text-sm text-black/60">{product.name}</p>}
      </div>

      {product && (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
          <label className="block text-sm font-bold text-leaf">あなたのパートナー番号</label>
          <input className={input} value={ref} onChange={(e) => saveRef(e.target.value)} placeholder="例：P01" />
          <p className="text-xs text-black/50">シェアしたリンクや QR から売れると、明細に「シェア経由：{ref || "（なし）"}」と記録されます。</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 min-w-0 truncate text-xs bg-black/5 rounded-lg p-2">{url}</code>
            <button className="shrink-0 rounded-lg border border-leaf/40 text-leaf text-xs font-bold px-3 py-2" onClick={() => copy(url, "link")}>
              {copied === "link" ? "コピーしました" : "リンクをコピー"}
            </button>
          </div>
        </section>
      )}

      {product && !post && (
        <button className="w-full rounded-2xl bg-carrot text-white py-4 text-lg font-bold disabled:opacity-50" onClick={() => claude("generate")} disabled={busy !== ""}>
          {busy === "generate" ? <Working text="Claude が投稿文を書いて、法律チェックしています" est={40} /> : "Claude に投稿文を作ってもらう"}
        </button>
      )}

      {post && (
        <>
          {legal && (
            <section className="rounded-xl border border-black/10 overflow-hidden">
              <div className={`px-3 py-2 font-bold ${VERDICT_STYLE[legal.verdict]}`}>投稿文の法律チェック：{legal.verdict}</div>
              <div className="p-3 text-sm space-y-2">
                <p>{legal.summary}</p>
                {issues.map((i, n) => (
                  <div key={n}>
                    <span className="font-bold">{i.status === "ng" ? "× NG" : i.status === "fix" ? "△ 要修正" : "？ 要確認"}</span> {i.topic}
                    <div className="text-black/70">{i.detail}</div>
                  </div>
                ))}
                {edited && <p className="text-xs font-bold text-amber-700">文を直しました。「法律チェックをやり直す」を押してから使ってください。</p>}
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
            <div className="text-sm font-bold text-leaf">画像に載せる文</div>
            <label className="block text-xs font-bold text-black/60">1枚目（表紙のひとこと）</label>
            <input className={input} value={post.slides.cover} onChange={(e) => setSlide("cover", e.target.value)} />
            {warn(post.slides.cover)}
            <label className="block text-xs font-bold text-black/60">2枚目（こだわりの見出し）</label>
            <input className={input} value={post.slides.point_title} onChange={(e) => setSlide("point_title", e.target.value)} />
            {warn(post.slides.point_title)}
            <label className="block text-xs font-bold text-black/60">2枚目（本文）</label>
            <textarea className={`${input} min-h-20`} value={post.slides.point_text} onChange={(e) => setSlide("point_text", e.target.value)} />
            {warn(post.slides.point_text)}
            <label className="block text-xs font-bold text-black/60">3枚目（お店の思い）</label>
            <textarea className={`${input} min-h-24`} value={post.slides.story_text} onChange={(e) => setSlide("story_text", e.target.value)} />
            {warn(post.slides.story_text)}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
            <div className="text-sm font-bold text-leaf">投稿の本文</div>
            <textarea className={`${input} min-h-48 leading-relaxed`} value={post.caption} onChange={(e) => setPost({ ...post, caption: e.target.value })} />
            {warn(post.caption)}
            <label className="block text-xs font-bold text-black/60">ハッシュタグ（スペース区切り）</label>
            <input
              className={input}
              value={post.hashtags.join(" ")}
              onChange={(e) => setPost({ ...post, hashtags: e.target.value.split(/\s+/).filter(Boolean).map((h) => h.replace(/^#/, "")) })}
            />
          </section>

          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-xl border-2 border-leaf text-leaf py-3 font-bold disabled:opacity-40" onClick={() => claude("check")} disabled={busy !== "" || !edited}>
              {busy === "check" ? <Working text="確かめています" est={25} /> : "法律チェックをやり直す"}
            </button>
            <button className="rounded-xl border-2 border-carrot text-carrot py-3 font-bold disabled:opacity-40" onClick={() => claude("generate")} disabled={busy !== ""}>
              {busy === "generate" ? <Working text="書き直しています" est={40} /> : "Claude に書き直してもらう"}
            </button>
          </div>

          <section className="rounded-2xl bg-white p-4 shadow-sm border-2 border-carrot/40 space-y-3">
            <div className="text-sm font-bold text-carrot">Instagram に出す</div>
            {blocked || edited ? (
              <p className="text-sm text-red-600">
                {blocked ? "投稿文に法律上の問題があります。直して「法律チェックをやり直す」を押してください。" : "直した文の法律チェックがまだです。"}
              </p>
            ) : images.length === 0 ? (
              <button className="w-full rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-50" onClick={makeImages} disabled={busy !== ""}>
                {busy === "render" ? <Working text="画像を作っています" est={3} /> : "カルーセル画像（4枚）を作る"}
              </button>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto -mx-1 px-1 snap-x">
                  {images.map((im, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={im.url} src={im.url} alt={`カルーセル ${i + 1}枚目`} className="h-64 rounded-xl shadow snap-start" />
                  ))}
                </div>
                <ol className="space-y-2">
                  <li>
                    <button className="w-full rounded-xl border-2 border-leaf text-leaf py-3 font-bold" onClick={() => copy(textOf(post), "caption")}>
                      1) {copied === "caption" ? "本文をコピーしました ✓" : "本文とハッシュタグをコピー"}
                    </button>
                  </li>
                  <li>
                    <button className="w-full rounded-xl bg-carrot text-white py-3 font-bold" onClick={shareImages}>
                      2) 画像4枚を Instagram へ
                    </button>
                  </li>
                </ol>
                <p className="text-xs text-black/50">
                  共有画面で Instagram を選び、本文の欄に貼り付けて投稿してください。共有画面に Instagram が出ないときは、画像を保存してから Instagram で選んでください。
                </p>
              </>
            )}
          </section>
        </>
      )}

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <ShareInner />
    </Suspense>
  );
}
