// 法律の調査を、お店ごとに1回だけ行って使い回す。
// 質問リストを作った時点で裏で始め、ヒアリングが終わるころには調べ終わっている、という流れにする。
import { getDb, type Shop } from "@/lib/db";
import { researchLaw, type LegalResearch } from "@/lib/claude";

const KEEP_DAYS = 30; // 法律の調査結果を使い回す日数

declare global {
  var __yaobizResearch: Map<number, Promise<LegalResearch>> | undefined;
}
const running = (globalThis.__yaobizResearch ??= new Map());

function cached(shopId: number): LegalResearch | null {
  const row = getDb()
    .prepare(
      `SELECT legal_research FROM shops
       WHERE id = ? AND legal_research IS NOT NULL AND legal_researched_at >= datetime('now', 'localtime', ?)`,
    )
    .get(shopId, `-${KEEP_DAYS} days`) as { legal_research: string } | undefined;
  return row ? (JSON.parse(row.legal_research) as LegalResearch) : null;
}

// 調査済みならそれを、調査中ならその終わりを、どちらでもなければ新しく調べて返す
export function getResearch(shop: Shop): Promise<LegalResearch> {
  const hit = cached(shop.id);
  if (hit) return Promise.resolve(hit);
  const inFlight = running.get(shop.id);
  if (inFlight) return inFlight;
  const p = researchLaw(shop)
    .then((r) => {
      getDb()
        .prepare("UPDATE shops SET legal_research = ?, legal_researched_at = datetime('now', 'localtime') WHERE id = ?")
        .run(JSON.stringify(r), shop.id);
      return r;
    })
    .finally(() => running.delete(shop.id));
  running.set(shop.id, p);
  return p;
}
