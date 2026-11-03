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

// ---------- 1) 質問リストを作る（商品が中心。法律上必要な情報も漏れなく聞く） ----------

const QuestionsSchema = z.object({
  questions: z.array(
    z.object({
      group: z.enum(["お店", "商品", "表示・法律"]).describe("質問の種類"),
      question: z.string().describe("店主にそのまま読み上げられる、やさしい話し言葉の質問"),
      why: z.string().describe("この質問で何を聞き出したいか（パートナー向けの短いメモ）"),
    }),
  ),
});
export type Questions = z.infer<typeof QuestionsSchema>;

const QUESTIONS_SYSTEM = `あなたは、地域の小さなお店の商品をネットで売れる形にするためのヒアリングの名人です。
聞き手は販売や法律の専門家ではない主婦のパートナーです。店主の前でそのまま読み上げられる質問を作ります。

ヒアリングの目的は「ネットで売る商品ページ」を作ることです。お店の思いより、商品そのものの情報を優先します。
- 「お店」の質問は2問まで（どんなお店か、看板商品は何か、程度）
- 「商品」の質問を中心に：何を売るか、中身・原材料・産地、作り方、誰が作っているか（自家製か、仕入れ品か、仕入れ先はどこか）、内容量、値段、どんな人が買うか、よく聞かれること、季節や数量の事情
- 「表示・法律」の質問も必ず入れる：ネットで売るとき法律上必要になる情報を聞き漏らさないため。例えば食品なら、商品のラベルに書いてあること（名称・原材料・内容量・賞味期限・保存方法・製造者）、アレルギーのもと、自家製なら保健所の営業許可を持っているか、お客さんが「〜に効く」と言っているような話があるか（言えないことの確認）。業種に合わせて、その商品で法律上必要になる情報を選ぶ
- 「ラベルを写真で撮らせてください」のような、聞くより早い頼み方も使ってよい
- 1問に1つのことだけを聞く。専門用語やカタカナのマーケティング用語は使わない。法律の名前を店主に言う必要はない（why の欄に書く）
- 全部で12問前後。お店 → 商品 → 表示・法律 の順に並べる`;

export async function generateQuestions(shop: { name: string; category: string }): Promise<Questions> {
  return ask(
    QuestionsSchema,
    QUESTIONS_SYSTEM,
    `お店の名前: ${shop.name}\n業種: ${shop.category}\n\nこのお店でヒアリングするための質問を作ってください。`,
  );
}

// ---------- 2) 法律を調べる（国の公式サイトを検索） ----------

// 調べに行く先は国の公式サイトだけ（まとめサイトの古い情報を根拠にしないため）
const OFFICIAL_DOMAINS = [
  "caa.go.jp", // 消費者庁（食品表示法・景品表示法・特定商取引法・健康増進法）
  "mhlw.go.jp", // 厚生労働省（食品衛生法・薬機法）
  "maff.go.jp", // 農林水産省
  "e-gov.go.jp", // 法令の原文
  "meti.go.jp", // 経済産業省
  "nta.go.jp", // 国税庁（酒類）
  "fsc.go.jp", // 食品安全委員会
];

export type LegalResearch = { notes: string; sources: { url: string; title: string }[] };

const RESEARCH_SYSTEM = `あなたは、日本の小さなお店がネットで商品を売るときの法律を調べる担当者です。
お店の業種（ヒアリング内容があればそれも）から、売りそうな商品の種類を見極め、その商品をネットで売るときに関係する日本の法律・ルールを、国の公式サイトで調べます。
自家製の品と仕入れ品の両方があり得るなら、両方の場合を調べます。

調べること（商品に関係するものだけ）:
- 表示のルール：食品なら食品表示法で必要な表示項目（名称、原材料名、添加物、内容量、賞味期限または消費期限、保存方法、製造者等、アレルゲン、栄養成分表示の要否と小規模事業者の例外）
- 作って売るための許可：自家製の食品なら食品衛生法の営業許可・営業届出が要るか
- 言ってはいけないこと：薬機法（食品で病気の治療・予防・体の機能への効果をうたうこと）、健康増進法と景品表示法（根拠のない「日本一」「最高級」など誇大・優良誤認の表示）
- ネット販売そのもののルール：特定商取引法の通信販売の表示義務（これはお店単位のもの）
- その他、酒類・医薬品・動物・刃物など、商品の種類によって特別な許可や禁止があるもの

書き方:
- 箇条書きで、法律の名前、何をしなければならないか（または何をしてはいけないか）、このお店の商品にどう当てはまるか、を短く書く
- 調べて分かったことには出典のURLを付ける。調べても確かめられなかったことは「未確認」と書く
- 推測で断定しない`;

