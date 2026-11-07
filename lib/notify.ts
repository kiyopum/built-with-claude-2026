// 売れたときの知らせ（2026-11-07 きよさん：手配があるので、アプリとメールで必ず知らせる。セミナーなどのサービスも同じ）
//   送る先：事業者さん（販売者情報のメール）・担当パートナー（users.email）・YMM（settings.notify_email）。
//   メールが送れなくても注文の記録は壊さない。だれに送れたかは orders.notice_json に残し、画面に出す。
import { getDb, getText, type Draft, type Shop } from "@/lib/db";
import { sendMail, mailReady } from "@/lib/mail";
import { nextShipDate, parseShipDays, WEEKDAYS } from "@/lib/shipping";

export type Notice = { at: string; sent: { who: string; ok: boolean; error?: string }[]; skipped?: string };

type OrderRow = {
  id: number; draft_id: number; shop_id: number; quantity: number; amount_yen: number; shipping_yen: number;
  ship_name: string | null; ship_address: string | null; ship_method: string | null; ship_warning: string | null; customer_email: string | null; created_at: string;
};

export async function notifyOrder(orderId: number, origin: string): Promise<Notice> {
  const db = getDb();
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
  const notice: Notice = { at: new Date().toISOString(), sent: [] };
  if (!o) return notice;
  const d = db.prepare("SELECT * FROM drafts WHERE id = ?").get(o.draft_id) as Draft;
  const s = db.prepare("SELECT * FROM shops WHERE id = ?").get(o.shop_id) as Shop & { seller_email: string | null; partner_id: number | null; ship_days: string | null };
  const partner = s.partner_id ? (db.prepare("SELECT name, email FROM users WHERE id = ?").get(s.partner_id) as { name: string; email: string | null } | undefined) : undefined;
  const ymm = getText("notify_email").trim();
  const service = d.kind === "service";
  const yen = (n: number) => `${n.toLocaleString()}円`;

  // 本文（届け先は事業者さんとパートナーが手配に使う。お客さまの連絡先は本文にだけ書き、件名には入れない）
  const lines = [
    `${s.name} の${service ? "サービス" : "商品"}が売れました。`,
    "",
    `${service ? "サービス" : "商品"}：${d.name}`,
    `数量：${o.quantity}`,
    `合計：${yen(o.amount_yen)}${o.shipping_yen ? `（うち送料 ${yen(o.shipping_yen)}）` : ""}`,
    `注文日時：${o.created_at}`,
  ];
  if (service) {
    lines.push("", "【手配】申し込んだ方に、配信の URL や日時をメールで案内してください。", `案内を送る先：${o.ship_name ?? ""} ${o.customer_email ?? "（メールアドレスなし）"}`);
  } else {
    lines.push("", `届け先：${o.ship_name ?? "（なし）"}`, o.ship_address ?? "", o.ship_method ? `送り方：${o.ship_method}` : "");
    const days = parseShipDays(s.ship_days);
    if (days.length && !o.ship_method?.includes("受け取り")) {
      const nd = nextShipDate(new Date(o.created_at.replace(" ", "T")), days);
      if (nd) lines.push(`次の発送日：${nd.getMonth() + 1}/${nd.getDate()}（${WEEKDAYS[nd.getDay()]}）`);
    }
    if (o.ship_warning) lines.push(`⚠ ${o.ship_warning}`);
  }
  lines.push("", `注文の一覧（事業者さんの暗証番号で開きます）：${origin}/hearing/${s.id}`, "", "YaoBiz（株式会社山崎メディアミックス）");
  const subject = `【YaoBiz】${service ? "申し込み" : "注文"}が入りました：${d.name}`;
  const text = lines.filter((l) => l !== undefined).join("\n");

  if (!mailReady()) {
    notice.skipped = "メールの設定がないので、画面の知らせだけです";
  } else {
    const targets = [
      { who: "事業者さん", to: s.seller_email?.trim() || "" },
      { who: partner ? `担当（${partner.name}）` : "担当", to: partner?.email?.trim() || "" },
      { who: "YMM", to: ymm },
    ];
    const seen = new Set<string>();
    for (const t of targets) {
      if (!t.to) {
        notice.sent.push({ who: t.who, ok: false, error: "アドレスが登録されていません" });
        continue;
      }
      if (seen.has(t.to)) continue; // 同じアドレスには1通
      seen.add(t.to);
      const r = await sendMail(t.to, subject, text);
      notice.sent.push({ who: t.who, ok: r.ok, error: r.error });
    }
  }
  db.prepare("UPDATE orders SET notice_json = ? WHERE id = ?").run(JSON.stringify(notice), orderId);
  return notice;
}
