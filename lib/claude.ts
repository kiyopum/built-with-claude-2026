// Claude を呼ぶ部品。キーは .env の ANTHROPIC_API_KEY（SDK が自動で読む）。
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

// 安全判定で断られたときは、サーバー側で自動的に別のモデルに回す
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

async function ask<T extends z.ZodType>(schema: T, system: string, user: string): Promise<z.infer<T>> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: user }],
    ...FALLBACK,
  });
  if (res.stop_reason === "refusal") throw new Error("Claude が応答を控えました。内容を見直してください。");
  if (res.stop_reason === "max_tokens") throw new Error("応答が長すぎて途中で切れました。");
  if (!res.parsed_output) throw new Error("Claude の応答を読み取れませんでした。");
  return res.parsed_output as z.infer<T>;
}

// ---------- 1) 業種から質問リストを作る ----------

const QuestionsSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().describe("店主にそのまま読み上げられる、やさしい話し言葉の質問"),
      why: z.string().describe("この質問で何を聞き出したいか（パートナー向けの短いメモ）"),
    }),
  ),
});
export type Questions = z.infer<typeof QuestionsSchema>;

const QUESTIONS_SYSTEM = `あなたは、地域の小さなお店の「眠っている商品」を掘り起こすヒアリングの名人です。
聞き手は販売の専門家ではない主婦のパートナーです。店主の前でそのまま読み上げられる質問を作ります。

質問を作るときの考え方:
- 店主自身が「当たり前」と思っていて、まだ売り物として打ち出していないものを引き出す
- 商品ページを書くのに必要な材料を漏れなく集める：何を売るか、こだわり・作り方・産地、値段の感覚、どんな人が買っていくか、よく聞かれること、季節や数量の事情
- 1問に1つのことだけを聞く。はい／いいえで終わらず、エピソードが出てくる聞き方にする
- 専門用語やカタカナのマーケティング用語は使わない
- 10問前後。最初は答えやすい質問から始め、だんだん深くする`;

export async function generateQuestions(shop: { name: string; category: string }): Promise<Questions> {
  return ask(
    QuestionsSchema,
    QUESTIONS_SYSTEM,
    `お店の名前: ${shop.name}\n業種: ${shop.category}\n\nこのお店でヒアリングするための質問を作ってください。`,
  );
}

// ---------- 2) ヒアリング内容から商品ドラフトを作る ----------

const DraftSchema = z.object({
  name: z.string().describe("商品名。お客さまが一目で中身と魅力が分かる名前"),
  description: z.string().describe("紹介文。200〜350字。店主の言葉や具体的な事実を生かす"),
  price_yen: z.number().int().describe("税込の価格案（円）"),
  recommend_reason: z.string().describe("おすすめ理由。なぜこの商品を今売るとよいか、80〜150字"),
  target_customer: z.string().describe("想定するお客さま。どんな人が、どんな場面で買うか"),
});
const DraftsSchema = z.object({
  products: z.array(DraftSchema).describe("2〜3件"),
});
export type DraftInput = z.infer<typeof DraftSchema>;

const DRAFT_SYSTEM = `あなたは、地域の小さなお店の商品をネットで売れる形にする編集者です。
パートナーが店主から聞き取った内容（音声の文字起こしやメモ）をもとに、商品ページの下書きを作ります。
下書きは店主が確認し、「このまま公開」「修正を頼む」「却下」を選びます。

守ること:
- ヒアリングに出てきた事実だけを使う。産地・製法・効能・受賞歴・数量などを推測で書き足さない
- 健康食品の場合、病気が治る・予防できる等の効能効果をうたわない（薬機法）。「〜に効く」「〜が改善」は書かない。素材や作り方、食べ方、味の魅力で伝える
- 「日本一」「最高級」など根拠のない最上級表現は使わない
- 価格案は、ヒアリングで値段が出ていればそれを優先する。出ていなければ、内容から無理のない価格を提案する
- 文字起こしの言い間違いや雑音らしき部分は、文脈から自然に読み取る。読み取れないものは使わない
- 1回のヒアリングから、売り物になりそうなものを2〜3件選ぶ。材料が1件分しかなければ、売り方（セット・お試しサイズ等）を変えて2件にしてよい`;

export async function generateDrafts(
  shop: { name: string; category: string },
  transcript: string,
): Promise<DraftInput[]> {
  const out = await ask(
    DraftsSchema,
    DRAFT_SYSTEM,
    `お店の名前: ${shop.name}\n業種: ${shop.category}\n\n<hearing>\n${transcript}\n</hearing>\n\nこのヒアリングから商品ドラフトを2〜3件作ってください。`,
  );
  return out.products.slice(0, 3);
}

// ---------- 3) 店主の一言で作り直す ----------

export async function reviseDraft(
  shop: { name: string; category: string },
  transcript: string,
  current: DraftInput,
  note: string,
): Promise<DraftInput> {
  return ask(
    DraftSchema,
    DRAFT_SYSTEM,
    `お店の名前: ${shop.name}\n業種: ${shop.category}\n\n<hearing>\n${transcript}\n</hearing>\n\n<current_draft>\n${JSON.stringify(current, null, 2)}\n</current_draft>\n\n<owner_request>\n${note}\n</owner_request>\n\n店主の依頼に合わせて、この1件を作り直してください。依頼に関係ない部分はなるべく今のまま残してください。`,
  );
}
