import { getDb } from "@/lib/db";
import { guardDraft } from "@/lib/auth";
import { PER_BOX_MAX, sizeClassOf } from "@/lib/shipping";

// 送り方：大きさ（絵で選ぶ区分）・重さ・1箱に入る数。送料込みの値段はここから自動で決まる
//   商品ページの文ではないので、法律チェックのやり直しや事業者さんの確認待ちには戻さない
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardDraft(id);
  if (g instanceof Response) return g;
  const { size_class, weight_g, per_box } = (await req.json()) as { size_class?: unknown; weight_g?: unknown; per_box?: unknown };
  if (!sizeClassOf(size_class)) return Response.json({ error: "大きさを選んでください" }, { status: 400 });
  const w = Number(weight_g);
  if (!Number.isInteger(w) || w < 1 || w > 25000) return Response.json({ error: "重さは 1〜25,000 g で入れてください（25kg まで）" }, { status: 400 });
  const n = Number(per_box ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > PER_BOX_MAX) return Response.json({ error: `1箱に入る数は 1〜${PER_BOX_MAX} 個で入れてください` }, { status: 400 });
  getDb().prepare("UPDATE drafts SET size_class = ?, weight_g = ?, per_box = ? WHERE id = ?").run(String(size_class), w, n, Number(id));
  return Response.json({ ok: true });
}