// お店の業種で調べる（質問リストを作った時点で裏で始め、ヒアリング中に終わらせる）
export async function researchLaw(shop: { name: string; category: string }, transcript?: string): Promise<LegalResearch> {
  const hearing = transcript ? `\n\n<hearing>\n${transcript}\n</hearing>` : "";
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `お店の名前: ${shop.name}\n業種: ${shop.category}${hearing}\n\nこのお店の商品をネットで売るときに関係する法律を調べてまとめてください。`,
    },
  ];
  const sources = new Map<string, string>();
  let notes = "";

  // 検索が長引くと途中で一度止まる（pause_turn）ので、続きを頼む。最大4回まで
  for (let i = 0; i < 4; i++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: RESEARCH_SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6, allowed_domains: OFFICIAL_DOMAINS }],
      messages,
      ...FALLBACK,
    });
    for (const b of res.content) {
      if (b.type === "text") notes += b.text;
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) {
          if (r.type === "web_search_result") sources.set(r.url, r.title);
        }
      }
    }
    if (res.stop_reason === "refusal") throw new Error("Claude が法律の調査を控えました。");
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  if (!notes.trim()) throw new Error("法律を調べられませんでした。");
  return { notes: notes.trim(), sources: [...sources].map(([url, title]) => ({ url, title })) };
}

// ---------- 3) ヒアリング内容から商品ドラフトを作る（法律の判定つき） ----------

const LegalSchema = z.object({
  verdict: z
    .enum(["販売できる", "直せば販売できる", "このままでは販売できない"])
    .describe("この商品をこの紹介文でネット販売してよいかの判定"),
  summary: z.string().describe("判定の理由を、店主に向けて1〜2文で"),
  items: z
    .array(
      z.object({
        status: z.enum(["ok", "fix", "ng", "missing"]).describe("ok=問題なし / fix=直せば大丈夫 / ng=してはいけない / missing=情報が足りず確かめられない"),
        topic: z.string().describe("何についての判定か（例：効能の表現、営業許可、原材料の表示）"),
        detail: z.string().describe("店主に向けた説明。何が良くて何がだめか、どうすればよいか"),
        law: z.string().describe("根拠の法律やルールの名前"),
        source_url: z.string().describe("調査結果の出典URL。出典がなければ空文字"),
      }),
    )
    .describe("法律から見たチェック項目。良い点も悪い点も並べる"),
  label_items: z
    .array(
      z.object({
        name: z.string().describe("表示が必要な項目名（例：名称、原材料名、内容量、賞味期限、保存方法、製造者）"),
        value: z.string().nullable().describe("ヒアリングで分かった内容。分からなければ null"),
      }),
    )
    .describe("この商品の種類で表示が必要な項目。食品以外なら、その商品で必要な表示項目"),
});
export type Legal = z.infer<typeof LegalSchema>;

const DraftSchema = z.object({
  name: z.string().describe("商品名。お客さまが一目で中身と魅力が分かる名前"),
  description: z.string().describe("紹介文。200〜350字。店主の言葉や具体的な事実を生かし、法律に沿った表現だけで書く"),
  price_yen: z.number().int().describe("税込の価格案（円）"),
  recommend_reason: z.string().describe("おすすめ理由。なぜこの商品を今売るとよいか、80〜150字"),
  target_customer: z.string().describe("想定するお客さま。どんな人が、どんな場面で買うか"),
  legal: LegalSchema,
});
const DraftsSchema = z.object({
  products: z.array(DraftSchema).describe("2〜3件"),
});
export type DraftInput = z.infer<typeof DraftSchema>;

