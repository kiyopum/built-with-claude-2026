// Instagram カルーセル用の画像を、端末の中（canvas）で作る。1080×1350（縦 4:5）を4枚。
//   1) 表紙：メインの写真＋ひとこと・商品名・価格
//   2) こだわり：写真＋見出し・本文
//   3) お店の思い：店主の言葉
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

// 日本語を1文字ずつ測って折り返す。句読点や閉じかっこは行の頭に来ないようにする
const NO_HEAD = "、。，．）」』】！？・ーっゃゅょァィゥェォッャュョ";
const NO_TAIL = "「『（【";
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const ch of Array.from(para)) {
      if (ctx.measureText(line + ch).width > maxWidth && line && !NO_HEAD.includes(ch)) {
        // 開きかっこは行の終わりに残さず、次の行へ送る
        const tail = NO_TAIL.includes(line.slice(-1)) && line.length > 1 ? line.slice(-1) : "";
        lines.push(tail ? line.slice(0, -1) : line);
        line = tail + ch;
      } else line += ch;
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
  ctx.font = `${o.weight ?? 400} ${o.size}px ${FONT}`;
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "top";
  let lines = wrap(ctx, text, o.maxWidth);
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, "…");
  }
  const lh = o.lineHeight ?? o.size * 1.5;
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
    if (main) cover(ctx, main, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
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
    drawText(ctx, yen(input.price), 64 + 210, y + 50, { size: 38, weight: 800, color: "#fff", maxWidth: 400, align: "center" });
    out.push(await toBlob(c));
  }

  // 2) こだわり
  {
    const [c, ctx] = canvas();
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);
    if (second) cover(ctx, second, 0, 0, W, 760);
    drawText(ctx, "こだわり", 64, 820, { size: 32, weight: 700, color: LEAF, maxWidth: 400 });
    const y = drawText(ctx, input.slides.point_title, 64, 870, { size: 60, weight: 800, color: CARROT, maxWidth: W - 128, maxLines: 2, lineHeight: 78 });
    drawText(ctx, input.slides.point_text, 64, y + 24, { size: 38, color: INK, maxWidth: W - 128, maxLines: 5, lineHeight: 60 });
    out.push(await toBlob(c));
  }

  // 3) お店の思い
  {
    const [c, ctx] = canvas();
    ctx.fillStyle = LEAF;
    ctx.fillRect(0, 0, W, H);
    drawText(ctx, "お店の思い", W / 2, 200, { size: 40, weight: 700, color: "rgba(255,255,255,0.8)", maxWidth: W - 160, align: "center" });
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
