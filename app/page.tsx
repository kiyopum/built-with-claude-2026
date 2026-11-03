import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold">眠っている商いを、空いた時間で掘り起こして売る。</h1>
        <p className="text-black/70">
          お店で話を聞く → Claude が商品ページの下書きを作る → 店主が OK → 公開。
        </p>
      </section>
      <div className="grid gap-3">
        <Link href="/hearing" className="block rounded-2xl bg-white p-5 shadow-sm border border-black/5">
          <div className="text-sm text-leaf font-bold">パートナーの方</div>
          <div className="text-lg font-bold">お店でヒアリングする</div>
        </Link>
        <Link href="/drafts" className="block rounded-2xl bg-white p-5 shadow-sm border border-black/5">
          <div className="text-sm text-carrot font-bold">店主の方</div>
          <div className="text-lg font-bold">商品の下書きを確認する</div>
        </Link>
        <Link href="/statement" className="block rounded-2xl bg-white p-5 shadow-sm border border-black/5">
          <div className="text-sm text-sky-700 font-bold">パートナー・YMM</div>
          <div className="text-lg font-bold">成果明細を見る</div>
        </Link>
      </div>
      <p className="text-xs text-black/50">デモのため、店名・商品・金額はすべて架空です。</p>
    </div>
  );
}