const DRAFT_SYSTEM = `あなたは、地域の小さなお店の商品をネットで売れる形にする編集者で、法律のチェックも担当します。
パートナーが店主から聞き取った内容（音声の文字起こしやメモ）と、法律の調査メモをもとに、商品ページの下書きを作ります。
下書きは店主が確認し、「このまま公開」「修正を頼む」「却下」を選びます。

紹介文を書くときに守ること:
- ヒアリングに出てきた事実だけを使う。産地・製法・効能・受賞歴・数量などを推測で書き足さない
- 法律の調査メモに沿った表現だけを使う。特に食品で、病気が治る・予防できる・体の機能が良くなる等の効能効果はうたわない（店主やお客さんがそう言っていても書かない）。素材や作り方、食べ方、味の魅力で伝える
- 「日本一」「最高級」など根拠のない最上級表現は使わない
- 価格案は、ヒアリングで値段が出ていればそれを優先する。出ていなければ、内容から無理のない価格を提案する
- 文字起こしの言い間違いや雑音らしき部分は、文脈から自然に読み取る。読み取れないものは使わない
- 1回のヒアリングから、売り物になりそうなものを2〜3件選ぶ。材料が1件分しかなければ、売り方（セット・お試しサイズ等）を変えて2件にしてよい

法律の判定（legal）で守ること:
- 店主が一番知りたいのは「このまま売っていいのか、だめなのか」。良い点（ok）も、直すべき点（fix）も、してはいけない点（ng）も、確かめられない点（missing）も、はっきり分けて並べる
- ヒアリングで言われたが紹介文から外した表現（例：「血圧に効く」）があれば、なぜ書けないかを ng の項目として説明する
- 自家製の食品で営業許可の有無が分からなければ missing にする。許可がないと分かれば ng にして verdict は「このままでは販売できない」にする
- 表示が必要な項目（label_items）は、ヒアリングで分かった内容を入れ、分からないものは null にする。必要な表示がそろっていなければ、その旨を missing の項目にも入れる
- source_url は、調査メモの出典一覧にあるURLだけを使う。合うものがなければ空文字にする
- 断定できないことは断定しない。最終判断は店主（必要なら専門家）がする前提で書く`;

function researchBlock(r: LegalResearch): string {
  const list = r.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
  return `<legal_research>\n${r.notes}\n</legal_research>\n\n<sources>\n${list}\n</sources>`;
}

// 出典一覧にないURLは消す（もっともらしいURLを作ってしまうのを防ぐ）
function keepKnownSources(legal: Legal, r: LegalResearch): Legal {
  const known = new Set(r.sources.map((s) => s.url));
  return { ...legal, items: legal.items.map((it) => ({ ...it, source_url: known.has(it.source_url) ? it.source_url : "" })) };
}

export async function generateDrafts(
  shop: { name: string; category: string },
  transcript: string,
  research: LegalResearch,
): Promise<DraftInput[]> {
  const out = await ask(
    DraftsSchema,
    DRAFT_SYSTEM,
    `お店の名前: ${shop.name}\n業種: ${shop.category}\n\n<hearing>\n${transcript}\n</hearing>\n\n${researchBlock(research)}\n\nこのヒアリングから商品ドラフトを2〜3件、法律の判定つきで作ってください。`,
  );
  return out.products.slice(0, 3).map((p) => ({ ...p, legal: keepKnownSources(p.legal, research) }));
}

// ---------- 4) 店主の一言で作り直す ----------

export async function reviseDraft(
  shop: { name: string; category: string },
  transcript: string,
  research: LegalResearch,
  current: Omit<DraftInput, "legal">,
  note: string,
): Promise<DraftInput> {
  const p = await ask(
    DraftSchema,
    DRAFT_SYSTEM,
    `お店の名前: ${shop.name}\n業種: ${shop.category}\n\n<hearing>\n${transcript}\n</hearing>\n\n${researchBlock(research)}\n\n<current_draft>\n${JSON.stringify(current, null, 2)}\n</current_draft>\n\n<owner_request>\n${note}\n</owner_request>\n\n店主の依頼に合わせて、この1件を作り直し、法律の判定もやり直してください。依頼に関係ない部分はなるべく今のまま残してください。店主の依頼が法律に反する場合（例：効能をうたいたい）は、紹介文には入れず、legal の ng 項目でその理由を説明してください。`,
  );
  return { ...p, legal: keepKnownSources(p.legal, research) };
}
