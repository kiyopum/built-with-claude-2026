import { currentUser, shopPinError } from "@/lib/auth";
import type { Shop } from "@/lib/db";
import { getDb, type Draft } from "@/lib/db";
import { generateSnsPost, checkSnsPost, type SnsPost } from "@/lib/claude";
import { loadProductContext } from "@/lib/context";
import { sceneOf } from "@/lib/scenes";

// 使ってよい人：ログインしたパートナー（どのお店の商品でも紹介できる）か、
// 店主さん（ログインしない。そのお店の暗証番号を x-shop-pin で送る。間違いは5回で5分待ち）
async function allowed(req: Request, draftId: number): Promise<Response | null> {
  if (await currentUser()) return null;
  const pin = req.headers.get("x-shop-pin");
  if (!pin) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const shop = getDb().prepare("SELECT s.* FROM shops s JOIN drafts d ON d.shop_id = s.id WHERE d.id = ?").get(draftId) as Shop | undefined;
  if (!shop) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  const err = shopPinError(shop, pin);
  return err ? Response.json({ error: err }, { status: 403 }) : null;
}

// SNS（Instagram カルーセル）の投稿
//   generate：Claude が投稿文を作り、そのまま法律チェックもする
//   check   ：手で直した投稿文の法律チェックだけやり直す
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ng = await allowed(req, Number(id));
  if (ng) return ng;
  const body = (await req.json()) as { action: string; post?: SnsPost; scene?: string };
  const db = getDb();
  const d = db.prepare("SELECT * FROM drafts WHERE id = ?").get(Number(id)) as Draft | undefined;
  if (!d) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  if (d.status !== "published") return Response.json({ error: "公開した商品だけシェアできます" }, { status: 400 });
  const { c, current } = loadProductContext(d);
  try {
    let post: SnsPost;
    // 場面（贈る「コト」）：書き直し・確かめ直しのときは、前に選んだ場面を引き継ぐ
    const prev = d.sns_json ? (JSON.parse(d.sns_json) as { scene?: string }) : null;
    const scene = sceneOf(body.scene ?? prev?.scene);
    if (body.action === "generate") post = await generateSnsPost(c, current, scene);
    else if (body.action === "check" && body.post) post = body.post;
    else return Response.json({ error: "不明な操作です" }, { status: 400 });
    const legal = await checkSnsPost(c, current, post);
    const saved = { post, legal, scene: scene?.key ?? null };
    db.prepare("UPDATE drafts SET sns_json = ? WHERE id = ?").run(JSON.stringify(saved), d.id);
    return Response.json(saved);
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "投稿文を作れませんでした" }, { status: 500 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ng = await allowed(req, Number(id));
  if (ng) return ng;
  const d = getDb()
    .prepare("SELECT d.id, d.name, d.price_yen, d.status, d.sns_json, s.name AS shop_name FROM drafts d JOIN shops s ON s.id = d.shop_id WHERE d.id = ?")
    .get(Number(id)) as { id: number; name: string; price_yen: number; status: string; sns_json: string | null; shop_name: string } | undefined;
  if (!d) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  const { sns_json, ...rest } = d;
  return Response.json({ ...rest, saved: sns_json ? JSON.parse(sns_json) : null });
}
