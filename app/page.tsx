import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold">眠っている商いを、空いた時間で掘り起こして売る。</h1>
        <p className="text-black/70">パートナーのスマホ1台で、3つのステップ。</p>
        <ol className="grid gap-2 text-sm">
          <li className="rounded-xl bg-white p-3 border border-black/5">
            <b className="text-leaf">1) ヒアリング</b>　事業者と商品の話を聞き、写真を撮る（Claude が商品ページを書く）
          </li>
          <li className="rounded-xl bg-white p-3 border border-black/5">
            <b className="text-leaf">2) 法律チェックと修正</b>　問題の言葉をその場で直す
          </li>
          <li className="rounded-xl bg-white p-3 border border-black/5">
            <b className="text-leaf">3) リリース</b>　事業者さんが見て、事業者さんの暗証番号で公開する
          </li>
        </ol>
      </section>
      <div className="grid gap-3">
        <Link href="/hearing" className="block rounded-2xl bg-white p-5 shadow-sm border border-black/5">
          <div className="text-sm text-leaf font-bold">パートナーの方</div>
          <div className="text-lg font-bold">ログインしてはじめる</div>
        </Link>
        <Link href="/shop" className="block rounded-2xl bg-white p-5 shadow-sm border border-black/5">
          <div className="text-sm text-carrot font-bold">お客さま</div>
          <div className="text-lg font-bold">商品を見る</div>
        </Link>
      </div>
      <p className="text-xs text-black/50">デモのため、事業者名・商品・金額はすべて架空です。</p>
    </div>
  );
}
