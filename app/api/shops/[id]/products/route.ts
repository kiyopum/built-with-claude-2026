import { guardShop } from "@/lib/auth";
import { getDb, type Shop } from "@/lib/db";
import { generateProductDraft } from "@/lib/claude";
import { photosFromForm, savePhotos, saveAudios } from "@/lib/files";
import { getResearch } from "@/lib/research";
import { proposalFromForm, proposalText } from "@/lib/proposals";

// 商品1つのヒアリングを送る → 商品ページの下書き1件（法律チェックつき）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });

  const form = await req.formData();
  const transcript = String(form.get("transcript") ?? "").trim();
  const labelRead = JSON.parse(String(form.get("label_read") ?? "[]"));
  const kind = form.get("kind") === "service" ? "service" : "goods";
  if (!transcript) return Response.json({ error: "ヒアリング内容が空です" }, { status: 400 });
  // パートナーの提案から生まれたサービスか（どの案からかを残す）
  const seed = kind === "service" ? proposalFromForm(shop, form.get("seed")) : null;

  try {
    const photos = await photosFromForm(form);
    const t0 = Date.now();
    const research = await getResearch(shop);
    const t1 = Date.now();
    const p = await generateProductDraft({ shop, kind, transcript, labelRead, research, seed: seed ? proposalText(seed) : undefined }, photos);
    console.log(`[product] 法律の調査を待った時間 ${((t1 - t0) / 1000).toFixed(1)}秒 / 下書き作成 ${((Date.now() - t1) / 1000).toFixed(1)}秒`);

    const hearingId = Number(
      db
        .prepare("INSERT INTO hearings (shop_id, transcript, legal_research, label_read) VALUES (?, ?, ?, ?)")
        .run(shop.id, transcript, JSON.stringify(research), JSON.stringify(labelRead)).lastInsertRowid,
    );
    const insAudio = db.prepare("INSERT INTO hearing_audio (hearing_id, file, mime, bytes) VALUES (?, ?, ?, ?)");
    for (const a of await saveAudios(form, `hearing-${hearingId}`)) insAudio.run(hearingId, a.file, a.mime, a.bytes);

    const draftId = Number(
      db
        .prepare(
          `INSERT INTO drafts (hearing_id, shop_id, name, description, price_yen, recommend_reason, target_customer, legal_json, kind, proposal_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(hearingId, shop.id, p.name, p.description, p.price_yen, p.recommend_reason, p.target_customer, JSON.stringify(p.legal), kind, seed?.name ?? null)
        .lastInsertRowid,
    );
    savePhotos(draftId, photos);
    return Response.json({ draftId });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "商品ページを作れませんでした" }, { status: 500 });
  }
}
