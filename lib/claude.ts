// Claude を呼ぶ部品。キーは .env の ANTHROPIC_API_KEY（SDK が自動で読む）。
//
// 流れ：
//   お店のヒアリング（1回）  … generateShopQuestions → summarizeShop（お店の紹介。店主がOKすると公開ページに出る）
//   商品のヒアリング（何回でも）… analyzeProductPhotos（写真からラベルを読み、足りないことだけ質問）
//                               → generateProductDraft（商品ページ1件＋法律チェック）
//   店主の確認 … reviseDraft（AIに作り直してもらう）／ recheckLegal（手で直したあと法律チェックだけやり直す）
//   法律の調査 … researchLaw（国の公式サイトだけ検索。お店ごとに使い回す）
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

type UserContent = string | Anthropic.Beta.BetaContentBlockParam[];

async function ask<T extends z.ZodType>(schema: T, system: string, user: UserContent): Promise<z.infer<T>> {
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

// 写真（JPEG）を Claude に渡す形にする
export type Photo = { data: Buffer; mime: string };
function imageBlocks(photos: Photo[]): Anthropic.Beta.BetaContentBlockParam[] {
  return photos.slice(0, 6).map((p) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: (p.mime === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg", data: p.data.toString("base64") },
  }));
}

type ShopInfo = { name: string; category: string; philosophy_text?: string | null };
function shopBlock(shop: ShopInfo): string {
  const about = shop.philosophy_text ? `\nお店の紹介（お店のヒアリングでまとめたもの）:\n${shop.philosophy_text}` : "";
  return `お店の名前: ${shop.name}\n業種: ${shop.category}${about}`;
}

const QuestionSchema = z.object({
  group: z.enum(["お店", "商品", "表示・法律"]).describe("質問の種類"),
  question: z.string().describe("店主にそのまま読み上げられる、やさしい話し言葉の質問"),
  why: z.string().describe("この質問で何を聞き出したいか（パートナー向けの短いメモ）"),
});
export type Question = z.infer<typeof QuestionSchema>;

// ---------- 1) お店のヒアリング（理念・思い。1回だけ） ----------

const ShopQuestionsSchema = z.object({ questions: z.array(QuestionSchema) });

const SHOP_QUESTIONS_SYSTEM = `あなたは、地域の小さなお店の「らしさ」を引き出すヒアリングの名人です。
聞き手は主婦のパートナーです。店主の前でそのまま読み上げられる質問を作ります。

このヒアリングでは、個々の商品ではなく「お店そのもの」を聞きます。商品は、あとで写真を撮りながら1つずつ聞きます。
- お店を始めたきっかけ、続けてきた理由、大事にしていること（理念）
- どんな人に、どんな気持ちで届けたいか
- 地域とのつながり、作り手・仕入れ先との関係
- お客さんに言われてうれしかったこと
- これからやりたいこと、ネットで売ることへの期待や不安
- ネット販売のお店情報として必要になる、販売者の名前（屋号だけでなく）・連絡先・送料や返品の考え方も、最後に1〜2問で聞く

はい／いいえで終わらず、エピソードが出てくる聞き方にする。専門用語は使わない。8問前後。group はすべて「お店」（最後の販売者情報だけ「表示・法律」）。`;

export async function generateShopQuestions(shop: ShopInfo) {
  return ask(ShopQuestionsSchema, SHOP_QUESTIONS_SYSTEM, `${shopBlock(shop)}\n\nこのお店の理念や思いを聞くための質問を作ってください。`);
}

const ShopSummarySchema = z.object({
  intro: z.string().describe("公開ページの「このお店について」。250〜400字。店主の言葉を生かし、お客さまに向けて書く"),
  points: z.array(z.string()).describe("商品の紹介文を書くときに生かせる、このお店らしさの要点（3〜5個、各30字以内）"),
});
export type ShopSummary = z.infer<typeof ShopSummarySchema>;

const SHOP_SUMMARY_SYSTEM = `あなたは、地域の小さなお店の思いを、お客さまに伝わる言葉にする編集者です。
パートナーが店主から聞いた話（音声の文字起こしやメモ）から、公開ページに載せる「このお店について」を書きます。店主が確認してから公開されます。
- ヒアリングに出てきた事実と店主の言葉だけを使う。推測で経歴や数字を足さない
- 根拠のない最上級表現（日本一・最高級など）や、病気に効くなどの効能は書かない
- 飾りすぎず、店主の人柄が伝わる、あたたかく素直な文にする
- 販売者の名前・住所・電話などの事務的な情報は intro に入れない`;

