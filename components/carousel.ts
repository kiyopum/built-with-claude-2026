// Instagram カルーセル用の画像を、端末の中（canvas）で作る。1080×1350（縦 4:5）を4枚。
//   1) 表紙：メインの写真＋ひとこと・商品名・価格
//   2) こだわり：写真＋見出し・本文
//   3) 事業者の思い：事業者さんの言葉
//   4) 買い方：QR コード（パートナー番号つきのリンク）
import QRCode from "qrcode";

const W = 1080;
const H = 1350;
const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", sans-serif`;
const LEAF = "#3f7d4a";
const CARROT = "#e07a2e";
const CREAM = "#faf6ee";
const INK = "#2b2b2b";

export type SlideInput = {
  photos: string[]; // 同じサイトの写真のアドレス（1枚目がメイン）
  name: string;
  price: number;
  shopName: string;
  url: string; // 買うページ（?ref= つき）
  slides: { cover: string; point_title: string; point_text: string; story_text: string };
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, ng) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ng(new Error("写真を読み込めませんでした"));
    img.src = src;
  });
}

// 枠いっぱいに写真を敷く（はみ出しは切る）
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

// ぼかした写真を敷き、上に色を重ねる（使えない端末では、ぼかさずに敷くだけ。色を重ねるので文字の邪魔にはならない）
function blurred(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, shade: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.filter = "blur(28px)";
  cover(ctx, img, x - 40, y - 40, w + 80, h + 80);
  ctx.filter = "none";
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// 写真を枠に入れる（2026-11-05 きよさん：ラベルの文字が端で切れていた）。
//   切れるのが少し（各辺1.5%まで）なら枠いっぱいに。それより多く切れるときは、写真を丸ごと見せ、余白はぼかした同じ写真で埋める
function photo(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, shade: string) {
  const sc = Math.max(w / img.width, h / img.height);
  const keep = Math.min(w / sc / img.width, h / sc / img.height); // 枠いっぱいにしたとき、写真のどれだけが残るか
  if (keep >= 0.97) return cover(ctx, img, x, y, w, h);
  ctx.save();
  blurred(ctx, img, x, y, w, h, shade);
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

const NO_HEAD = "、。，．）」』】！？・ーっゃゅょァィゥェォッャュョ";
const NO_TAIL = "「『（【";
// 言葉の切れ目（Intl.Segmenter）で折り返す。「干し|芋」のように言葉の途中で切れないようにする（2026-11-05）。
//   1つの言葉が1行に入らないときだけ、1文字ずつに分ける。句読点・閉じかっこは行の頭に来ないようにする
function tokens(para: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: "word" }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (!Seg) return Array.from(para);
  const out: string[] = [];
  for (const { segment } of new Seg("ja", { granularity: "word" }).segment(para)) {
    // 句読点・閉じかっこは前の言葉にくっつける。開きかっこは次の言葉にくっつける
    if (out.length && NO_HEAD.includes(segment[0])) out[out.length - 1] += segment;
    else if (out.length && NO_TAIL.includes(out[out.length - 1].slice(-1)) && out[out.length - 1].length === 1) out[out.length - 1] += segment;
    else out.push(segment);
  }
  return out;
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const fits = (s: string) => ctx.measureText(s).width <= maxWidth;
  for (const para of text.split("\n")) {
    let line = "";
    for (const tok of tokens(para)) {
      if (fits(line + tok)) {
        line += tok;
        continue;
      }
      if (line && fits(tok)) {
        lines.push(line);
        line = tok;
        continue;
      }
      // 1つの言葉が長すぎる：1文字ずつ詰める（行の頭に句読点を置かない）
      for (const ch of Array.from(tok)) {
        if (!fits(line + ch) && line && !NO_HEAD.includes(ch)) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  o: { size: number; weight?: number; color: string; maxWidth: number; lineHeight?: number; maxLines?: number; align?: CanvasTextAlign },
): number {
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "top";
  // 文字が切れないように：決めた行数に収まるまで、文字を少しずつ小さくする（元の大きさの6割まで）。
  //   それでも入らないときだけ、最後を「…」にする（2026-11-05 きよさん：画像の文字が切れる）
  let size = o.size;
  const min = Math.round(o.size * 0.6);
  let lines: string[];
  for (;;) {
    ctx.font = `${o.weight ?? 400} ${size}px ${FONT}`;
    lines = wrap(ctx, text, o.maxWidth);
    if (!o.maxLines || lines.length <= o.maxLines || size <= min) break;
    size = Math.max(min, size - 2);
  }
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(last + "…").width > o.maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last + "…";
  }
  const lh = (o.lineHeight ?? o.size * 1.5) * (size / o.size);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  return y + lines.length * lh;
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return [c, c.getContext("2d")!];
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error("画像を作れませんでした"))), "image/jpeg", 0.9));
}

const yen = (n: number) => `${n.toLocaleString()}円（税込）`;

