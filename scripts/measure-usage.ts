// 費用の見積もり用：Claude を呼ぶ部品を1回ずつ動かし、使った量を YAOBIZ_USAGE_LOG に記録する。
// 手元のダミーのデータ（お店3・商品10）だけを使う。データベースには書き込まない。
//   YAOBIZ_USAGE_LOG=/path/usage.jsonl npx tsx scripts/measure-usage.ts
import { readFileSync, existsSync } from "node:fs";
import { getDb, type Draft, type Shop } from "@/lib/db";
import * as C from "@/lib/claude";
import { loadProductContext } from "@/lib/context";
import { loadPhotos } from "@/lib/files";

const log = process.env.YAOBIZ_USAGE_LOG!;
const lines = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).length : 0);
const results: { name: string; calls: number; ms: number; ok: boolean }[] = [];

async function step(name: string, f: () => Promise<unknown>) {
  const before = lines();
  const t = Date.now();
  let ok = true;
  try {
    await f();
  } catch (e) {
    ok = false;
    console.error(name, (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, 300)); // 記録の書き込みを待つ
  results.push({ name, calls: lines() - before, ms: Date.now() - t, ok });
  console.log(name, ok ? "ok" : "NG", lines() - before, "calls", Date.now() - t, "ms");
}

const db = getDb();
const shop = db.prepare("SELECT * FROM shops WHERE id = 3").get() as Shop;
const draft = db.prepare("SELECT * FROM drafts WHERE id = 10").get() as Draft;
const photos = loadPhotos(10);
const { c, current } = loadProductContext(draft);
const transcript = c.transcript;
const only = process.argv[2]?.split(",");
const want = (n: string) => !only || only.includes(n);

(async () => {
  if (want("findShopWebsite")) await step("findShopWebsite", () => C.findShopWebsite({ name: shop.name, category: shop.category, area: shop.prefecture }));
  if (want("generateShopQuestions")) await step("generateShopQuestions", () => C.generateShopQuestions(shop));
  if (want("summarizeShop")) await step("summarizeShop", () => C.summarizeShop(shop, transcript));
  if (want("researchLaw")) await step("researchLaw", () => C.researchLaw(shop, transcript));
  if (want("analyzeProductPhotos")) await step("analyzeProductPhotos", () => C.analyzeProductPhotos(shop, photos));
  if (want("generateProductDraft")) await step("generateProductDraft", () => C.generateProductDraft(c, photos));
  if (want("reviseDraft")) await step("reviseDraft", () => C.reviseDraft(c, current, "もう少し短くしてください", photos));
  if (want("recheckLegal")) await step("recheckLegal", () => C.recheckLegal(c, current, photos));
  let post: C.SnsPost | null = null;
  if (want("generateSnsPost")) await step("generateSnsPost", async () => (post = await C.generateSnsPost(c, current)));
  if (want("checkSnsPost") && post) await step("checkSnsPost", () => C.checkSnsPost(c, current, post!));
  if (want("makeNudge"))
    await step("makeNudge", () =>
      C.makeNudge({
        gyoji: [{ key: "oseibo", name: "お歳暮", when: "12月上旬〜20日ころ", days: 30, scene: "gift" }],
        name: current.name, kind: "goods", description: current.description, reason: current.recommend_reason, target: current.target_customer,
        photos: photos.length, hasSns: false, shippingIncluded: true, days: 31,
      }),
    );
  if (want("reframeVoice")) await step("reframeVoice", () => C.reframeVoice({ source: "customer", shopName: shop.name, text: "味噌がとてもおいしかったです。ただ箱が少しつぶれて届きました。次は気をつけてほしいです。" }));
  if (want("makeMonthQuestions")) await step("makeMonthQuestions", () => C.makeMonthQuestions("2026-11", [], ["味噌がおいしかった", "ページが見やすい"]));
  if (want("readCheckin"))
    await step("readCheckin", () =>
      C.readCheckin("テスト", [
        { q: "今月、お店の人と話して心に残ったことは？", a: "店主さんが味噌の仕込みの話をうれしそうにしてくれた" },
        { q: "YaoBiz の考え方で、うまく説明できないところは？", a: "取り分の分け方" },
        { q: "来月やってみたいことは？", a: "写真を撮り直す" },
        { q: "よく眠れていますか", a: "まあまあ" },
        { q: "やる気はありますか", a: "ある" },
        { q: "困っていることは", a: "とくにない" },
        { q: "誰かに話したいことは", a: "なし" },
      ]),
    );
  if (want("makeShopBook"))
    await step("makeShopBook", () =>
      C.makeShopBook({ shop, ownerWords: [transcript], products: [{ name: current.name, reason: current.recommend_reason, description: current.description }], voices: ["味噌がおいしかった"], replies: [] }),
    );
  if (want("makeCareerNote")) await step("makeCareerNote", () => C.makeCareerNote("テスト", "ヒアリングしたお店: 2\n作った商品ページ: 5\n公開した商品: 3\n紹介の投稿: 2"));
  console.log(JSON.stringify(results));
})();
