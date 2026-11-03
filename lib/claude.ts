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

type ShopInfo = {
  name: string;
  category: string;
  philosophy_text?: string | null;
  seller_name?: string | null;
  seller_rep?: string | null;
  seller_address?: string | null;
  seller_phone?: string | null;
  seller_email?: string | null;
};
function shopBlock(shop: ShopInfo): string {
  const about = shop.philosophy_text ? `\nお店の紹介（お店のヒアリングでまとめたもの）:\n${shop.philosophy_text}` : "";
  // 販売者の情報（特定商取引法の表示用）。中身は判定に要らないので、そろっているかどうかだけを伝える
  const seller = (
    [
      ["販売業者名", shop.seller_name],
      ["代表者・責任者", shop.seller_rep],
      ["住所", shop.seller_address],
      ["電話番号", shop.seller_phone],
      ["メールアドレス", shop.seller_email],
    ] as const
  )
    .map(([k, v]) => `${k}=${v ? "登録済み" : "未登録"}`)
    .join("、");
  return `お店の名前: ${shop.name}\n業種: ${shop.category}\n販売者の情報（ネット販売の表示用・お店のページで手入力）: ${seller}${about}`;
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
- 最後に1問だけ、送料や返品の考え方を聞く（group は「表示・法律」）
- 販売者の名前・住所・電話番号・メールアドレスは聞かない（口頭では正確に書き取れないので、名刺の写真か手入力で別に登録する）

はい／いいえで終わらず、エピソードが出てくる聞き方にする。専門用語は使わない。8問前後。group は最後の1問以外「お店」。`;

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
        status: z
          .enum(["ok", "fix", "ng", "missing", "info"])
          .describe("ok=問題なし / ng=法律に反する / fix=法律上、文を直す必要がある / missing=売る前に必ず確かめる法律上の要件 / info=知っておくと安心な参考"),
        topic: z.string().describe("何についての判定か（例：効能の表現、営業許可、原材料の表示）"),
        detail: z.string().describe("店主に向けた説明。何が良くて何がだめか、どうすればよいか"),
        law: z.string().describe("根拠の法律やルールの名前"),
        source_url: z.string().describe("調査結果の出典URL。出典がなければ空文字"),
        quote: z
          .string()
          .describe("商品ページの文（商品名・紹介文・おすすめ理由・こんな方に）の中に問題の言葉があれば、その部分を一字一句そのまま短く抜き出す。文に関係しない項目は空文字"),
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
目的は「小さなお店が、法律を守ったうえで安心して売れるようにすること」。厳しくして売れなくすることではない。
正確さは大事にするが、法律上の問題と、念のための注意・好みの問題を混ぜない。

段階の使い分け（ここが一番大事）:
- ng：法律に反する表現や状態だけ。病気の治療・予防や体の機能への効果をうたう表現、根拠のない最上級表現、許可が必要なのに無いと分かっているとき。ng が1つでもあれば verdict は「このままでは販売できない」
- fix：法律上、文を直す必要があるものだけ（例：誤解を招く表示、必須の表示の書き方の誤り）。言い回しの好みや、もっと良くなる提案は fix にしない
- missing：売る前に必ず確かめる「法律上の要件」で、本当に分かっていないものだけ（例：自家製食品の営業許可の有無、必須表示のうち分からない項目）
- info：一般的な注意や、知っておくと安心なこと（例：保存や配送の工夫、念のため保健所に確かめると安心なこと、お店単位で一度設定すればよい通信販売の表示）。info は verdict に影響させない
- ok：問題ないこと。主なものだけ1〜3個

事実の扱い:
- 商品ページの文に書かれた事実（産地・内容量・日持ち・種類・配送方法など）は、店主やパートナーがお店から聞いて書いたものとして信じる。ヒアリングに出てこないというだけで fix や missing にしない
- ただし写真やラベルと明らかに食い違う場合だけ、missing で「どちらが正しいか確かめてください」と1項目にまとめる
- 販売者の名前・住所・電話・メール、送料・返品・引き渡し時期などの通信販売の表示はお店単位のこと。販売者の情報が登録済みなら ok、足りなければ info に1項目でまとめる（商品ごとに何度も責めない）

項目の数:
- ng・fix・missing は本当に必要なものだけ。似たものは1つにまとめる。全部で（ok と info を含めて）8項目まで
- 何も問題がなければ verdict は「販売できる」。missing だけが残る場合は、その要件が分からないと売れないもの（営業許可など）なら「直せば販売できる」、そうでなければ「販売できる」

そのほか:
- ヒアリングで言われたが紹介文から外した表現（例：「血圧に効く」）は、なぜ書けないかを info で説明する（紹介文に入っていなければ verdict は下げない）
- label_items は、写真のラベル・ヒアリング・商品ページの文で分かった内容を入れ、分からないものは null
- fix・ng の項目で、商品ページの文の中に直すべき言葉があるときは、quote にその言葉を一字一句そのまま入れる。detail には「どう直せばよいか」を具体的に書く
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

// 問題の言葉（quote）が文の中に一字一句ない場合は空にする（画面で「消えました」と誤って出さないため）
function keepRealQuotes(legal: Legal, f: DraftFields | string): Legal {
  const all = typeof f === "string" ? f : [f.name, f.description, f.recommend_reason, f.target_customer].join("\n");
  return { ...legal, items: legal.items.map((it) => ({ ...it, quote: it.quote && all.includes(it.quote) ? it.quote : "" })) };
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
  return { ...p, legal: keepRealQuotes(keepKnownSources(p.legal, c.research), p) };
}

// AI に作り直してもらう（店主の一言）
export async function reviseDraft(c: ProductContext, current: DraftFields, note: string, photos: Photo[]): Promise<DraftInput> {
  const p = await ask(DraftSchema, DRAFT_SYSTEM, [
    ...imageBlocks(photos),
    { type: "text", text: `${contextBlock(c)}\n\n<current_draft>\n${JSON.stringify(current, null, 2)}\n</current_draft>\n\n<owner_request>\n${note}\n</owner_request>\n\n店主の依頼に合わせて、この1件を作り直し、法律の判定もやり直してください。依頼に関係ない部分はなるべく今のまま残してください。店主の依頼が法律に反する場合（例：効能をうたいたい）は、紹介文には入れず、legal の ng 項目でその理由を説明してください。` },
  ]);
  return { ...p, legal: keepRealQuotes(keepKnownSources(p.legal, c.research), p) };
}

// 店主が手で直したあと、文は一切変えずに法律チェックだけやり直す
const RECHECK_SYSTEM = `あなたは、地域の小さなお店の商品ページを法律の面から確かめる担当者です。
店主やパートナーが手で直した商品ページ（current_draft）を、商品の写真（ラベルを含む。写真が差し替えられていれば、新しい写真を正とする）・写真から読み取った表示・ヒアリング・法律の調査メモに照らして判定します。
商品ページの文は書き換えません。判定（legal）だけを返します。店主が書いた表現に問題があれば、どの言葉が、なぜ、どう直せばよいかを具体的に書きます。
手で書き足された事実（産地・内容量・日持ちなど）は、お店に聞いて書いたものとして信じてください。ヒアリングに無いことは問題にしません。

${LEGAL_RULES}`;

export async function recheckLegal(c: ProductContext, current: DraftFields, photos: Photo[]): Promise<Legal> {
  const legal = await ask(LegalSchema, RECHECK_SYSTEM, [
    ...imageBlocks(photos),
    {
      type: "text",
      text: `${contextBlock(c)}\n\n<current_draft>\n${JSON.stringify(current, null, 2)}\n</current_draft>\n\nこの商品ページを法律の面から判定してください。`,
    },
  ]);
  return keepRealQuotes(keepKnownSources(legal, c.research), current);
}

// ---------- 5) 名刺を読む（販売者の情報。読めないところは空のまま。店主・パートナーが手で直す前提） ----------

const CardSchema = z.object({
  seller_name: z.string().nullable().describe("会社名・屋号（販売業者名）"),
  seller_rep: z.string().nullable().describe("代表者または担当者の氏名"),
  seller_address: z.string().nullable().describe("住所（郵便番号があれば含める）"),
  seller_phone: z.string().nullable().describe("電話番号（携帯より固定電話を優先。両方あれば固定電話）"),
  seller_email: z.string().nullable().describe("メールアドレス"),
});
export type CardFields = z.infer<typeof CardSchema>;

export async function readBusinessCard(photos: Photo[]): Promise<CardFields> {
  return ask(
    CardSchema,
    `名刺の写真から、ネット販売で表示する販売者の情報を書き写します。
写っている文字をそのまま書き写すだけにし、推測で補わない。読めない・写っていない項目は null にする。`,
    [...imageBlocks(photos), { type: "text", text: "この名刺から販売者の情報を書き写してください。" }],
  );
}

// ---------- 6) SNS（Instagram カルーセル）の投稿文と、その法律チェック ----------

const SnsSchema = z.object({
  caption: z.string().describe("Instagram の本文。150〜300字。改行で読みやすく。最後に「ご購入はプロフィールのリンクから」"),
  // Instagram のハッシュタグは1投稿5個まで。#PR は画面で必ず足すので、Claude が作るのは4個
  hashtags: z.array(z.string()).describe("ハッシュタグ ちょうど4個。# は付けない。PR は入れない（別に付ける）。地域・商品・食べ方など、探す人が使う言葉"),
  slides: z.object({
    cover: z.string().describe("1枚目（表紙）に載せるひとこと。16字以内"),
    point_title: z.string().describe("2枚目の見出し（こだわり）。12字以内"),
    point_text: z.string().describe("2枚目の本文。70字以内"),
    story_text: z.string().describe("3枚目（お店の思い）の本文。90字以内。店主の言葉を生かす"),
  }),
});
export type SnsPost = z.infer<typeof SnsSchema>;

const SNS_SYSTEM = `あなたは、地域の小さなお店の商品を Instagram で紹介する投稿を作る担当者です。
写真のカルーセル投稿（1枚目：表紙、2枚目：こだわり、3枚目：お店の思い、4枚目：買い方）に載せる短い文と、本文・ハッシュタグを作ります。
- 商品ページの文・お店の紹介に書かれた事実だけを使う。数字や産地などを推測で足さない
- 病気の治療・予防や体の機能への効果をうたう表現、「日本一」「最高級」などの根拠のない最上級表現は使わない（お客さんの声の形でも使わない）
- 押し売りせず、お店の人柄と商品の魅力（素材・作り方・食べ方・季節）で伝える。絵文字は少しだけ
- 投稿するのは店主やパートナー。お店の立場で書く`;

export async function generateSnsPost(c: ProductContext, current: DraftFields): Promise<SnsPost> {
  return ask(
    SnsSchema,
    SNS_SYSTEM,
    `${shopBlock(c.shop)}\n\n<product_page>\n${JSON.stringify(current, null, 2)}\n</product_page>\n\nこの商品の Instagram カルーセル投稿を作ってください。`,
  );
}

export function snsText(p: SnsPost): string {
  return [p.slides.cover, p.slides.point_title, p.slides.point_text, p.slides.story_text, p.caption, p.hashtags.map((h) => `#${h}`).join(" ")].join("\n");
}

const SNS_CHECK_SYSTEM = `あなたは、地域の小さなお店の SNS 投稿を、公開前に法律の面から確かめる担当者です。
投稿の文（post）を、商品ページの文・ヒアリング・法律の調査メモに照らして判定します。文は書き換えず、判定（legal）だけを返します。
SNS の投稿も広告です。効能効果・根拠のない最上級表現・事実と違う表示は、商品ページと同じく問題になります。
表示が必要な項目（label_items）は商品ページで扱うので、ここでは空の配列にしてください。

${LEGAL_RULES}`;

export async function checkSnsPost(c: ProductContext, current: DraftFields, post: SnsPost): Promise<Legal> {
  const text = snsText(post);
  const legal = await ask(
    LegalSchema,
    SNS_CHECK_SYSTEM,
    `${contextBlock(c)}\n\n<product_page>\n${JSON.stringify(current, null, 2)}\n</product_page>\n\n<post>\n${text}\n</post>\n\nこの SNS 投稿を法律の面から判定してください。`,
  );
  return keepRealQuotes(keepKnownSources({ ...legal, label_items: [] }, c.research), text);
}