export async function renderCarousel(input: SlideInput): Promise<Blob[]> {
  const imgs = await Promise.all(input.photos.slice(0, 2).map(loadImage));
  const main = imgs[0];
  const second = imgs[1] ?? imgs[0];
  const out: Blob[] = [];

  // 1) 表紙
  {
    const [c, ctx] = canvas();
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);
    // 写真は上の部分に。下の文字と重ならないようにする（写真の文字や商品が文字の下に隠れないように）
    if (main) {
      blurred(ctx, main, 0, 0, W, H, "rgba(0,0,0,0.3)");
      photo(ctx, main, 0, 130, W, H - 480 - 130, "rgba(0,0,0,0.25)"); // 上は事業者名と PR、下は文字の場所
    }
    const g = ctx.createLinearGradient(0, H - 560, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.78)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawText(ctx, input.shopName, 64, 64, { size: 34, weight: 700, color: "#fff", maxWidth: W - 280, maxLines: 1 });
    // 広告であることの表示（ステマ規制）
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.roundRect(W - 64 - 110, 56, 110, 56, 12);
    ctx.fill();
    drawText(ctx, "PR", W - 64 - 55, 64, { size: 36, weight: 800, color: INK, maxWidth: 100, align: "center" });
    let y = H - 470;
    y = drawText(ctx, input.slides.cover, 64, y, { size: 76, weight: 800, color: "#fff", maxWidth: W - 128, maxLines: 2, lineHeight: 96 });
    y = drawText(ctx, input.name, 64, y + 24, { size: 40, weight: 700, color: "#fff", maxWidth: W - 128, maxLines: 2, lineHeight: 56 });
    ctx.fillStyle = CARROT;
    ctx.beginPath();
    ctx.roundRect(64, y + 28, 420, 84, 42);
    ctx.fill();
    drawText(ctx, yen(input.price), 64 + 210, y + 50, { size: 38, weight: 800, color: "#fff", maxWidth: 380, align: "center", maxLines: 1 });
    out.push(await toBlob(c));
  }

  // 2) こだわり
  {
    const [c, ctx] = canvas();
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);
    if (second) photo(ctx, second, 0, 0, W, 760, "rgba(250,246,238,0.45)");
    drawText(ctx, "こだわり", 64, 820, { size: 32, weight: 700, color: LEAF, maxWidth: 400 });
    const y = drawText(ctx, input.slides.point_title, 64, 870, { size: 60, weight: 800, color: CARROT, maxWidth: W - 128, maxLines: 2, lineHeight: 78 });
    drawText(ctx, input.slides.point_text, 64, y + 24, { size: 38, color: INK, maxWidth: W - 128, maxLines: 5, lineHeight: 60 });
    out.push(await toBlob(c));
  }

  // 3) 事業者の思い
  {
    const [c, ctx] = canvas();
    ctx.fillStyle = LEAF;
    ctx.fillRect(0, 0, W, H);
    drawText(ctx, "事業者の思い", W / 2, 200, { size: 40, weight: 700, color: "rgba(255,255,255,0.8)", maxWidth: W - 160, align: "center" });
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = `800 220px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText("“", 70, 230);
    drawText(ctx, input.slides.story_text, 120, 380, { size: 50, weight: 700, color: "#fff", maxWidth: W - 240, maxLines: 9, lineHeight: 84 });
    drawText(ctx, input.shopName, W / 2, H - 170, { size: 40, weight: 700, color: "#fff", maxWidth: W - 160, align: "center", maxLines: 1 });
    out.push(await toBlob(c));
  }

  // 4) 買い方（QR コード）
  {
    const [c, ctx] = canvas();
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);
    drawText(ctx, "ご購入は", W / 2, 120, { size: 44, weight: 700, color: LEAF, maxWidth: W - 160, align: "center" });
    drawText(ctx, input.name, W / 2, 200, { size: 46, weight: 800, color: INK, maxWidth: W - 160, align: "center", maxLines: 2, lineHeight: 64 });
    drawText(ctx, yen(input.price), W / 2, 350, { size: 52, weight: 800, color: CARROT, maxWidth: W - 160, align: "center" });
    const qr = await loadImage(await QRCode.toDataURL(input.url, { width: 520, margin: 1, color: { dark: INK, light: "#ffffff" } }));
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect((W - 600) / 2, 470, 600, 600, 40);
    ctx.fill();
    ctx.drawImage(qr, (W - 520) / 2, 510, 520, 520);
    drawText(ctx, "QR コードを読み取るか、プロフィールのリンクから", W / 2, 1120, { size: 36, color: INK, maxWidth: W - 120, align: "center", maxLines: 2 });
    drawText(ctx, input.shopName, W / 2, 1220, { size: 34, weight: 700, color: LEAF, maxWidth: W - 160, align: "center", maxLines: 1 });
    out.push(await toBlob(c));
  }
  return out;
}
