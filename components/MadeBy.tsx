// この商品ができるまで（2026-11-05 きよさん：AI を怖いと思う人にも「決めているのは人」と見えるように）
//   記録があることだけを書く。2026-11-07 きよさん：お客さまには見せない。こちら側（商品の管理ページ）で確かめるもの
import type { Made } from "@/lib/made";

export function MadeBy({ made, svc }: { made: Made; svc: boolean }) {
  const ai = [
    made.heard && "お話から、紹介文の下書きを書きました",
    made.legal && "表示や言葉が法律に合っているか、確かめる手伝いをしました",
    made.sns && "紹介の投稿の下書きを書きました",
  ].filter(Boolean) as string[];
  const human = [
    made.heard && `パートナーが、事業者さんから${svc ? "サービス" : "商品"}のお話を聞きました`,
    made.photos && "写真を撮りました",
    made.pin ? "事業者さんが中身を読んで確かめ、自分の暗証番号で公開しました" : "事業者さんが中身を確かめて、公開しました",
  ].filter(Boolean) as string[];
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
      <div className="text-sm font-bold text-biz">この{svc ? "サービス" : "商品"}のページができるまで（記録）</div>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div className="rounded-xl bg-biz/5 p-3">
          <div className="font-bold text-biz mb-1">🙋 人がしたこと</div>
          <ul className="list-disc pl-5 space-y-1">{human.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        {ai.length > 0 && (
          <div className="rounded-xl bg-black/[0.03] p-3">
            <div className="font-bold text-black/70 mb-1">🤖 AI（Claude）がしたこと</div>
            <ul className="list-disc pl-5 space-y-1">{ai.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
      </div>
      <p className="text-xs text-black/60">AI は手伝いをしました。出すかどうかを決めたのは、事業者さんです。お客さまの商品ページには出ません。</p>
    </section>
  );
}
