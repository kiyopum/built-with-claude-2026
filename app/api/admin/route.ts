import { connection } from "next/server";
import { getDb, getSetting, getText } from "@/lib/db";
import { thisMonth } from "@/lib/checkin";
import { codeOf, hashPin, isPin, requireAdmin } from "@/lib/auth";
import { ITEM_RATE_LIMIT } from "@/lib/split";
import { removeShopFiles } from "@/lib/files";
import { mailReady } from "@/lib/mail";

// YMM の管理画面：人・事業者の割り当て・止まっている商品・注文
export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  const db = getDb();
  const users = (db.prepare("SELECT id, name, role, active, created_at, rest_month, email FROM users ORDER BY role = 'admin' DESC, id").all() as { id: number; rest_month: string | null }[]).map(({ rest_month, ...u }) => ({
    ...u,
    code: codeOf(u.id),
    resting: rest_month === thisMonth(),
  }));
  const shops = (
    db
      .prepare(
        `SELECT s.id, s.name, s.category, s.partner_id, s.cover_partner_id, s.shipping_yen, s.release_pin_hash IS NOT NULL AS has_pin,
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
      `SELECT o.id, o.created_at, o.amount_yen, o.shipping_yen, o.ship_name, o.ship_address, o.ship_method, o.ship_warning, o.customer_email, d.name AS product_name, s.name AS shop_name
       FROM orders o JOIN drafts d ON d.id = o.draft_id JOIN shops s ON s.id = o.shop_id ORDER BY o.id DESC LIMIT 50`,
    )
    .all();
  return Response.json({ me: a, users, shops, blocked, orders, payment_terms: getText("payment_terms"), nudge_days: getSetting("nudge_days"), notify_email: getText("notify_email"), mail_ready: mailReady() });
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
    case "setDraftRate": {
      // この商品だけの YMM の取り分（空＝種類ごとの既定に戻す）。これからの注文に使う
      const id = Number(b.draftId);
      if (!db.prepare("SELECT 1 FROM drafts WHERE id = ?").get(id)) return bad("商品が見つかりません");
      if (b.rate == null) {
        db.prepare("UPDATE drafts SET ymm_rate = NULL WHERE id = ?").run(id);
        return Response.json({ ok: true });
      }
      const r = Number(b.rate);
      if (!Number.isFinite(r) || r < ITEM_RATE_LIMIT.min || r > ITEM_RATE_LIMIT.max) return bad(`割合は ${ITEM_RATE_LIMIT.min * 100}〜${ITEM_RATE_LIMIT.max * 100}% で入れてください`);
      db.prepare("UPDATE drafts SET ymm_rate = ? WHERE id = ?").run(r, id);
      return Response.json({ ok: true });
    }
    case "assignShop": {
      const pid = b.partnerId ? Number(b.partnerId) : null;
      if (pid && !db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'partner'").get(pid)) return bad("そのパートナーはいません");
      db.prepare("UPDATE shops SET partner_id = ? WHERE id = ?").run(pid, Number(b.shopId));
      return Response.json({ ok: true });
    }
    case "setCover": {
      // 担当がお休みの間に見守る人（空なら YMM 管理が見守る）
      const pid = b.partnerId ? Number(b.partnerId) : null;
      if (pid && !db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'partner' AND active = 1").get(pid)) return bad("そのパートナーはいません");
      db.prepare("UPDATE shops SET cover_partner_id = ? WHERE id = ?").run(pid, Number(b.shopId));
      return Response.json({ ok: true });
    }
    case "deleteShop": {
      // テストややり直しのために、事業者を丸ごと消す（商品・写真・ヒアリング・録音・提案も）。
      // 注文のある事業者は消さない（明細と往復便が壊れるため）。Stripe のテストの商品はそのまま残る
      const id = Number(b.shopId);
      const shop = db.prepare("SELECT id, name FROM shops WHERE id = ?").get(id) as { id: number; name: string } | undefined;
      if (!shop) return bad("事業者が見つかりません");
      const orders = (db.prepare("SELECT COUNT(*) AS n FROM orders WHERE shop_id = ?").get(id) as { n: number }).n;
      if (orders > 0) return bad(`${shop.name} には注文が ${orders} 件あるので消せません（明細が消えてしまうため）。やり直すときは「2_最初からやり直す」で`);
      removeShopFiles(id);
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM product_photos WHERE draft_id IN (SELECT id FROM drafts WHERE shop_id = ?)").run(id);
        db.prepare("DELETE FROM hearing_audio WHERE hearing_id IN (SELECT id FROM hearings WHERE shop_id = ?)").run(id);
        db.prepare("DELETE FROM drafts WHERE shop_id = ?").run(id);
        db.prepare("DELETE FROM hearings WHERE shop_id = ?").run(id);
        db.prepare("UPDATE voices SET shop_id = NULL WHERE shop_id = ?").run(id); // みんなの声は書いた人のものなので残す
        db.prepare("DELETE FROM shops WHERE id = ?").run(id);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return Response.json({ ok: true });
    }
    case "resetShopPin": {
      // 事業者さんが暗証番号を忘れたとき：消して、次に事業者のページを開いたときに決め直してもらう
      db.prepare("UPDATE shops SET release_pin_hash = NULL WHERE id = ?").run(Number(b.shopId));
      return Response.json({ ok: true });
    }
    case "setNudgeDays": {
      const n = Number(b.days);
      if (!Number.isInteger(n) || n < 0 || n > 365) return bad("0〜365 日で入れてください");
      db.prepare("UPDATE settings SET value = ? WHERE key = 'nudge_days'").run(String(n));
      return Response.json({ ok: true });
    }
    case "setUserEmail": {
      // 売れたときの知らせを送る先（パートナーごと）。空にすると送らない
      const email = String(b.email ?? "").trim();
      if (email && !isEmail(email)) return bad("メールアドレスの形で入れてください");
      if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(Number(b.id))) return bad("その人はいません");
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email || null, Number(b.id));
      return Response.json({ ok: true });
    }
    case "setNotifyEmail": {
      // YMM が売れた知らせを受けるアドレス
      const email = String(b.email ?? "").trim();
      if (email && !isEmail(email)) return bad("メールアドレスの形で入れてください");
      db.prepare("UPDATE settings SET value = ? WHERE key = 'notify_email'").run(email);
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

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
}