export async function summarizeShop(shop: ShopInfo, transcript: string, current?: string, note?: string) {
  const revise = current ? `\n\n<current_intro>\n${current}\n</current_intro>\n\n<owner_request>\n${note ?? ""}\n</owner_request>\n\n店主の依頼に合わせて書き直してください。` : "";
  return ask(
    ShopSummarySchema,
    SHOP_SUMMARY_SYSTEM,
    `${shopBlock({ ...shop, philosophy_text: null })}\n\n<hearing>\n${transcript}\n</hearing>${revise}\n\nこのお店の紹介文を書いてください。`,
  );
}

// ---------- 2) 商品の写真を見る（ラベルを読み、足りないことだけ質問する） ----------

const LabelItemSchema = z.object({
  name: z.string().describe("表示項目名（例：名称、原材料名、内容量、賞味期限、保存方法、製造者、アレルゲン）"),
  value: z.string().nullable().describe("写真やヒアリングで分かった内容。分からなければ null"),
});

const PhotoAnalysisSchema = z.object({
  product_guess: z.string().describe("写真から分かる、この商品が何か（例：黒豆茶のティーバッグ、10個入りと思われる）"),
  label_read: z.array(LabelItemSchema).describe("この種類の商品で表示が必要な項目と、写真のラベルから読み取れた内容。読めないものは null"),
  questions: z.array(QuestionSchema).describe("この商品について店主に聞くこと。写真で分かったことは聞かない"),
});
export type PhotoAnalysis = z.infer<typeof PhotoAnalysisSchema>;

const PHOTO_SYSTEM = `あなたは、地域の小さなお店の商品をネットで売れる形にするためのヒアリングの名人で、商品の表示（ラベル）にも詳しい担当者です。
パートナーが撮った商品の写真を見て、
1) この商品が何かを見極め、
2) この種類の商品をネットで売るときに表示が必要な項目について、写真のラベルから読み取れる内容を書き出し（読めない・写っていないものは null）、
3) 店主に聞くべきことを質問にします。

質問を作るときの考え方:
- 写真やラベルで分かったことは聞かない。足りないことだけを聞く
- 「商品」：この商品への思い、こだわり、作り方、誰が作っているか（自家製か仕入れか）、どんな人がどんな場面で買うか、値段、季節や数量の事情
- 「表示・法律」：ラベルで読めなかった必要な表示、アレルギーのもと、自家製なら保健所の営業許可、お客さんが「〜に効く」と言っているような話があるか（言えないことの確認）
- 店主の前でそのまま読み上げられる、やさしい話し言葉。1問に1つ。6〜9問。法律の名前は why に書く
- 写真の文字が読みにくいときは、無理に読まず null にする（推測で埋めない）`;

export async function analyzeProductPhotos(shop: ShopInfo, photos: Photo[]): Promise<PhotoAnalysis> {
  return ask(PhotoAnalysisSchema, PHOTO_SYSTEM, [
    ...imageBlocks(photos),
    { type: "text", text: `${shopBlock(shop)}\n\nこの写真の商品について、表示の読み取りと、店主への質問を作ってください。` },
  ]);
}

// ---------- 3) 法律を調べる（国の公式サイトを検索） ----------

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

// ---------- 4) 商品ページの下書き（1商品＝1件、法律の判定つき） ----------

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
  label_items: z.array(LabelItemSchema).describe("この商品の種類で表示が必要な項目と、その内容"),
});
export type Legal = z.infer<typeof LegalSchema>;

const DraftSchema = z.object({
  name: z.string().describe("商品名。お客さまが一目で中身と魅力が分かる名前"),
  description: z.string().describe("紹介文。200〜350字。店主の言葉や具体的な事実、お店らしさを生かし、法律に沿った表現だけで書く"),
  price_yen: z.number().int().describe("税込の価格案（円）"),
  recommend_reason: z.string().describe("おすすめ理由。なぜこの商品を今売るとよいか、80〜150字"),
  target_customer: z.string().describe("想定するお客さま。どんな人が、どんな場面で買うか"),
  legal: LegalSchema,
});
export type DraftInput = z.infer<typeof DraftSchema>;
export type DraftFields = Omit<DraftInput, "legal">;

const LEGAL_RULES = `法律の判定（legal）で守ること:
- 店主が一番知りたいのは「このまま売っていいのか、だめなのか」。良い点（ok）も、直すべき点（fix）も、してはいけない点（ng）も、確かめられない点（missing）も、はっきり分けて並べる
- 紹介文に、病気の治療・予防や体の機能への効果をうたう表現、根拠のない最上級表現があれば ng にし、verdict は「このままでは販売できない」にする
- ヒアリングで言われたが紹介文から外した表現（例：「血圧に効く」）があれば、なぜ書けないかを ng の項目として説明する（紹介文に入っていなければ verdict は下げなくてよい）
- 自家製の食品で営業許可の有無が分からなければ missing。許可がないと分かれば ng にして verdict は「このままでは販売できない」
- label_items は、写真のラベル・ヒアリングで分かった内容を入れ、分からないものは null。必要な表示がそろっていなければ missing の項目にも入れる
- source_url は、調査メモの出典一覧にあるURLだけを使う。合うものがなければ空文字
- 断定できないことは断定しない。最終判断は店主（必要なら専門家）がする前提で書く`;

