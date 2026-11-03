import { requireUser } from "@/lib/auth";
import { getDb, type Draft } from "@/lib/db";
import { generateSnsPost, checkSnsPost, type SnsPost } from "@/lib/claude";
import { loadProductContext } from "@/lib/context";

// SNS（Instagram カルーセル）の投稿
//   generate：Claude が投稿文を作り、そのまま法律チェックもする
//   check   ：手で直した投稿文の法律チェックだけやり直す
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // 公開した商品は、どのパートナーでも紹介できる（他の人のお店の商品も）
  const u = await requireUser();
  if (u instanceof Response) return u;
  const body = (await req.json()) as { action: string; post?: SnsPost };
  const db = getDb();
  const d = db.prepare("SELECT * FROM drafts WHERE id = ?").get(Number(id)) as Draft | undefined;
  if (!d) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  if (d.status !== "published") return Response.json({ error: "公開した商品だけシェアできます" }, { status: 400 });
  const { c, current } = loadProductContext(d);
  try {
    let post: SnsPost;
    if (body.action === "generate") post = await generateSnsPost(c, current);
    else if (body.action === "check" && body.post) post = body.post;
    else return Response.json({ error: "不明な操作です" }, { status: 400 });
    const legal = await checkSnsPost(c, current, post);
    const saved = { post, legal };
    db.prepare("UPDATE drafts SET sns_json = ? WHERE id = ?").run(JSON.stringify(saved), d.id);
    return Response.json(saved);
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "投稿文を作れませんでした" }, { status: 500 });
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // 公開した商品は、どのパートナーでも紹介できる（他の人のお店の商品も）
  const u = await requireUser();
  if (u instanceof Response) return u;
  const d = getDb()
    .prepare("SELECT d.id, d.name, d.price_yen, d.status, d.sns_json, s.name AS shop_name FROM drafts d JOIN shops s ON s.id = d.shop_id WHERE d.id = ?")
    .get(Number(id)) as { id: number; name: string; price_yen: number; status: string; sns_json: string | null; shop_name: string } | undefined;
  if (!d) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  const { sns_json, ...rest } = d;
  return Response.json({ ...rest, saved: sns_json ? JSON.parse(sns_json) : null });
}
