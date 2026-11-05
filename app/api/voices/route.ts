import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { reframeVoice } from "@/lib/claude";

// みんなの声：店主さん・お客さまからのお褒めと要望を、スタッフみんなで分け合う
//   聞いたままの言葉（original）は、書いた人と YMM 管理だけに見せる。みんなには Claude が整えた文を見せる
export async function GET() {
  await connection();
  const u = await requireUser();
  if (u instanceof Response) return u;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT v.id, v.user_id, v.source, v.kind, v.original, v.title, v.message, v.step, v.via, v.created_at,
              s.name AS shop_name, us.name AS user_name,
              (SELECT COUNT(*) FROM voice_thanks t WHERE t.voice_id = v.id) AS thanks,
              EXISTS (SELECT 1 FROM voice_thanks t WHERE t.voice_id = v.id AND t.user_id = ?) AS thanked
       FROM voices v JOIN users us ON us.id = v.user_id LEFT JOIN shops s ON s.id = v.shop_id
       ORDER BY v.id DESC LIMIT 100`,
    )
    .all(u.id) as { user_id: number; original: string; thanked: number }[];
  const voices = rows.map(({ original, ...v }) => ({
    ...v,
    thanked: !!v.thanked,
    mine: v.user_id === u.id,
    original: u.role === "admin" || v.user_id === u.id ? original : undefined,
  }));
  // 声を書くときに選ぶお店（パートナーは担当のお店、管理者は全部）
  const shops = db
    .prepare(u.role === "admin" ? "SELECT id, name FROM shops ORDER BY id DESC" : "SELECT id, name FROM shops WHERE partner_id = ? ORDER BY id DESC")
    .all(...(u.role === "admin" ? [] : [u.id]));
  return Response.json({ voices, shops, me: { id: u.id, role: u.role } });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const db = getDb();
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: number; text?: string; source?: string; shop_id?: number | null };

  if (b.action === "thanks") {
    const id = Number(b.id);
    if (!db.prepare("SELECT 1 FROM voices WHERE id = ?").get(id)) return Response.json({ error: "見つかりません" }, { status: 404 });
    const had = db.prepare("DELETE FROM voice_thanks WHERE voice_id = ? AND user_id = ?").run(id, u.id).changes;
    if (!had) db.prepare("INSERT INTO voice_thanks (voice_id, user_id) VALUES (?, ?)").run(id, u.id);
    return Response.json({ ok: true });
  }
  if (b.action === "delete") {
    const id = Number(b.id);
    const v = db.prepare("SELECT user_id FROM voices WHERE id = ?").get(id) as { user_id: number } | undefined;
    if (!v) return Response.json({ error: "見つかりません" }, { status: 404 });
    if (v.user_id !== u.id && u.role !== "admin") return Response.json({ error: "書いた人と YMM 管理だけが消せます" }, { status: 403 });
    db.prepare("DELETE FROM voice_thanks WHERE voice_id = ?").run(id);
    // お客さまのお便りそのものは店主さんに残す（みんなの声から外すだけ）
    db.prepare("UPDATE letters SET voice_id = NULL WHERE voice_id = ?").run(id);
    db.prepare("DELETE FROM voices WHERE id = ?").run(id);
    return Response.json({ ok: true });
  }

  const text = String(b.text ?? "").trim();
  if (!text) return Response.json({ error: "聞いた声を入れてください" }, { status: 400 });
  if (text.length > 2000) return Response.json({ error: "長すぎます（2000字まで）" }, { status: 400 });
  const source = ["owner", "customer", "other"].includes(String(b.source)) ? String(b.source) : "other";
  let shop: { id: number; name: string } | undefined;
  if (b.shop_id) {
    shop = db.prepare("SELECT id, name FROM shops WHERE id = ?").get(Number(b.shop_id)) as typeof shop;
    if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  }
  try {
    const v = await reframeVoice({ source, shopName: shop?.name ?? null, text });
    const r = db
      .prepare("INSERT INTO voices (user_id, shop_id, source, kind, original, title, message, step) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(u.id, shop?.id ?? null, source, v.kind, text, v.title, v.message, v.step);
    return Response.json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "声を整えられませんでした" }, { status: 500 });
  }
}
