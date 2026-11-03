import { connection } from "next/server";
import { getDb, getText } from "@/lib/db";
import { codeOf, hashPin, isPin, requireAdmin } from "@/lib/auth";

// YMM の管理画面：人・お店の割り当て・止まっている商品・注文
export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  const db = getDb();
  const users = (db.prepare("SELECT id, name, role, active, created_at FROM users ORDER BY role = 'admin' DESC, id").all() as { id: number }[]).map((u) => ({
    ...u,
    code: codeOf(u.id),
  }));
  const shops = (
    db
      .prepare(
        `SELECT s.id, s.name, s.category, s.partner_id, s.shipping_yen, s.release_pin_hash IS NOT NULL AS has_pin,
                (SELECT COUNT(*) FROM drafts d WHERE d.shop_id = s.id AND d.status = 'published') AS published,
                (SELECT COUNT(*) FROM drafts d WHERE d.shop_id = s.id AND d.status = 'draft') AS waiting
         FROM shops s ORDER BY s.id DESC`,
      )
      .all() as { has_pin: number }[]
  ).map((s) => ({ ...s, has_pin: !!s.has_pin }));
  // 法律チェックで「このままでは販売できない」のまま止まっている商品（YMM が手助けに入る先）
  const blocked = (
    db
      .prepare(
        `SELECT d.id, d.shop_id, d.name, d.legal_json, d.updated_at, s.name AS shop_name, u.name AS partner_name
         FROM drafts d JOIN shops s ON s.id = d.shop_id LEFT JOIN users u ON u.id = s.partner_id
         WHERE d.status = 'draft' ORDER BY d.updated_at DESC`,
      )
      .all() as { legal_json: string | null }[]
  )
    .map(({ legal_json, ...d }) => {
      const l = legal_json ? (JSON.parse(legal_json) as { verdict: string; items: { status: string; topic: string; quote?: string }[] }) : null;
      return { ...d, verdict: l?.verdict ?? null, reasons: (l?.items ?? []).filter((i) => i.status === "ng").map((i) => i.quote || i.topic) };
    })
    .filter((d) => d.verdict === "このままでは販売できない");
  const orders = db
    .prepare(
      `SELECT o.id, o.created_at, o.amount_yen, o.shipping_yen, o.ship_name, o.ship_address, o.ship_method, o.ship_warning, d.name AS product_name, s.name AS shop_name
       FROM orders o JOIN drafts d ON d.id = o.draft_id JOIN shops s ON s.id = o.shop_id ORDER BY o.id DESC LIMIT 50`,
    )
    .all();
  return Response.json({ me: a, users, shops, blocked, orders, payment_terms: getText("payment_terms") });
}

export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  const b = (await req.json()) as Record<string, unknown>;
  const db = getDb();
  const bad = (error: string) => Response.json({ error }, { status: 400 });

  switch (b.action) {
    case "addUser": {
      const name = String(b.name ?? "").trim();
      const role = b.role === "admin" ? "admin" : "partner";
      if (!name) return bad("名前を入れてください");
      if (!isPin(b.pin)) return bad("暗証番号は数字4けたです");
      const r = db.prepare("INSERT INTO users (name, role, pin_hash) VALUES (?, ?, ?)").run(name, role, hashPin(b.pin));
      return Response.json({ ok: true, code: codeOf(Number(r.lastInsertRowid)) });
    }
    case "setActive": {
      const id = Number(b.id);
      if (id === a.id) return bad("自分自身は止められません");
      db.prepare("UPDATE users SET active = ? WHERE id = ?").run(b.active ? 1 : 0, id);
      if (!b.active) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id); // 止めたらすぐログアウト
      return Response.json({ ok: true });
    }
    case "resetPin": {
      if (!isPin(b.pin)) return bad("暗証番号は数字4けたです");
      db.prepare("UPDATE users SET pin_hash = ?, failed = 0, locked_until = NULL WHERE id = ?").run(hashPin(b.pin), Number(b.id));
      return Response.json({ ok: true });
    }
    case "assignShop": {
      const pid = b.partnerId ? Number(b.partnerId) : null;
      if (pid && !db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'partner'").get(pid)) return bad("そのパートナーはいません");
      db.prepare("UPDATE shops SET partner_id = ? WHERE id = ?").run(pid, Number(b.shopId));
      return Response.json({ ok: true });
    }
    case "resetShopPin": {
      // 店主さんが暗証番号を忘れたとき：消して、次にお店のページを開いたときに決め直してもらう
      db.prepare("UPDATE shops SET release_pin_hash = NULL WHERE id = ?").run(Number(b.shopId));
      return Response.json({ ok: true });
    }
    case "setPaymentTerms": {
      const text = String(b.text ?? "").trim();
      if (text.length > 200) return bad("200字までにしてください");
      db.prepare("UPDATE settings SET value = ? WHERE key = 'payment_terms'").run(text);
      return Response.json({ ok: true });
    }
  }
  return bad("不明な操作です");
}
