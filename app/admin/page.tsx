"use client";

// YMM の管理画面
//   止まっている商品（法律チェックで販売できない）→ YMM が手助けに入る先
//   パートナー：登録・止める・暗証番号の再発行
//   事業者：担当パートナーの割り当て・事業者さんの暗証番号のリセット
//   注文と届け先・支払期日（契約条件）
//   売上・取り分・分け方の設定は「明細」へ
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type User = { id: number; name: string; role: string; active: number; code: string; resting: boolean; email: string | null };
type Shop = { id: number; name: string; category: string; partner_id: number | null; cover_partner_id: number | null; shipping_yen: number | null; has_pin: boolean; published: number; waiting: number };
type Blocked = { id: number; shop_id: number; name: string; shop_name: string; partner_name: string | null; updated_at: string; reasons: string[] };
type Order = { id: number; created_at: string; amount_yen: number; shipping_yen: number; ship_name: string | null; ship_address: string | null; ship_method: string | null; ship_warning: string | null; customer_email: string | null; product_name: string; shop_name: string };
type Data = { me: { id: number }; users: User[]; shops: Shop[]; blocked: Blocked[]; orders: Order[]; payment_terms: string; nudge_days: number; notify_email: string; mail_ready: boolean };

const card = "rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3";
const input = "w-full rounded-xl border border-black/15 p-2.5 text-base";