const DRAFT_SYSTEM = `あなたは、地域の小さなお店の商品をネットで売れる形にする編集者で、法律のチェックも担当します。
パートナーが撮った商品の写真、写真から読み取った表示、店主から聞いた話（音声の文字起こしやメモ）、お店の紹介、法律の調査メモをもとに、この商品1つの商品ページの下書きを作ります。
下書きは店主が確認し、「このまま公開」「手で直す」「AIに作り直してもらう」「却下」を選びます。

紹介文を書くときに守ること:
- 写真・ラベル・ヒアリングに出てきた事実だけを使う。産地・製法・効能・受賞歴・数量などを推測で書き足さない
- お店の紹介にある思いやらしさを、この商品に関係する範囲で生かす
- 法律の調査メモに沿った表現だけを使う。特に食品で、病気が治る・予防できる・体の機能が良くなる等の効能効果はうたわない（店主やお客さんがそう言っていても書かない）。素材や作り方、食べ方、味の魅力で伝える
- 「日本一」「最高級」など根拠のない最上級表現は使わない
- 価格案は、ヒアリングや写真で値段が分かればそれを優先する。分からなければ、内容から無理のない価格を提案する
- 文字起こしの言い間違いや雑音らしき部分は、文脈から自然に読み取る。読み取れないものは使わない

${LEGAL_RULES}`;

function researchBlock(r: LegalResearch): string {
  const list = r.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
  return `<legal_research>\n${r.notes}\n</legal_research>\n\n<sources>\n${list}\n</sources>`;
}

// 出典一覧にないURLは消す（もっともらしいURLを作ってしまうのを防ぐ）
function keepKnownSources(legal: Legal, r: LegalResearch): Legal {
  const known = new Set(r.sources.map((s) => s.url));
  return { ...legal, items: legal.items.map((it) => ({ ...it, source_url: known.has(it.source_url) ? it.source_url : "" })) };
}

export type ProductContext = {
  shop: ShopInfo;
  transcript: string;
  labelRead: z.infer<typeof LabelItemSchema>[];
  research: LegalResearch;
};

function contextBlock(c: ProductContext): string {
  return `${shopBlock(c.shop)}\n\n<label_read>\n${JSON.stringify(c.labelRead, null, 2)}\n</label_read>\n\n<hearing>\n${c.transcript}\n</hearing>\n\n${researchBlock(c.research)}`;
}

export async function generateProductDraft(c: ProductContext, photos: Photo[]): Promise<DraftInput> {
  const p = await ask(DraftSchema, DRAFT_SYSTEM, [
    ...imageBlocks(photos),
    { type: "text", text: `${contextBlock(c)}\n\nこの商品の商品ページの下書きを、法律の判定つきで1件作ってください。` },
  ]);
  return { ...p, legal: keepKnownSources(p.legal, c.research) };
}

// AI に作り直してもらう（店主の一言）
export async function reviseDraft(c: ProductContext, current: DraftFields, note: string): Promise<DraftInput> {
  const p = await ask(
    DraftSchema,
    DRAFT_SYSTEM,
    `${contextBlock(c)}\n\n<current_draft>\n${JSON.stringify(current, null, 2)}\n</current_draft>\n\n<owner_request>\n${note}\n</owner_request>\n\n店主の依頼に合わせて、この1件を作り直し、法律の判定もやり直してください。依頼に関係ない部分はなるべく今のまま残してください。店主の依頼が法律に反する場合（例：効能をうたいたい）は、紹介文には入れず、legal の ng 項目でその理由を説明してください。`,
  );
  return { ...p, legal: keepKnownSources(p.legal, c.research) };
}

// 店主が手で直したあと、文は一切変えずに法律チェックだけやり直す
const RECHECK_SYSTEM = `あなたは、地域の小さなお店の商品ページを法律の面から確かめる担当者です。
店主が手で直した商品ページ（current_draft）を、写真から読み取った表示・ヒアリング・法律の調査メモに照らして判定します。
商品ページの文は書き換えません。判定（legal）だけを返します。店主が書いた表現に問題があれば、どの言葉が、なぜ、どう直せばよいかを具体的に書きます。

${LEGAL_RULES}`;

export async function recheckLegal(c: ProductContext, current: DraftFields): Promise<Legal> {
  const legal = await ask(
    LegalSchema,
    RECHECK_SYSTEM,
    `${contextBlock(c)}\n\n<current_draft>\n${JSON.stringify(current, null, 2)}\n</current_draft>\n\nこの商品ページを法律の面から判定してください。`,
  );
  return keepKnownSources(legal, c.research);
}
