"use client";

// 公開した商品を Instagram で紹介する（パートナーの画面と事業者さんの画面で共通）
//   パートナー：紹介リンクに自分のパートナー番号が入る
//   事業者さん：ログインせず、事業者さんの暗証番号で使う。リンクに番号は入らない（売れたら取り分は全部事業者の担当へ）
//   どちらも投稿の先頭に「#PR」を入れる（2026-11-03 きよさん決定：全部に入れる）
// パートナーは IT に詳しくない前提。押すのは大きなボタン1つだけにする。
//   開いたら自動で：Claude が投稿文を書く → 法律チェック → カルーセル画像4枚を作る
//   「Instagram に投稿する」：本文をコピーして、そのまま共有画面を開く（Instagram を選んで、本文を貼って、シェア）
//   文を直したいときだけ、畳んである欄を開く
// 最初に「どんな場面に贈る？」を大きなボタンで選ぶ（2026-11-04 きよさん：買う人の「コト」に寄り添う投稿）
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Working } from "@/components/Working";
import { renderCarousel } from "@/components/carousel";
import type { Legal } from "@/components/LegalPanel";
import { SCENES, sceneOf } from "@/lib/scenes";
import { gyojiOf } from "@/lib/events";

type Post = {
  caption: string;
  hashtags: string[];
  slides: { cover: string; point_title: string; point_text: string; story_text: string };
};
type Saved = { post: Post; legal: Legal; scene?: string | null; gyoji?: string | null };
type Product = { name: string; price_yen: number; shop_name: string; photos: string[] };

