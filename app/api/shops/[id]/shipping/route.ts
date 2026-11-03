import { getDb } from "@/lib/db";
import { guardShop } from "@/lib/auth";
import { prefOf } from "@/lib/shipping";

// 送料の設定
//   yen：全国一律の送料（大きさ・重さを入れていない商品で使う。0 円なら送料込み）
//   prefecture：お店から送り出す都道府県（送料込みの商品で、届け先との距離で送料を出すのに要る）
//   pickup_ok：お店での受け取りができるか（受け取りなら送料 0 円）
//   online_label：ネットで宛名ラベルを作る送り方（クリックポスト）も使うか
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const body = (await req.json()) as { yen?: unknown; prefecture?: unknown; pickup_ok?: unknown; online_label?: unknown };
  const db = getDb();
  if (body.yen !== undefined) {
    const n = Number(body.yen);
    if (!Number.isInteger(n) || n < 0 || n > 10000) return Response.json({ error: "送料は 0〜10,000 円で入れてください" }, { status: 400 });
    db.prepare("UPDATE shops SET shipping_yen = ? WHERE id = ?").run(n, g.shop.id);
  }
  if (body.prefecture !== undefined) {
    const p = prefOf(String(body.prefecture));
    if (!p) return Response.json({ error: "都道府県を選んでください" }, { status: 400 });
    db.prepare("UPDATE shops SET prefecture = ? WHERE id = ?").run(p, g.shop.id);
  }
  if (body.online_label !== undefined) db.prepare("UPDATE shops SET online_label = ? WHERE id = ?").run(body.online_label ? 1 : 0, g.shop.id);
  if (body.pickup_ok !== undefined) db.prepare("UPDATE shops SET pickup_ok = ? WHERE id = ?").run(body.pickup_ok ? 1 : 0, g.shop.id);
  return Response.json({ ok: true });
}
