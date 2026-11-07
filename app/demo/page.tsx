"use client";

// 見本の一覧：作った機能を1つずつ開いて確かめるためのページ（ログインした人だけ）
//   リンク先は本物の画面。書いたり押したりすると、テスト用サーバーに本当に記録される
import Link from "next/link";
import { useEffect, useState } from "react";

type Data = {
  role: "admin" | "partner";
  product: { id: number; shop_id: number; name: string; shop_name: string } | null;
  public_product: { id: number; name: string } | null;
  shop: { id: number; name: string } | null;
  order: { id: number; shop_id: number; shop_name: string; token: string } | null;
};
type Item = { title: string; who: string; what: string; look: string[]; links: { href: string; label: string }[]; missing?: string };

export default function DemoPage() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/demo")
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => (ok ? setD(j) : setError(j.error)));
  }, []);
  if (error) return <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>;
  if (!d) return <p className="text-black/50">読み込み中…</p>;

  const p = d.product ?? (d.public_product ? { id: d.public_product.id, shop_id: d.shop?.id ?? 0, name: d.public_product.name, shop_name: "" } : null);
  const s = d.shop;
  const o = d.order;
  const noShop = "事業者を1つ登録すると開けます";
  const items: { group: string; list: Item[] }[] = [
    {
      group: "お客さまが見る画面",
      list: [
        {
          title: "販売ページ（商品の一覧と商品1件）",
          who: "お客さま",
          what: "公開中の商品の一覧と、1件のページ。購入はテスト用の決済です。",
          look: ["送料込みの値段（事業者の県と商品の大きさ・重さが入っているとき）", "届け先を選ぶと「🚚 この送料で、○○から△△まで、人の手で運ばれます」", "発送する曜日を決めた事業者は「📅 発送は毎週○曜日」"],
          links: [{ href: "/shop", label: "商品の一覧" }, ...(p ? [{ href: `/p/${p.id}`, label: `商品ページ（${p.name.slice(0, 14)}…）` }] : [])],
          missing: p ? undefined : "公開中の商品がまだありません",
        },
        {
          title: "事業者さん専用ページ（注文と届け先）",
          who: "事業者さん",
          what: "売れたときのメールのリンクから開き、事業者さんの暗証番号で注文と届け先を見る。ログインなし（2026-11-07）。",
          look: ["暗証番号の前は名前だけ。入れると、注文・届け先・案内を送る先・お客さまの一言", "新しい注文には「新しい」のしるし"],
          links: s ? [{ href: `/hearing/${s.id}`, label: "リンクは事業者のページ「注文と届け先」からコピー" }] : [],
          missing: s ? undefined : noShop,
        },
        {
          title: "ありがとうの往復便（お客さまの画面）",
          who: "お客さま",
          what: "箱のカードの QR を読むと開く画面。事業者さんに一言送れて、事業者のお返事もここで読めます。",
          look: ["書いて「事業者さんにとどける」を押すと、本当に事業者さんに届きます（テスト用サーバーの記録になります）", "みんなの声にも、名前や連絡先を消した形で載ります"],
          links: o ? [{ href: `/t/${o.token}`, label: `お便りの画面（${o.shop_name}の注文）` }] : [],
          missing: o ? undefined : "注文が1件あると開けます（商品ページからテスト決済をしてください）",
        },
      ],
    },
    {
      group: "売るのを手伝う",
      list: [
        {
          title: "投稿サポート「どんな場面に贈る？」",
          who: "パートナー・事業者さん",
          what: "誕生日・母の日など7つの場面から選ぶと、Claude がその場面に合わせて Instagram の投稿と画像を作ります。",
          look: ["場面を選ぶ → 投稿の文と画像ができる", "「次の小さな一歩」が行事（お歳暮・クリスマス・年末の帰省など）に結びつけたときは、その場面を選んだ状態でここが開きます"],
          links: p && s ? [{ href: `/hearing/${p.shop_id}/p/${p.id}/share`, label: "投稿を作る画面" }] : [],
          missing: p && s ? undefined : "公開中の商品があると開けます",
        },
        {
          title: "この商品のページができるまで（人がしたこと／AI がしたこと）",
          who: "パートナー・YMM",
          what: "公開した商品の管理ページに出る記録。AI は手伝い、決めたのは人。お客さまには見せない（2026-11-07）。",
          look: ["「3) リリース」の下に「人がしたこと」「AI（Claude）がしたこと」が並ぶ（記録があることだけ）"],
          links: d.product ? [{ href: `/hearing/${d.product.shop_id}/p/${d.product.id}`, label: "商品の管理ページ" }] : [],
          missing: d.product ? undefined : "公開中の商品がまだありません",
        },
        {
          title: "売れなくても責めない伴走（次の小さな一歩）",
          who: "パートナー・事業者さん",
          what: "公開からしばらく注文のない商品に、Claude が「次の小さな一歩」を1つ出します。ふだんは公開から30日たってから出ます。",
          look: ["このリンクから開くと、日数に関係なく、公開中の商品すべてに「🌱 もっと届くように」が出ます", "「一歩を考える」を押すと Claude が考えます（30秒ほど）", "7〜75日先の行事に合う商品なら、「🎁 お歳暮に向けて、投稿を作る」のようなボタンが出ます"],
          links: s ? [{ href: `/hearing/${s.id}?demo=1`, label: `事業者のページ（${s.name}）` }] : [],
          missing: s ? undefined : noShop,
        },
        {
          title: "発送する曜日",
          who: "パートナー・事業者さん",
          what: "曜日を選ぶと、商品ページと注文に出ます。同じ県で同じ曜日に出している事業者の数も出ます。",
          look: ["事業者のページの「送料」の下にある「📅 発送する曜日」"],
          links: s ? [{ href: `/hearing/${s.id}`, label: `事業者のページ（${s.name}）` }] : [],
          missing: s ? undefined : noShop,
        },
        {
          title: "ありがとうの往復便（カードとお返事）",
          who: "事業者さん",
          what: "箱に入れる QR カードを印刷します。届いたお便りへのお返事は、事業者のページの「注文と届け先」から（事業者さんの暗証番号）。",
          look: ["カードの印刷画面", "事業者のページ →「事業者さん：注文を見る」→ 暗証番号 → お便りとお返事の欄"],
          links: o ? [{ href: `/hearing/${o.shop_id}/card?t=${o.token}`, label: "カードの印刷画面" }, { href: `/hearing/${o.shop_id}`, label: "注文とお返事（暗証番号）" }] : [],
          missing: o ? undefined : "注文が1件あると開けます",
        },
      ],
    },
    {
      group: "事業者のこと",
      list: [
        {
          title: "事業者の言葉の本",
          who: "事業者さん・後を継ぐ人",
          what: "ヒアリングや声から、事業者さんが大事にしてきたことを1冊にまとめます。印刷か PDF で渡します。",
          look: ["「本をまとめる」を押すと Claude がまとめます（30秒〜1分）", "「事業者さんの言葉」は、ヒアリングの文そのままだけが載ります"],
          links: s ? [{ href: `/hearing/${s.id}/book`, label: `言葉の本（${s.name}）` }] : [],
          missing: s ? undefined : noShop,
        },
        {
          title: "ホームページを読む・事業者のヒアリング",
          who: "パートナー",
          what: "事業者の名前と地域で、Claude がホームページの候補を探して読みます。ない店はヒアリングで。",
          look: ["「🔍 さがす」で候補が出る"],
          links: s ? [{ href: `/hearing/${s.id}/about`, label: "事業者のヒアリング" }] : [],
          missing: s ? undefined : noShop,
        },
        {
          title: "サービスを登録（ライブ配信・講座・体験）",
          who: "パートナー",
          what: "送料なし・メールで案内する商品。分け方は既定5割。",
          look: ["写真なしでも話すだけで下書きができる"],
          links: s ? [{ href: `/hearing/${s.id}/new?kind=service`, label: "サービスを追加" }] : [],
          missing: s ? undefined : noShop,
        },
      ],
    },
    {
      group: "人を大事にする",
      list: [
        { title: "みんなの声", who: "スタッフみんな", what: "お褒めと要望を分け合う。きびしい言葉は「もっと未来のために」の形に。", look: ["書くと Claude が整えて載せます"], links: [{ href: "/voices", label: "みんなの声" }] },
        { title: "月1のふり返り", who: "パートナー・山﨑さん", what: "事業の問い3つと気持ちのたしかめ。答えは本人と山﨑さんだけ。", look: d.role === "admin" ? ["「みんなの様子」が山﨑さんの画面", "「自分も答える」で答える側の画面"] : ["答えると Claude から返事が届きます"], links: [{ href: "/checkin", label: "月1のふり返り" }] },
        { title: "わたしの歩み・今月のお休み", who: "パートナー", what: "してきたことの数（順位なし）と、できるようになったこと。お休みは本人が押すだけ。", look: ["管理者は、管理画面の「歩み」から一人ずつ見られます"], links: [{ href: "/me", label: "わたしの歩み" }, ...(d.role === "admin" ? [{ href: "/admin", label: "管理画面" }] : [])] },
        { title: "明細（分け方）", who: "パートナー・YMM", what: "売上の分け方。事業者は売上順でなく登録順で並びます。", look: [], links: [{ href: "/statement", label: "明細" }] },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="text-xl font-bold">🧪 見本の一覧</h1>
        <p className="text-sm text-black/70">作った機能を1つずつ開いて確かめるページです。リンク先は本物の画面なので、書いたり押したりすると、テスト用サーバーに本当に記録されます。</p>
      </section>
      {items.map((g) => (
        <section key={g.group} className="space-y-2">
          <h2 className="font-bold text-leaf">{g.group}</h2>
          {g.list.map((it) => (
            <div key={it.title} className="rounded-2xl bg-white p-4 border border-black/5 space-y-2">
              <div className="flex justify-between gap-2 items-start">
                <b>{it.title}</b>
                <span className="shrink-0 text-[11px] rounded-full bg-black/5 px-2 py-0.5">{it.who}</span>
              </div>
              <p className="text-sm text-black/70">{it.what}</p>
              {it.look.length > 0 && (
                <ul className="text-xs text-black/60 list-disc pl-5 space-y-0.5">
                  {it.look.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {it.links.map((l) => (
                  <Link key={l.href} href={l.href} className="rounded-xl bg-leaf text-white text-sm font-bold px-3 py-2">
                    {l.label} →
                  </Link>
                ))}
              </div>
              {it.missing && <p className="text-xs text-amber-700">{it.missing}</p>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
