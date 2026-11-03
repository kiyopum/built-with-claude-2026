"use client";

// ログイン：自分の名前を押して、暗証番号4けた。店主さんはログインしません
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PinPad } from "@/components/PinPad";

type U = { id: number; name: string; role: string };

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const setupKey = params.get("setup") ?? "";
  const [data, setData] = useState<{ users: U[]; setup: boolean } | null>(null);
  const [who, setWho] = useState<U | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [setupName, setSetupName] = useState("");

  useEffect(() => {
    fetch("/api/auth/users")
      .then((r) => r.json())
      .then(setData);
  }, []);

  function go(role: string) {
    // 戻り先は、このサイトの中の道だけ
    const to = next && next.startsWith("/") && !next.startsWith("//") ? next : role === "admin" ? "/admin" : "/hearing";
    setBusy(false);
    router.push(to);
    router.refresh();
  }

  async function login(pin: string) {
    if (!who) return false;
    setBusy(true);
    setError("");
    const r = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ userId: who.id, pin }) });
    const j = await r.json();
    if (!r.ok) {
      setBusy(false);
      setError(j.error);
      return false;
    }
    go(j.user.role);
  }

  async function setup(pin: string) {
    if (!setupName.trim()) {
      setError("先に名前を入れてください");
      return false;
    }
    setBusy(true);
    setError("");
    const r = await apiFetch("/api/auth/setup", { method: "POST", body: JSON.stringify({ name: setupName, pin, key: setupKey }) });
    const j = await r.json();
    if (!r.ok) {
      setBusy(false);
      setError(j.error);
      return false;
    }
    go("admin");
  }

  if (!data) return <p className="text-black/50">読み込み中…</p>;

  if (data.setup) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold">はじめての設定</h1>
        <p className="text-sm text-black/70">まだだれも登録されていません。最初に、YMM の管理者を1人作ります。暗証番号はご自分で決めてください。</p>
        <input className="w-full rounded-xl border border-black/15 p-3 text-base" placeholder="管理者の名前" value={setupName} onChange={(e) => setSetupName(e.target.value)} />
        <PinPad label="暗証番号（数字4けた）を決める" onDone={setup} busy={busy} />
        {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">ログイン</h1>
      {!who ? (
        <>
          <p className="text-black/70">自分の名前を押してください</p>
          <div className="grid gap-3">
            {data.users.map((u) => (
              <button key={u.id} className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 text-left text-lg font-bold active:bg-leaf/10" onClick={() => setWho(u)}>
                {u.name}
                {u.role === "admin" && <span className="ml-2 text-xs font-normal text-black/50">YMM 管理</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-black/50">店主さんはログインしません。リリースのときだけ、パートナーのスマホでお店の暗証番号を入れます。</p>
        </>
      ) : (
        <>
          <button className="text-sm text-leaf" onClick={() => (setWho(null), setError(""))}>
            ← 名前を選び直す
          </button>
          <PinPad label={`${who.name} さんの暗証番号`} onDone={login} busy={busy} />
        </>
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm text-center">{error}</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <LoginInner />
    </Suspense>
  );
}