// 広告であることを示すため、いちばん最初に「#PR」を必ず入れる（ステマ規制。事業者さんの投稿も同じ）
function textOf(p: Post) {
  // Instagram のハッシュタグは5個まで：#PR ＋ Claude が作った4個（多くても4個で切る）
  const tags = p.hashtags
    .map((h) => `#${h.replace(/^#/, "").trim()}`)
    .filter((h) => h.length > 1 && h.toUpperCase() !== "#PR")
    .slice(0, 4);
  // #PR は埋もれないよう先頭に（これも5個のうちの1個に数える）
  return `#PR\n${p.caption}\n\n${tags.join(" ")}`;
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

export function ShareFlow({ draftId, backHref, shopPin, initialScene, gyoji }: { draftId: string; backHref: string; shopPin?: string; initialScene?: string; gyoji?: string }) {
  // 行事に向けて開いたとき（次の小さな一歩から）。場面は行事に合うものを先に選んでおく
  const g = gyojiOf(gyoji);
  const pre = sceneOf(initialScene);
  const [ref, setRef] = useState("");
  // 事業者さんのときは、事業者さんの暗証番号をつけて呼ぶ
  const call = useCallback(
    (url: string, init: RequestInit = {}) => apiFetch(url, shopPin ? { ...init, headers: { ...init.headers, "x-shop-pin": shopPin } } : init),
    [shopPin],
  );
  const [product, setProduct] = useState<Product | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [step, setStep] = useState<"load" | "pick" | "write" | "draw" | "ready" | "check" | "error">("load");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const started = useRef(false);

  const draw = useCallback(
    async (p: Product, s: Saved) => {
      setStep("draw");
      try {
        // 紹介リンクには、ログインしている人のパートナー番号が自動で入る
        const me = shopPin ? null : await (await apiFetch("/api/auth/me")).json();
        const code: string = me?.user?.role === "partner" ? me.user.code : "";
        setRef(code);
        const url = `${window.location.origin}/p/${draftId}${code ? `?ref=${code}` : ""}`;
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
    [draftId, shopPin],
  );

  const write = useCallback(
    async (p: Product, action: "generate" | "check", current?: Post, scene?: string, gyojiKey?: string) => {
      setError("");
      setStep(action === "generate" ? "write" : "check");
      const r = await call(`/api/drafts/${draftId}/sns`, { method: "POST", body: JSON.stringify({ action, post: current, scene, gyoji: gyojiKey }) });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error);
        // 書けなかったときは、場面を選ぶ画面に戻して、もう一度押せるようにする
        setStep(action === "generate" ? "pick" : "error");
        return;
      }
      setSaved(j);
      setPost(j.post);
      setDone(false);
      if (j.legal.verdict === "このままでは販売できない") setStep("ready");
      else await draw(p, j);
    },
    [draftId, draw, call],
  );

  // 開いたら自動で進める（前に作った投稿文があれば、それを使う）
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    Promise.all([apiFetch(`/api/products/${draftId}`).then((r) => r.json()), call(`/api/drafts/${draftId}/sns`).then((r) => r.json())]).then(
      async ([p, s]) => {
        if (!p.product) {
          setError(p.error ?? "公開した商品だけ紹介できます");
          setStep("error");
          return;
        }
        setProduct(p.product);
        if (pre) {
          // 行事に向けて書くので、前の投稿があっても場面を選ぶ画面から
          if (s.saved) {
            setSaved(s.saved);
            setPost(s.saved.post);
          }
          setStep("pick");
        } else if (s.saved) {
          setSaved(s.saved);
          setPost(s.saved.post);
          if (s.saved.legal.verdict === "このままでは販売できない") setStep("ready");
          else await draw(p.product, s.saved);
        } else setStep("pick");
      },
    );
  }, [draftId, draw, write, call, pre]);

  const legal = saved?.legal ?? null;
  const scene = sceneOf(saved?.scene);
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
        <Link href={backHref} className="text-sm text-leaf">← もどる</Link>
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

      {/* どんな場面に贈る？ */}
      {step === "pick" && product && (
        <div className="space-y-3">
          <div className="text-lg font-bold">どんな場面に贈る？</div>
          <p className="text-sm text-black/60">選んだ場面に合わせて、Claude が紹介文と画像の言葉を書きます。</p>
          {g && pre && (
            <button
              className="w-full rounded-2xl bg-carrot text-white p-4 text-left shadow-sm active:scale-[0.98]"
              onClick={() => write(product, "generate", undefined, pre.key, g.key)}
            >
              <div className="text-xs opacity-90">🌱 次の小さな一歩から</div>
              <div className="text-lg font-bold">
                {pre.emoji} {g.name}に向けて書く
              </div>
              <div className="text-xs opacity-90">場面「{pre.label}」で、{g.name}のころに合わせた紹介文を作ります（届く日は約束しない書き方にします）</div>
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {SCENES.map((s) => (
              <button
                key={s.key}
                className={`rounded-2xl bg-white border-2 p-4 text-left shadow-sm active:scale-[0.98] ${saved?.scene === s.key ? "border-carrot" : "border-black/5"}`}
                onClick={() => write(product, "generate", undefined, s.key)}
              >
                <div className="text-3xl">{s.emoji}</div>
                <div className="font-bold mt-1 leading-snug">{s.label}</div>
              </button>
            ))}
          </div>
          {saved && (
            <button className="w-full text-sm text-black/50 underline" onClick={() => draw(product, saved)}>
              やめて、前の紹介文にもどる
            </button>
          )}
        </div>
      )}

      {step === "ready" && product && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 border border-black/5 text-sm">
          <span>
            場面：<b>{scene ? `${scene.emoji} ${scene.label}` : "とくになし"}</b>
            {gyojiOf(saved?.gyoji) && <span className="text-xs text-black/60">（{gyojiOf(saved?.gyoji)?.name}に向けて）</span>}
          </span>
          <button className="shrink-0 rounded-lg border border-carrot text-carrot px-3 py-1.5 font-bold" onClick={() => setStep("pick")}>
            場面を変える
          </button>
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
          <p className="text-center text-xs text-black/50">
            ハッシュタグは、文章の先頭の「#PR」と Claude が作った4個で、合わせて5個です（Instagram の上限）。#PR は広告であることを示すため、必ず入ります。
            {ref && ` 画像の QR には、あなたの番号（${ref}）が入っています。`}
          </p>

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
      {post && product && step !== "write" && step !== "check" && step !== "pick" && (
        <details className="rounded-2xl bg-white p-4 shadow-sm border border-black/5" open={blocked}>
          <summary className="font-bold text-black/70">文を直したいとき</summary>
          <div className="space-y-2 mt-3">
            <label className="block text-xs font-bold text-black/60">1枚目のひとこと</label>
            <input className={input} value={post.slides.cover} onChange={(e) => setSlide("cover", e.target.value)} />
            <label className="block text-xs font-bold text-black/60">2枚目の見出し</label>
            <input className={input} value={post.slides.point_title} onChange={(e) => setSlide("point_title", e.target.value)} />
            <label className="block text-xs font-bold text-black/60">2枚目の文</label>
            <textarea className={`${input} min-h-20`} value={post.slides.point_text} onChange={(e) => setSlide("point_text", e.target.value)} />
            <label className="block text-xs font-bold text-black/60">3枚目（事業者の思い）</label>
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
              <button className="rounded-xl border-2 border-carrot text-carrot py-3 font-bold" onClick={() => write(product, "generate", undefined, saved?.scene ?? undefined)}>
                Claude に書き直してもらう
              </button>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
