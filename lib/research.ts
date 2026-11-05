// 法律の調査を、お店ごとに1回だけ行って使い回す。
// 質問リストを作った時点で裏で始め、ヒアリングが終わるころには調べ終わっている、という流れにする。
//
// いつ調べ直すか（2026-11-05 きよさん）：法律は国のサイトに「○年○月施行」と書いてあり、急には変わらない。
//   だから日数で区切らず、調査に書かれた「施行予定: YYYY-MM-DD」のいちばん早い日が来たら調べ直す。施行予定がなければ調べ直さない。
// 同じ材料なら同じ法律（2026-11-05 きよさん）：ほかのお店の調査で、売る物の種類が同じ（またはその一部）なら、それを使う。
import { getDb, type Shop } from "@/lib/db";
import { findSameLaw, researchLaw, type LegalResearch } from "@/lib/claude";

declare global {
  var __yaobizResearch: Map<number, Promise<LegalResearch>> | undefined;
}
const running = (globalThis.__yaobizResearch ??= new Map());

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD

// 調査の文から「施行予定: YYYY-MM-DD」を拾い、今日より後でいちばん早い日を返す（なければ null＝調べ直さない）
export function nextCheckOf(notes: string): string | null {
  const t = today();
  const dates = [...notes.matchAll(/施行予定[:：]\s*(\d{4})-(\d{2})-(\d{2})/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`).filter((d) => d > t);
  return dates.length ? dates.sort()[0] : null;
}

type Row = { id: number; category: string; legal_research: string; law_next_check: string | null };
const stillValid = (r: { legal_research: string | null; law_next_check: string | null }) => !!r.legal_research && (!r.law_next_check || r.law_next_check > today());

function save(shopId: number, r: LegalResearch, nextCheck: string | null, fromShop: number | null) {
  getDb()
    .prepare("UPDATE shops SET legal_research = ?, legal_researched_at = datetime('now', 'localtime'), law_next_check = ?, law_from_shop = ? WHERE id = ?")
    .run(JSON.stringify(r), nextCheck, fromShop, shopId);
}

// ほかのお店の、まだ有効な調査から使えるものを探す（業種の文字が同じならそのまま、違えば Claude に「売る物の種類が同じか」を聞く）
async function borrow(shop: Shop): Promise<boolean> {
  const rows = (getDb().prepare("SELECT id, category, legal_research, law_next_check FROM shops WHERE id != ? AND legal_research IS NOT NULL ORDER BY legal_researched_at DESC").all(shop.id) as Row[]).filter(stillValid);
  const norm = (s: string) => s.replace(/[\s　（）()]/g, "");
  let hit = rows.find((r) => norm(r.category) === norm(shop.category));
  if (!hit) {
    const cats = [...new Set(rows.map((r) => r.category))].slice(0, 40);
    const i = await findSameLaw(shop.category, cats);
    if (i >= 0) hit = rows.find((r) => r.category === cats[i]);
  }
  if (!hit) return false;
  save(shop.id, JSON.parse(hit.legal_research), hit.law_next_check, hit.id);
  return true;
}

// 調査済みならそれを、調査中ならその終わりを、どちらでもなければ（使い回せる調査がなければ）新しく調べて返す
export function getResearch(shop: Shop): Promise<LegalResearch> {
  const own = getDb().prepare("SELECT legal_research, law_next_check FROM shops WHERE id = ?").get(shop.id) as { legal_research: string | null; law_next_check: string | null };
  if (stillValid(own)) return Promise.resolve(JSON.parse(own.legal_research!) as LegalResearch);
  const inFlight = running.get(shop.id);
  if (inFlight) return inFlight;
  const p = (async () => {
    if (await borrow(shop).catch(() => false)) {
      return JSON.parse((getDb().prepare("SELECT legal_research FROM shops WHERE id = ?").get(shop.id) as { legal_research: string }).legal_research) as LegalResearch;
    }
    const r = await researchLaw(shop);
    save(shop.id, r, nextCheckOf(r.notes), null);
    return r;
  })().finally(() => running.delete(shop.id));
  running.set(shop.id, p);
  return p;
}