export default function AdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await apiFetch("/api/admin");
    const j = await r.json();
    if (!r.ok) setError(j.error);
    else setData(j);
  }, []);

  useEffect(() => {
    fetch("/api/admin")
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => (ok ? setData(j) : setError(j.error)));
  }, []);

  async function act(body: Record<string, unknown>, done?: string) {
    setError("");
    setMsg("");
    const r = await apiFetch("/api/admin", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      return false;
    }
    if (done) setMsg(done + (j.code ? `（パートナー番号 ${j.code}）` : ""));
    await load();
    return true;
  }

  if (error && !data) return <p className="rounded-xl bg-red-50 text-red-700 p-3">{error}</p>;
  if (!data) return <p className="text-black/50">読み込み中…</p>;
  const partners = data.users.filter((u) => u.role === "partner" && u.active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">YMM 管理</h1>
        <p className="text-xs text-black/50">
          売上・取り分・分け方の設定は <Link href="/statement" className="text-ai underline">明細</Link> で見られます。
        </p>
      </div>
      {msg && <p className="rounded-xl bg-ai/10 text-ai p-3 text-sm font-bold">{msg}</p>}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      {/* 止まっている商品 */}
      <section className={card}>
        <div className="font-bold">
          法律チェックで止まっている商品 <span className="text-red-600">{data.blocked.length}件</span>
        </div>
        {data.blocked.length === 0 ? (
          <p className="text-sm text-black/60">ありません。</p>
        ) : (
          <ul className="space-y-2">
            {data.blocked.map((b) => (
              <li key={b.id}>
                <Link href={`/hearing/${b.shop_id}/p/${b.id}`} className="block rounded-xl bg-red-50 p-3 text-sm active:opacity-70">
                  <div className="font-bold line-clamp-1">{b.name}</div>
                  <div className="text-xs text-black/60">
                    {b.shop_name}・担当 {b.partner_name ?? "なし"}・{b.updated_at}
                  </div>
                  {b.reasons.length > 0 && <div className="text-xs text-red-700 mt-1">NG：{b.reasons.join("／")}</div>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PrepCard />

      <UsersCard users={data.users} meId={data.me.id} act={act} />

      {/* 事業者 */}
      <section className={card}>
        <div className="font-bold">事業者と担当パートナー</div>
        <ul className="space-y-2">
          {data.shops.map((s) => (
            <li key={s.id} className="rounded-xl bg-black/[0.03] p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <Link href={`/hearing/${s.id}`} className="font-bold underline-offset-2 hover:underline">
                  {s.name}
                </Link>
                <span className="text-xs text-black/50 shrink-0">
                  公開 {s.published}・確認待ち {s.waiting}
                </span>
              </div>
              <div className="text-xs text-black/60">
                送料 {s.shipping_yen == null ? <span className="text-red-600">未設定</span> : `${s.shipping_yen.toLocaleString()}円`}・事業者さんの暗証番号{" "}
                {s.has_pin ? "設定済み" : <span className="text-red-600">未設定</span>}
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-xs shrink-0">担当</span>
                <select
                  className="flex-1 rounded-lg border border-black/15 p-2 bg-white"
                  value={s.partner_id ?? ""}
                  onChange={(e) => act({ action: "assignShop", shopId: s.id, partnerId: e.target.value || null }, `${s.name} の担当を変えました`)}
                >
                  <option value="">（担当なし）</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.code}）
                    </option>
                  ))}
                </select>
              </div>
              {data.users.find((u) => u.id === s.partner_id)?.resting && (
                <div className="flex gap-2 items-center rounded-lg bg-ai/10 p-2">
                  <span className="text-xs shrink-0">🌿 担当がお休み中。見守り</span>
                  <select
                    className="flex-1 rounded-lg border border-black/15 p-2 bg-white"
                    value={s.cover_partner_id ?? ""}
                    onChange={(e) => act({ action: "setCover", shopId: s.id, partnerId: e.target.value || null }, `${s.name} の見守りを変えました`)}
                  >
                    <option value="">YMM 管理が見守る</option>
                    {partners
                      .filter((p) => p.id !== s.partner_id && !p.resting)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}（{p.code}）
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {s.has_pin && (
                <button
                  className="text-xs text-black/50 underline"
                  onClick={() => act({ action: "resetShopPin", shopId: s.id }, `${s.name} の暗証番号を消しました。次に事業者のページを開いたとき、事業者さんに決め直してもらってください`)}
                >
                  事業者さんが暗証番号を忘れたとき：消して決め直してもらう
                </button>
              )}
              <DeleteShop shop={s} act={act} />
            </li>
          ))}
        </ul>
      </section>

      <PaymentTerms initial={data.payment_terms} act={act} />
      <NudgeDays initial={data.nudge_days} act={act} />
      <NotifyEmail initial={data.notify_email} ready={data.mail_ready} act={act} />

      {/* 注文と届け先 */}
      <section className={card}>
        <div className="font-bold">注文と届け先（新しい順に50件）</div>
        {data.orders.length === 0 ? (
          <p className="text-sm text-black/60">まだありません。</p>
        ) : (
          <ul className="space-y-2">
            {data.orders.map((o) => (
              <li key={o.id} className="rounded-xl bg-black/[0.03] p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <b className="line-clamp-1">{o.product_name}</b>
                  <span className="shrink-0">{o.amount_yen.toLocaleString()}円</span>
                </div>
                <div className="text-xs text-black/50">
                  {o.shop_name}・{o.created_at}
                  {o.shipping_yen > 0 && `・うち送料 ${o.shipping_yen.toLocaleString()}円`}
                </div>
                <div className="text-xs mt-1">
                  届け先：{o.ship_name ?? "（なし）"} {o.ship_address ?? ""}
                </div>
                {o.ship_method && <div className="text-xs text-black/50">送り方：{o.ship_method}</div>}
                {o.customer_email && <div className="text-xs text-black/50 break-all">メール：{o.customer_email}</div>}
                {o.ship_warning && <div className="rounded-lg bg-amber-50 text-amber-800 p-2 text-xs mt-1">⚠️ {o.ship_warning}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- パートナー ----------

function UsersCard({ users, meId, act }: { users: User[]; meId: number; act: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"partner" | "admin">("partner");
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [newPin, setNewPin] = useState("");

  return (
    <section className={card}>
      <div className="font-bold">パートナーと管理者</div>
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className={`rounded-xl bg-black/[0.03] p-3 text-sm space-y-2 ${u.active ? "" : "opacity-50"}`}>
            <div className="flex justify-between items-center gap-2">
              <span>
                <b>{u.name}</b>
                <span className="text-xs text-black/50">
                  {" "}
                  {u.role === "admin" ? "YMM 管理" : `パートナー ${u.code}`}
                  {!u.active && "・停止中"}
                  {u.resting && "・🌿 今月お休み"}
                </span>
                {u.role !== "admin" && (
                  <Link href={`/me?user=${u.id}`} className="ml-2 text-xs text-ai underline">
                    歩み
                  </Link>
                )}
              </span>
              <span className="flex gap-2 shrink-0 text-xs">
                <button className="underline text-ai" onClick={() => (setResetFor(resetFor === u.id ? null : u.id), setNewPin(""))}>
                  暗証番号の再発行
                </button>
                {u.id !== meId && (
                  <button
                    className="underline text-black/60"
                    onClick={() => act({ action: "setActive", id: u.id, active: !u.active }, u.active ? `${u.name} さんを止めました` : `${u.name} さんを戻しました`)}
                  >
                    {u.active ? "止める" : "戻す"}
                  </button>
                )}
              </span>
            </div>
            {u.role !== "admin" && <UserEmail user={u} act={act} />}
            {resetFor === u.id && (
              <div className="flex gap-2">
                <input className={input} inputMode="numeric" maxLength={4} placeholder="新しい数字4けた" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
                <button
                  className="rounded-xl bg-ai text-white px-4 font-bold disabled:opacity-40 shrink-0"
                  disabled={newPin.length !== 4}
                  onClick={async () => {
                    if (await act({ action: "resetPin", id: u.id, pin: newPin }, `${u.name} さんの暗証番号を変えました。本人に伝えてください`)) setResetFor(null);
                  }}
                >
                  変える
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-black/5 pt-3 space-y-2">
        <div className="text-sm font-bold text-ai">新しく登録する</div>
        <input className={input} placeholder="名前（例：架空 花子）" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2">
          <input className={input} inputMode="numeric" maxLength={4} placeholder="はじめの暗証番号（数字4けた）" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <select className="rounded-xl border border-black/15 p-2 bg-white shrink-0" value={role} onChange={(e) => setRole(e.target.value as "partner" | "admin")}>
            <option value="partner">パートナー</option>
            <option value="admin">YMM 管理</option>
          </select>
        </div>
        <button
          className="w-full rounded-xl bg-ai text-white py-3 font-bold disabled:opacity-40"
          disabled={!name.trim() || pin.length !== 4}
          onClick={async () => {
            if (await act({ action: "addUser", name, pin, role }, `${name} さんを登録しました`)) {
              setName("");
              setPin("");
            }
          }}
        >
          登録する
        </button>
        <p className="text-xs text-black/50">暗証番号は本人に直接伝えてください（メールやチャットに書かない）。</p>
      </div>
    </section>
  );
}

// ---------- 次の小さな一歩を出すまでの日数 ----------

function NudgeDays({ initial, act }: { initial: number; act: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const [days, setDays] = useState(String(initial));
  return (
    <section className={card}>
      <div className="font-bold">🌱 次の小さな一歩を出すまでの日数</div>
      <p className="text-xs text-black/50">公開からこの日数のあいだ注文のない商品に、事業者のページで「もっと届くように、次の小さな一歩」を出します。0 にすると、注文のない公開中の商品すべてに出ます（デモ用）。</p>
      <div className="flex gap-2 items-center">
        <input className={input} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
        <span className="shrink-0">日</span>
      </div>
      <button className="w-full rounded-xl bg-ai text-white py-3 font-bold disabled:opacity-40" disabled={days === String(initial) || days === ""} onClick={() => act({ action: "setNudgeDays", days: Number(days) }, "日数を保存しました")}>
        保存する
      </button>
    </section>
  );
}

// ---------- 支払期日（契約条件） ----------

function PaymentTerms({ initial, act }: { initial: string; act: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const [text, setText] = useState(initial);
  return (
    <section className={card}>
      <div className="font-bold">パートナーへの支払期日</div>
      <p className="text-xs text-black/50">フリーランス新法で、パートナーに明示が必要です。明細の「契約の条件」にそのまま出ます。</p>
      <input className={input} placeholder="例：月末締め、翌月○日払い" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="w-full rounded-xl bg-ai text-white py-3 font-bold disabled:opacity-40" disabled={text === initial} onClick={() => act({ action: "setPaymentTerms", text }, "支払期日を保存しました")}>
        保存する
      </button>
    </section>
  );
}

// 事前調査：訪問の予定が入った事業者を、事務局がローカルの Claude Code で先に調べる（API を使わない）。手順書は docs/事務局_事前調査.md
type PrepReq = { id: number; name: string; category: string; area: string; visit_on: string; partner_name: string | null };
function PrepCard() {
  const [reqs, setReqs] = useState<PrepReq[] | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch("/api/admin/prep");
    const j = await r.json();
    if (r.ok) setReqs(j.requests);
    else setErr(j.error);
  }, []);
  useEffect(() => {
    fetch("/api/admin/prep")
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => (ok ? setReqs(j.requests) : setErr(j.error)));
  }, []);

  async function download() {
    const r = await apiFetch("/api/admin/prep");
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `事前調査の依頼_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function upload(file: File) {
    setErr("");
    setMsg("");
    setBusy(true);
    let body: unknown;
    try {
      body = JSON.parse(await file.text());
    } catch {
      setBusy(false);
      return setErr("ファイルを読めませんでした（JSON の形になっていません）");
    }
    const r = await apiFetch("/api/admin/prep", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    setMsg([j.done.length ? `取り込みました：${j.done.join("、")}` : "", j.skipped.length ? `取り込めなかったもの：${j.skipped.join("、")}` : ""].filter(Boolean).join("　"));
    await load();
  }

  return (
    <section className={card}>
      <div className="font-bold">
        事前調査を待っている事業者 <span className="text-ai">{reqs?.length ?? "…"}件</span>
      </div>
      <p className="text-xs text-black/60">
        パートナーさんが訪問の予定日を入れて登録した事業者です。手元の Mac の Claude Code で調べて取り込むと、当日は事業者の質問・ホームページ・法律の調査に Claude の API を使いません（事業者1つで約95円＋ホームページを読む分が浮きます）。
        やり方は <code>docs/事務局_事前調査.md</code> にあります。
      </p>
      {reqs && reqs.length > 0 && (
        <ul className="space-y-1 text-sm">
          {reqs.map((q) => (
            <li key={q.id} className="rounded-xl bg-black/[0.03] p-2">
              <b>{q.name}</b>
              <span className="text-xs text-black/60">
                {" "}
                ・{q.category}・📅 {q.visit_on}・担当 {q.partner_name ?? "なし"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="rounded-xl bg-ai text-white px-4 py-2.5 font-bold disabled:opacity-40" disabled={!reqs?.length} onClick={download}>
          1) 依頼のファイルを保存
        </button>
        <label className={`rounded-xl border border-ai text-ai px-4 py-2.5 font-bold cursor-pointer ${busy ? "opacity-40" : ""}`}>
          2) 調べた結果を取り込む
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload(f);
            }}
          />
        </label>
      </div>
      {msg && <p className="rounded-xl bg-ai/10 text-ai p-3 text-sm font-bold">{msg}</p>}
      {err && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{err}</p>}
    </section>
  );
}

// 事業者を消す（テストや登録のやり直し用）。押し間違いを防ぐため2段階。注文のある事業者は API が断る
function DeleteShop({ shop, act }: { shop: Shop; act: (body: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const [arm, setArm] = useState(false);
  if (!arm) {
    return (
      <button className="text-xs text-black/50 underline" onClick={() => setArm(true)}>
        この事業者を消す（テストややり直しのとき）
      </button>
    );
  }
  return (
    <div className="rounded-lg bg-red-50 p-2 space-y-2">
      <p className="text-xs text-red-700">{shop.name} を消します。商品・写真・ヒアリング・録音・提案も消えて、戻せません。注文のある事業者は消せません。</p>
      <div className="flex gap-2">
        <button className="flex-1 rounded-lg bg-red-600 text-white py-2 font-bold" onClick={async () => { if (!(await act({ action: "deleteShop", shopId: shop.id }, `${shop.name} を消しました`))) setArm(false); }}>
          本当に消す
        </button>
        <button className="flex-1 rounded-lg border border-black/15 py-2" onClick={() => setArm(false)}>
          やめる
        </button>
      </div>
    </div>
  );
}

// ---------- 売れたときの知らせ（2026-11-07 きよさん：手配があるので、アプリとメールで必ず知らせる） ----------

function UserEmail({ user, act }: { user: User; act: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const [email, setEmail] = useState(user.email ?? "");
  const same = email.trim() === (user.email ?? "");
  return (
    <div className="flex gap-2 items-center">
      <span className="text-xs shrink-0">✉️ 売れた知らせ</span>
      <input className="flex-1 rounded-lg border border-black/15 p-2 text-sm" type="email" placeholder="メールアドレス（空なら送らない）" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="rounded-lg bg-ai text-white px-3 py-2 text-sm font-bold disabled:opacity-40 shrink-0" disabled={same} onClick={() => act({ action: "setUserEmail", id: user.id, email }, `${user.name} さんの知らせ先を保存しました`)}>
        保存
      </button>
    </div>
  );
}

function NotifyEmail({ initial, ready, act }: { initial: string; ready: boolean; act: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const [email, setEmail] = useState(initial);
  return (
    <section className={card}>
      <div className="font-bold">✉️ 売れたときの知らせ（YMM の受け取り先）</div>
      <p className="text-xs text-black/50">
        商品やサービスが売れると、事業者さん（販売者情報のメール）・担当パートナー（上の欄）・ここのアドレスにメールが届き、事業者のページにも「新しい注文」が出ます。
      </p>
      {!ready && <p className="rounded-xl bg-amber-50 text-amber-800 p-3 text-xs">メールを送る設定（SMTP_URL・MAIL_FROM）がまだサーバーにありません。設定が入るまで、知らせは画面だけです。</p>}
      <input className={input} type="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="w-full rounded-xl bg-ai text-white py-3 font-bold disabled:opacity-40" disabled={email.trim() === initial} onClick={() => act({ action: "setNotifyEmail", email }, "知らせ先を保存しました")}>
        保存する
      </button>
    </section>
  );
}

