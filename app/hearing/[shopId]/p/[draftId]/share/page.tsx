"use client";

// パートナー：公開した商品を Instagram で紹介する
// パートナーは IT に詳しくない前提。押すのは大きなボタン1つだけにする。
//   開いたら自動で：Claude が投稿文を書く → 法律チェック → カルーセル画像4枚を作る
//   「Instagram に投稿する」：本文をコピーして、そのまま共有画面を開く（Instagram を選んで、本文を貼って、シェア）
//   文を直したいときだけ、畳んである欄を開く
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
type Saved = { post: Post; legal: Legal };
type Product = { name: string; price_yen: number; shop_name: string; photos: string[] };

// ログインを入れるまでは、デモのパートナー番号を固定で使う（画面では入力させない）
const DEMO_REF = "P01";

function textOf(p: Post) {
  return `${p.caption}\n\n${p.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`;
}

// 本文のコピーは、共有画面を開く前に「同じ押した瞬間」に済ませる必要がある（iPhone の決まり）。
// 待ち時間のない昔ながらのコピーを使う。
function copyNow(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

function ShareInner() {
  const { shopId, draftId } = useParams<{ shopId: string; draftId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [step, setStep] = useState<"load" | "write" | "draw" | "ready" | "check" | "error">("load");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const started = useRef(false);

  const draw = useCallback(
    async (p: Product, s: Saved) => {
      setStep("draw");
      try {
        const url = `${window.location.origin}/p/${draftId}?ref=${DEMO_REF}`;
        const blobs = await renderCarousel({ photos: p.photos, name: p.name, price: p.price_yen, shopName: p.shop_name, url, slides: s.post.slides });
        setFiles((old) => {
          old.forEach((f) => URL.revokeObjectURL(f.url));
          return blobs.map((b, i) => {
            const file = new File([b], `yaobiz-${draftId}-${i + 1}.jpg`, { type: "image/jpeg" });
            return { file, url: URL.createObjectURL(file) };
          });
        });
        setStep("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "画像を作れませんでした");
        setStep("error");
      }
    },
    [draftId],
  );

  const write = useCallback(
    async (p: Product, action: "generate" | "check", current?: Post) => {
      setError("");
      setStep(action === "generate" ? "write" : "check");
      const r = await apiFetch(`/api/drafts/${draftId}/sns`, { method: "POST", body: JSON.stringify({ action, post: current }) });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error);
        setStep("error");
        return;
      }
      setSaved(j);
      setPost(j.post);
      setDone(false);
      if (j.legal.verdict === "このままでは販売できない") setStep("ready");
      else await draw(p, j);
    },
    [draftId, draw],
  );

  // 開いたら自動で進める（前に作った投稿文があれば、それを使う）
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    Promise.all([apiFetch(`/api/products/${draftId}`).then((r) => r.json()), apiFetch(`/api/drafts/${draftId}/sns`).then((r) => r.json())]).then(
      async ([p, s]) => {
        if (!p.product) {
          setError(p.error ?? "公開した商品だけ紹介できます");
          setStep("error");
          return;
        }
        setProduct(p.product);
        if (s.saved) {
          setSaved(s.saved);
          setPost(s.saved.post);
          if (s.saved.legal.verdict === "このままでは販売できない") setStep("ready");
          else await draw(p.product, s.saved);
        } else await write(p.product, "generate");
      },
    );
  }, [draftId, draw, write]);

  const legal = saved?.legal ?? null;
  const blocked = legal?.verdict === "このままでは販売できない";
  const edited = !!post && !!saved && JSON.stringify(post) !== JSON.stringify(saved.post);
  const issues = legal?.items.filter((i) => i.status === "ng" || i.status === "fix") ?? [];

  function post2instagram() {
    if (!post) return;
    const copied = copyNow(textOf(post));
    const list = files.map((f) => f.file);
    if (navigator.canShare?.({ files: list })) {
      navigator.share({ files: list }).then(
        () => setDone(true),
        () => {
          /* 共有画面を閉じただけ */
        },
      );
      if (!copied) setError("文章を自動でコピーできませんでした。下の「文を直したいとき」を開き、投稿の文章を長押ししてコピーしてください。");
    } else {
      setError("この端末では、まとめて送れません。上の画像を1枚ずつ長押しして「写真に保存」し、Instagram で選んでください。文章はコピーしてあります。");
    }
  }

  const setSlide = (k: keyof Post["slides"], v: string) => post && setPost({ ...post, slides: { ...post.slides, [k]: v } });
  const input = "w-full rounded-xl border border-black/15 p-3 text-base";

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/hearing/${shopId}`} className="text-sm text-leaf">← もどる</Link>
        <h1 className="text-xl font-bold mt-1">Instagram で紹介する</h1>
        {product && <p className="text-sm text-black/60">{product.name}</p>}
      </div>

      {/* 準備中は、何をしているかだけ大きく見せる */}
      {(step === "load" || step === "write" || step === "draw" || step === "check") && (
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-black/5 text-leaf font-bold">
          <Working
            text={
              step === "load" ? "準備しています" : step === "write" ? "Claude が紹介文を書いて、法律チェックしています" : step === "check" ? "法律チェックをしています" : "画像を作っています"
            }
            est={step === "write" ? 40 : step === "check" ? 25 : undefined}
          />
        </div>
      )}

      {step === "ready" && blocked && (
        <div className="rounded-2xl bg-red-50 border-2 border-red-200 p-4 space-y-2">
          <div className="font-bold text-red-700">このままでは投稿できません</div>
          {issues.map((i, n) => (
            <div key={n} className="text-sm">
              「<b>{i.quote || i.topic}</b>」：{i.detail}
            </div>
          ))}
          <p className="text-sm">下の「文を直したいとき」で直すか、「Claude に書き直してもらう」を押してください。</p>
        </div>
      )}

      {step === "ready" && !blocked && files.length > 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 snap-x">
            {files.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.url} src={f.url} alt={`紹介の画像 ${i + 1}枚目`} className="h-72 rounded-xl shadow snap-start" />
            ))}
          </div>
          <p className="text-center text-sm font-bold text-leaf">✓ 法律チェック済み。このまま投稿できます</p>

          <button className="w-full rounded-2xl bg-carrot text-white py-5 text-xl font-bold shadow active:scale-[0.99]" onClick={post2instagram}>
            📷 Instagram に投稿する
          </button>

          <ol className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3 text-base">
            <li className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-carrot text-white grid place-items-center font-bold">1</span>
              <span>上のオレンジのボタンを押す</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-carrot text-white grid place-items-center font-bold">2</span>
              <span>
                出てきた一覧から <b>Instagram</b> を選ぶ（なければ「その他」の中）
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-carrot text-white grid place-items-center font-bold">3</span>
              <span>
                文章を書く欄を<b>長押し</b>して「<b>ペースト</b>」（紹介文はもうコピーしてあります）
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-carrot text-white grid place-items-center font-bold">4</span>
              <span>
                「<b>シェア</b>」を押せば完了
              </span>
            </li>
          </ol>
          {done && <p className="rounded-xl bg-leaf/10 text-leaf p-3 text-center font-bold">おつかれさまでした！</p>}
        </>
      )}

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      {/* 文を直したいときだけ開く */}
      {post && product && step !== "write" && step !== "check" && (
        <details className="rounded-2xl bg-white p-4 shadow-sm border border-black/5" open={blocked}>
          <summary className="font-bold text-black/70">文を直したいとき</summary>
          <div className="space-y-2 mt-3">
            <label className="block text-xs font-bold text-black/60">1枚目のひとこと</label>
            <input className={input} value={post.slides.cover} onChange={(e) => setSlide("cover", e.target.value)} />
            <label className="block text-xs font-bold text-black/60">2枚目の見出し</label>
            <input className={input} value={post.slides.point_title} onChange={(e) => setSlide("point_title", e.target.value)} />
            <label className="block text-xs font-bold text-black/60">2枚目の文</label>
            <textarea className={`${input} min-h-20`} value={post.slides.point_text} onChange={(e) => setSlide("point_text", e.target.value)} />
            <label className="block text-xs font-bold text-black/60">3枚目（お店の思い）</label>
            <textarea className={`${input} min-h-24`} value={post.slides.story_text} onChange={(e) => setSlide("story_text", e.target.value)} />
            <label className="block text-xs font-bold text-black/60">投稿の文章</label>
            <textarea className={`${input} min-h-48 leading-relaxed`} value={post.caption} onChange={(e) => setPost({ ...post, caption: e.target.value })} />
            {issues
              .filter((i) => i.quote)
              .map((i, n) => (
                <p key={n} className="rounded-lg bg-red-50 p-2 text-xs">
                  <b className="text-red-600">直すところ</b>「{i.quote}」：{i.detail}
                </p>
              ))}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button className="rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-40" disabled={!edited} onClick={() => write(product, "check", post)}>
                直したので確かめる
              </button>
              <button className="rounded-xl border-2 border-carrot text-carrot py-3 font-bold" onClick={() => write(product, "generate")}>
                Claude に書き直してもらう
              </button>
            </div>
          </div>
        </details>
      )}
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
